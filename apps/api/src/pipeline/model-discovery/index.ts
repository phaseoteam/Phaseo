// Purpose: Run model discovery on a schedule and persist compact state in Supabase.
// Why: Replace filesystem snapshots with durable DB state for Cloudflare Worker cron runs.
// How: Poll provider model endpoints, diff against DB, notify on changes, and prune stale rows.
// Notifications: private operator alerts and public catalog announcements are separate workflows.

import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import {
	asRecord,
	assertSafeDiscoverySnapshot,
	buildProviderApiModelSnapshotDiff,
	canonicalProviderId,
	confirmModelRemovals,
	computeConfiguredModelCoverageFingerprint,
	diffModelIds,
	extractProviderApiModelSnapshot,
	fetchProviderModels,
	getDiscordProviderFamilyId,
	hasDiscordNotifiableChanges,
	hasProviderApiSnapshotValue,
	loadConfiguredProviderModelIds,
	loadLatestConfiguredCoverageState,
	loadLatestDiscordNotificationFingerprint,
	loadPricingPageStates,
	readBindingEnv,
	runPricingMonitorCheck,
	shouldRunPricingMonitor,
	savePricingPageStates,
	summarizeMissingConfiguredProviderModels,
	toBool,
	toInt,
} from "./helpers";
import {
	computePrivateModelDiscoveryFingerprint,
	sendPrivateModelDiscoveryNotification,
} from "./private-model-discovery-notifications";
import {
	buildPricingTableIssueEntries,
	buildCatalogPricingIssueEntries,
	buildProviderPricingIssueEntries,
	buildProviderIssueEntries,
	shouldSyncProviderDiscoveryIssues,
	syncUpstreamDiscoveryIssues,
} from "./github-issues";
import { dispatchProviderCatalogSync, type CatalogSyncDispatchSummary } from "./github-dispatch";
import { fetchPricingTableSnapshots, type PricingTableSnapshot } from "./pricing-tables";
import { MODEL_DISCOVERY_PROVIDERS, type ProviderConfig } from "./providers";
import {
	DEFAULT_MODEL_DISCOVERY_CONCURRENCY,
	mapWithConcurrency,
	normalizeModelDiscoveryConcurrency,
} from "./concurrency";
import {
	runPublicModelAnnouncementCheck,
	type PublicModelAnnouncementSummary,
} from "./public-model-catalog-announcements";

export {
	DEFAULT_MODEL_DISCOVERY_CONCURRENCY,
	MAX_MODEL_DISCOVERY_CONCURRENCY,
	normalizeModelDiscoveryConcurrency,
} from "./concurrency";

type DiscoveryTrigger = "scheduled" | "manual";

type RunArgs = {
	trigger: DiscoveryTrigger;
	source: string;
	scheduledAtIso?: string;
	shardIndex?: number;
	shardCount?: number;
	concurrency?: number;
	notify?: boolean;
	prune?: boolean;
};

type ProviderChange = {
	providerId: string;
	providerName: string;
	previousCount: number;
	currentCount: number;
	added: string[];
	removed: string[];
};

type DiscoveredModel = {
	id: string;
	modelDetails: Record<string, unknown>;
	pricingDetails: unknown | null;
};

type ProviderApiModelSnapshot = {
	contextLength: number | null;
	maxCompletionTokens: number | null;
	pricingDetails: unknown | null;
	pricingFingerprint: string | null;
};

type PricingRuleRow = {
	rule_id: string | null;
	provider_id: string | null;
	api_model_id: string | null;
	capability_id: string | null;
	pricing_plan: string | null;
	meter: string | null;
	price_per_unit: number | string | null;
	currency: string | null;
	effective_from: string | null;
	effective_to: string | null;
	updated_at: string | null;
};

type PricingProviderChange = {
	providerId: string;
	updates: number;
	samples: string[];
};

type PricingCursor = {
	updatedAt: string;
	ruleIdsAtTimestamp: string[];
};

type PricingMonitorSummary = {
	enabled: boolean;
	executed: boolean;
	baselineInitialized: boolean;
	cursorUpdatedAt: string | null;
	ruleIdsAtTimestamp?: string[];
	updatesDetected: number;
	providersChanged: number;
	providerChanges: PricingProviderChange[];
	error?: string | null;
};

type ProviderApiPricingMonitorSummary = {
	enabled: boolean;
	executed: boolean;
	baselineInitialized: boolean;
	modelsWithPricing: number;
	providersWithoutPricing: string[];
	updatesDetected: number;
	providersChanged: number;
	providerChanges: PricingProviderChange[];
	error?: string | null;
};

type ConfiguredModelCoverageMonitorSummary = {
	enabled: boolean;
	executed: boolean;
	providersChecked: number;
	updatesDetected: number;
	providersChanged: number;
	providerChanges: PricingProviderChange[];
	fingerprint: string | null;
	error?: string | null;
};

type ModelDiscoveryReviewQueueSummary = {
	itemsDetected: number;
	error?: string | null;
};

type PricingTableMonitorSummary = {
	enabled: boolean;
	executed: boolean;
	baselineInitialized: boolean;
	sourcesChecked: number;
	updatesDetected: number;
	providerChanges: PricingTableSnapshot[];
	sources: PricingTableSnapshot[];
	errors: string[];
	error?: string | null;
};

type ConfiguredModelCoverageState = {
	fingerprint: string | null;
	fallbackFingerprint: string | null;
};

type ProviderResult =
	| {
			providerId: string;
			providerName: string;
			status: "success";
			modelCount: number;
			durationMs: number;
			change: ProviderChange | null;
	  }
	| {
			providerId: string;
			providerName: string;
			status: "skipped";
			reason: string;
	  }
	| {
			providerId: string;
			providerName: string;
			status: "error";
			reason: string;
			durationMs: number;
	  };

type DiscoveryRunSummary = {
	runId: string;
	trigger: DiscoveryTrigger;
	source: string;
	discoveryConcurrency: number;
	startedAt: string;
	finishedAt: string;
	providersTotal: number;
	providersSuccess: number;
	providersSkipped: number;
	providersError: number;
	changesDetected: number;
	staleModelsDeleted: number;
	results: ProviderResult[];
	changes: ProviderChange[];
	issueSync?: {
		created: number;
		updated: number;
		skipped: boolean;
		reason?: string | null;
		error?: string | null;
	};
	catalogSyncDispatch?: CatalogSyncDispatchSummary & { error?: string | null };
	statePersisted: boolean;
	persistenceDeferredReason?: string | null;
	pricingMonitor: PricingMonitorSummary;
	providerApiPricingMonitor: ProviderApiPricingMonitorSummary;
	pricingTableMonitor: PricingTableMonitorSummary;
	configuredModelCoverageMonitor: ConfiguredModelCoverageMonitorSummary;
	reviewQueue: ModelDiscoveryReviewQueueSummary;
	publicModelAnnouncements: PublicModelAnnouncementSummary;
	notificationFingerprint: string | null;
};

type SupabaseSeenModelRow = {
	provider_id: string;
	model_id: string;
	watch_snapshot?: unknown;
	removal_pending?: boolean;
};

type ConfiguredProviderModelRow = {
	provider_id: string | null;
	provider_model_slug: string | null;
	api_model_id: string | null;
};

type RunStatus = "completed" | "completed_with_errors" | "failed";

const DISCOVERY_TIMEOUT_MS = 30_000;
const DEFAULT_RETENTION_DAYS = 7;
export const DEFAULT_MODEL_DISCOVERY_SHARD_SIZE = 20;
export const MAX_MODEL_DISCOVERY_SHARD_SIZE = 25;
const UPSERT_BATCH_SIZE = 500;
const MAX_DISCORD_LINES = 30;
const MAX_LIST_ITEMS = 8;
const MAX_SUMMARY_MODEL_SAMPLES = 5;
const MAX_PRICING_PROVIDER_LINES = 20;
const MAX_PRICING_SAMPLE_LINES = 6;
const MAX_PRICING_ROWS = 5_000;
const PRICING_PAGE_SIZE = 500;
const SEEN_MODELS_PAGE_SIZE = 1_000;
const RUNS_RETENTION_DAYS = 5;
const PRICING_KEY_PATTERN = /(price|pricing|cost|billing|currency|rate|meter|unit|token)/i;
const PRICING_EXTRACTION_MAX_DEPTH = 4;
const MAX_SAMPLE_TEXT_LENGTH = 180;
const PROVIDER_ID_ALIASES: Record<string, string> = {
	"alibaba-cloud": "alibaba",
	"xai": "spacex-ai",
	"atlas-cloud": "atlascloud",
};
const PROVIDER_API_PRICING_WATCH_PROVIDER_IDS = new Set<string>([
	"ai21",
	"akashml",
	"aion-labs",
	"ambient",
	"arcee-ai",
	"atlascloud",
	"baseten",
	"chutes",
	"cloudflare",
	"crossmodel",
	"deepinfra",
	"digitalocean",
	"empiriolabs",
	"nebius-token-factory",
	"elevenlabs",
	"fastrouter",
	"gmicloud",
	"groq",
	"inception",
	"llmgateway",
	"nextbit",
	"novita",
	"novita-ai",
	"openrouter",
	"orcarouter",
	"ovhcloud",
	"spacex-ai",
	"together",
	"venice",
	"vercel",
	"weights-and-biases",
	"pioneer",
	"poe",
	"requesty",
	"zenmux",
]);

const PROVIDERS: ProviderConfig[] = MODEL_DISCOVERY_PROVIDERS;

const PROVIDER_NAMES_BY_ID = new Map(PROVIDERS.map((provider) => [provider.providerId, provider.providerName]));

export function getModelDiscoveryProviderCount(): number {
	return PROVIDERS.length;
}

export function normalizeModelDiscoveryShardSize(shardSize: number): number {
	const normalized = Math.max(1, Math.floor(shardSize));
	return Math.min(normalized, MAX_MODEL_DISCOVERY_SHARD_SIZE);
}

export function getModelDiscoveryShardCount(shardSize: number): number {
	const normalizedSize = normalizeModelDiscoveryShardSize(shardSize);
	const providerFamilyCount = new Set(
		PROVIDERS.map((provider) => getDiscordProviderFamilyId(provider.providerId))
	).size;
	return Math.max(1, Math.ceil(providerFamilyCount / normalizedSize));
}

function selectProvidersForShard(args: RunArgs): ProviderConfig[] {
	if (args.shardIndex === undefined && args.shardCount === undefined) {
		return PROVIDERS;
	}
	if (args.shardIndex === undefined || args.shardCount === undefined) {
		throw new Error("Both shardIndex and shardCount are required when sharding model discovery");
	}

	const shardIndex = Math.floor(args.shardIndex);
	const shardCount = Math.floor(args.shardCount);
	if (!Number.isFinite(shardIndex) || !Number.isFinite(shardCount)) {
		throw new Error("Invalid shard arguments");
	}
	if (shardCount < 1) throw new Error("shardCount must be >= 1");
	if (shardIndex < 0 || shardIndex >= shardCount) {
		throw new Error(`shardIndex ${shardIndex} out of range for shardCount ${shardCount}`);
	}
	if (shardCount === 1) return PROVIDERS;

	const familyIndexes = new Map<string, number>();
	for (const provider of PROVIDERS) {
		const familyId = getDiscordProviderFamilyId(provider.providerId);
		if (!familyIndexes.has(familyId)) familyIndexes.set(familyId, familyIndexes.size);
	}

	return PROVIDERS.filter((provider) => {
		const familyIndex = familyIndexes.get(getDiscordProviderFamilyId(provider.providerId));
		return familyIndex !== undefined && familyIndex % shardCount === shardIndex;
	});
}

async function insertRunStart(runId: string, args: RunArgs, startedAt: string): Promise<void> {
	const supabase = getSupabaseAdmin();
	const { error } = await supabase.from("model_discovery_runs").insert({
		id: runId,
		trigger: args.trigger,
		source: args.source,
		scheduled_at: args.scheduledAtIso ?? null,
		status: "running",
		started_at: startedAt,
	});
	if (error) throw new Error(error.message || "Failed to insert model discovery run row");
}

function compactSummary(summary: DiscoveryRunSummary, extra: { notificationError?: string | null; error?: string | null } = {}): Record<string, unknown> {
	// Persist only state that later runs read back (fingerprints, cursors,
	// coverage baselines) plus counters for triage. Per-provider result arrays
	// are intentionally not stored.
	return {
		discoveryConcurrency: summary.discoveryConcurrency,
		statePersisted: summary.statePersisted,
		persistenceDeferredReason: summary.persistenceDeferredReason ?? undefined,
		notificationFingerprint: summary.notificationFingerprint ?? undefined,
		pricingMonitor: {
			executed: summary.pricingMonitor.executed,
			baselineInitialized: summary.pricingMonitor.baselineInitialized,
			cursorUpdatedAt: summary.pricingMonitor.cursorUpdatedAt,
			ruleIdsAtTimestamp: summary.pricingMonitor.ruleIdsAtTimestamp ?? [],
			updatesDetected: summary.pricingMonitor.updatesDetected,
			providersChanged: summary.pricingMonitor.providersChanged,
			error: summary.pricingMonitor.error ?? undefined,
		},
		providerApiPricingMonitor: {
			baselineInitialized: summary.providerApiPricingMonitor.baselineInitialized,
			updatesDetected: summary.providerApiPricingMonitor.updatesDetected,
			providersChanged: summary.providerApiPricingMonitor.providersChanged,
			error: summary.providerApiPricingMonitor.error ?? undefined,
		},
		pricingTableMonitor: {
			updatesDetected: summary.pricingTableMonitor.updatesDetected,
			errorsCount: summary.pricingTableMonitor.errors.length,
			error: summary.pricingTableMonitor.error ?? undefined,
		},
		configuredModelCoverageMonitor: {
			executed: summary.configuredModelCoverageMonitor.executed,
			providersChecked: summary.configuredModelCoverageMonitor.providersChecked,
			providerChanges: summary.configuredModelCoverageMonitor.providerChanges.map((provider) => ({
				providerId: provider.providerId,
				updates: provider.updates,
				samples: provider.samples.slice(0, MAX_SUMMARY_MODEL_SAMPLES),
			})),
			fingerprint: summary.configuredModelCoverageMonitor.fingerprint,
			error: summary.configuredModelCoverageMonitor.error ?? undefined,
		},
		reviewQueue: summary.reviewQueue,
		publicModelAnnouncements: summary.publicModelAnnouncements,
		notificationError: extra.notificationError ?? undefined,
		error: extra.error ?? undefined,
	};
}

async function updateRunFinish(summary: DiscoveryRunSummary, status: RunStatus, extra: { notificationError?: string | null; error?: string | null } = {}): Promise<void> {
	const supabase = getSupabaseAdmin();
	const { error } = await supabase
		.from("model_discovery_runs")
		.update({
			status,
			finished_at: summary.finishedAt,
			providers_total: summary.providersTotal,
			providers_success: summary.providersSuccess,
			providers_skipped: summary.providersSkipped,
			providers_error: summary.providersError,
			changes_count: summary.changesDetected,
			stale_models_deleted: summary.staleModelsDeleted,
			summary: compactSummary(summary, extra),
			error: extra.error ?? null,
		})
		.eq("id", summary.runId);
	if (error) throw new Error(error.message || "Failed to update model discovery run row");
}

type SeenModelUpsertRow = {
	provider_id: string;
	provider_name: string;
	model_id: string;
	watch_snapshot: ProviderApiModelSnapshot;
	model_details: null;
	pricing_details: null;
	last_seen_at: string;
	last_run_id: string;
	removal_pending: boolean;
};

type SeenModelDeleteRow = {
	provider_id: string;
	model_id: string;
};

type SeenModelPendingRemovalRow = SeenModelDeleteRow;

type PreviousProviderModels = {
	modelIds: string[];
	pendingRemovalIds: Set<string>;
	providerApiSnapshotByModelId: Map<string, ProviderApiModelSnapshot>;
};

type PreviousModelsState = {
	byProvider: Map<string, PreviousProviderModels>;
	providerApiSnapshotReadyByProvider: Set<string>;
};

type ProviderProcessingResult = {
	result: ProviderResult;
	currentModelIds: string[] | null;
	upsertRows: SeenModelUpsertRow[];
	deleteRows: SeenModelDeleteRow[];
	pendingRemovalRows: SeenModelPendingRemovalRow[];
	change: ProviderChange | null;
	providerApiPricingChange: PricingProviderChange | null;
	providerApiModelsWithPricing: number;
	providerApiPricingBaselineInitialized: boolean;
	providerApiProviderWithoutPricing: boolean;
};

function emptyProviderProcessingResult(result: ProviderResult): ProviderProcessingResult {
	return {
		result,
		currentModelIds: null,
		upsertRows: [],
		deleteRows: [],
		pendingRemovalRows: [],
		change: null,
		providerApiPricingChange: null,
		providerApiModelsWithPricing: 0,
		providerApiPricingBaselineInitialized: false,
		providerApiProviderWithoutPricing: false,
	};
}

async function processProvider(
	provider: ProviderConfig,
	previousState: PreviousModelsState,
	runId: string,
): Promise<ProviderProcessingResult> {
	const requiresApiKey = !["none", "optional_bearer"].includes(provider.authStyle ?? "bearer");
	const apiKey = provider.apiKeyEnv ? readBindingEnv(provider.apiKeyEnv) : null;
	if (requiresApiKey && !apiKey) {
		return emptyProviderProcessingResult({
			providerId: provider.providerId,
			providerName: provider.providerName,
			status: "skipped",
			reason: `Missing env: ${(provider.apiKeyEnv ?? []).join(" | ")}`,
		});
	}

	const hasProviderApiSnapshotBaseline = previousState.providerApiSnapshotReadyByProvider.has(provider.providerId);
	const providerApiPricingBaselineInitialized =
		PROVIDER_API_PRICING_WATCH_PROVIDER_IDS.has(provider.providerId) && !hasProviderApiSnapshotBaseline;
	const providerStarted = Date.now();

	try {
		const discoveredModels = await fetchProviderModels(provider, apiKey);
		const currentModelIds = discoveredModels.map((model) => model.id);
		const previousProviderState = previousState.byProvider.get(provider.providerId);
		const previousModelIds = previousProviderState?.modelIds ?? [];
		assertSafeDiscoverySnapshot(provider.providerId, previousModelIds, currentModelIds);
		const modelIdDiff = diffModelIds(previousModelIds, currentModelIds);
		const { confirmed: removed, provisional: provisionalRemovals } = confirmModelRemovals(
			modelIdDiff.removed,
			previousProviderState?.pendingRemovalIds ?? new Set<string>(),
		);
		const added = modelIdDiff.added;
		const nowIso = new Date().toISOString();
		const upsertRows: SeenModelUpsertRow[] = [];
		const deleteRows: SeenModelDeleteRow[] = removed.map((modelId) => ({
			provider_id: provider.providerId,
			model_id: modelId,
		}));
		const pendingRemovalRows: SeenModelPendingRemovalRow[] = provisionalRemovals.map((modelId) => ({
			provider_id: provider.providerId,
			model_id: modelId,
		}));
		const watchSnapshotsById = new Map<string, ProviderApiModelSnapshot>();
		let providerModelsWithPricing = 0;

		for (const model of discoveredModels) {
			const watchSnapshot = extractProviderApiModelSnapshot(
				provider.providerId,
				model.modelDetails,
				model.pricingDetails,
			);
			watchSnapshotsById.set(model.id, watchSnapshot);
			if (watchSnapshot.pricingFingerprint) providerModelsWithPricing += 1;
			upsertRows.push({
				provider_id: provider.providerId,
				provider_name: provider.providerName,
				model_id: model.id,
				watch_snapshot: watchSnapshot,
				model_details: null,
				pricing_details: null,
				last_seen_at: nowIso,
				last_run_id: runId,
				removal_pending: false,
			});
		}

		let providerApiPricingChange: PricingProviderChange | null = null;
		if (hasProviderApiSnapshotBaseline && PROVIDER_API_PRICING_WATCH_PROVIDER_IDS.has(provider.providerId)) {
			const addedModelIds = new Set(added);
			for (const model of discoveredModels) {
				if (addedModelIds.has(model.id)) continue;
				const previousSnapshot = previousProviderState?.providerApiSnapshotByModelId.get(model.id) ?? {
					contextLength: null,
					maxCompletionTokens: null,
					pricingDetails: null,
					pricingFingerprint: null,
				};
				const currentSnapshot = watchSnapshotsById.get(model.id) ?? extractProviderApiModelSnapshot(
					provider.providerId,
					model.modelDetails,
					model.pricingDetails,
				);
				const snapshotDiff = buildProviderApiModelSnapshotDiff(previousSnapshot, currentSnapshot);
				if (snapshotDiff.length === 0) continue;

				providerApiPricingChange ??= {
					providerId: provider.providerId,
					updates: 0,
					samples: [],
				};
				providerApiPricingChange.updates += 1;
				if (providerApiPricingChange.samples.length < MAX_PRICING_SAMPLE_LINES) {
					providerApiPricingChange.samples.push(`${model.id} | ${snapshotDiff.join("; ")}`);
				}
			}
		}

		const change =
			added.length === 0 && removed.length === 0
				? null
				: {
					providerId: provider.providerId,
					providerName: provider.providerName,
					previousCount: previousModelIds.length,
					currentCount: currentModelIds.length,
					added,
					removed,
				};

		return {
			result: {
				providerId: provider.providerId,
				providerName: provider.providerName,
				status: "success",
				modelCount: currentModelIds.length,
				durationMs: Date.now() - providerStarted,
				change,
			},
			currentModelIds,
			upsertRows,
			deleteRows,
			pendingRemovalRows,
			change,
			providerApiPricingChange,
			providerApiModelsWithPricing: providerModelsWithPricing,
			providerApiPricingBaselineInitialized,
			providerApiProviderWithoutPricing:
				PROVIDER_API_PRICING_WATCH_PROVIDER_IDS.has(provider.providerId) && providerModelsWithPricing === 0,
		};
	} catch (error) {
		return emptyProviderProcessingResult({
			providerId: provider.providerId,
			providerName: provider.providerName,
			status: "error",
			reason: error instanceof Error ? error.message : String(error),
			durationMs: Date.now() - providerStarted,
		});
	}
}

async function upsertModelDiscoveryReviewItems(
	runId: string,
	source: string,
	changes: ProviderChange[],
): Promise<number> {
	const detectedAt = new Date().toISOString();
	const rows = changes.flatMap((change) => [
		...change.added.map((modelId) => ({
			dedupe_key: JSON.stringify([change.providerId, "added", modelId]),
			run_id: runId,
			source,
			provider_id: change.providerId,
			provider_name: change.providerName,
			model_id: modelId,
			change_type: "added" as const,
			details: {
				previousCount: change.previousCount,
				currentCount: change.currentCount,
				detectedAt,
			},
			last_detected_at: detectedAt,
		})),
		...change.removed.map((modelId) => ({
			dedupe_key: JSON.stringify([change.providerId, "removed", modelId]),
			run_id: runId,
			source,
			provider_id: change.providerId,
			provider_name: change.providerName,
			model_id: modelId,
			change_type: "removed" as const,
			details: {
				previousCount: change.previousCount,
				currentCount: change.currentCount,
				detectedAt,
			},
			last_detected_at: detectedAt,
		})),
	]);
	if (rows.length === 0) return 0;

	const supabase = getSupabaseAdmin();
	for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
		const { error } = await supabase.rpc("upsert_model_discovery_review_items", {
			p_rows: rows.slice(index, index + UPSERT_BATCH_SIZE),
		});
		if (error) throw new Error(error.message || "Failed to persist model discovery review items");
	}
	return rows.length;
}

function parseWatchSnapshot(value: unknown): ProviderApiModelSnapshot | null {
	const record = asRecord(value);
	if (!record) return null;
	return {
		contextLength: typeof record.contextLength === "number" && Number.isFinite(record.contextLength)
			? Math.trunc(record.contextLength)
			: null,
		maxCompletionTokens: typeof record.maxCompletionTokens === "number" && Number.isFinite(record.maxCompletionTokens)
			? Math.trunc(record.maxCompletionTokens)
			: null,
		pricingDetails: record.pricingDetails ?? null,
		pricingFingerprint: typeof record.pricingFingerprint === "string" && record.pricingFingerprint.trim()
			? record.pricingFingerprint
			: null,
	};
}

export async function fetchPreviousModelsByProviders(providerIds: string[]): Promise<PreviousModelsState> {
	const map = new Map<string, PreviousProviderModels>();
	for (const providerId of providerIds) {
		map.set(providerId, {
			modelIds: [],
			pendingRemovalIds: new Set<string>(),
			providerApiSnapshotByModelId: new Map<string, ProviderApiModelSnapshot>(),
		});
	}
	if (providerIds.length === 0) {
		return { byProvider: map, providerApiSnapshotReadyByProvider: new Set<string>() };
	}

	const supabase = getSupabaseAdmin();
	const rows: SupabaseSeenModelRow[] = [];
	for (let offset = 0; ; offset += SEEN_MODELS_PAGE_SIZE) {
		const { data, error } = await supabase
			.from("model_discovery_seen_models")
			.select("provider_id,model_id,watch_snapshot,removal_pending")
			.in("provider_id", providerIds)
			.order("provider_id", { ascending: true })
			.order("model_id", { ascending: true })
			.range(offset, offset + SEEN_MODELS_PAGE_SIZE - 1);

		if (error) {
			throw new Error(error.message || "Failed to load previous discovered models");
		}

		const page = (data ?? []) as SupabaseSeenModelRow[];
		rows.push(...page);
		if (page.length < SEEN_MODELS_PAGE_SIZE) break;
	}

	const providerApiSnapshotReadyByProvider = new Set<string>();

	for (const row of rows) {
		if (typeof row.provider_id !== "string" || typeof row.model_id !== "string") continue;
		const state = map.get(row.provider_id);
		if (!state) continue;
		state.modelIds.push(row.model_id);
		if (row.removal_pending === true) state.pendingRemovalIds.add(row.model_id);
		if (PROVIDER_API_PRICING_WATCH_PROVIDER_IDS.has(row.provider_id)) {
			const snapshot = parseWatchSnapshot(row.watch_snapshot);
			if (snapshot) {
				state.providerApiSnapshotByModelId.set(row.model_id, snapshot);
				if (hasProviderApiSnapshotValue(snapshot)) {
					providerApiSnapshotReadyByProvider.add(row.provider_id);
				}
			}
		}
	}

	for (const [, state] of map) {
		state.modelIds.sort((a, b) => a.localeCompare(b));
	}

	return { byProvider: map, providerApiSnapshotReadyByProvider };
}

async function upsertCurrentModels(rows: SeenModelUpsertRow[]): Promise<void> {
	if (rows.length === 0) return;
	const supabase = getSupabaseAdmin();

	for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
		const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
		const { error } = await supabase
			.from("model_discovery_seen_models")
			.upsert(batch, { onConflict: "provider_id,model_id" });
		if (error) throw new Error(error.message || "Failed to persist discovered models");
	}
}

async function deleteRemovedModels(rows: SeenModelDeleteRow[]): Promise<number> {
	if (rows.length === 0) return 0;

	const supabase = getSupabaseAdmin();
	const modelIdsByProvider = new Map<string, string[]>();

	for (const row of rows) {
		const existing = modelIdsByProvider.get(row.provider_id) ?? [];
		existing.push(row.model_id);
		modelIdsByProvider.set(row.provider_id, existing);
	}

	let deletedCount = 0;
	for (const [providerId, modelIds] of modelIdsByProvider.entries()) {
		for (let index = 0; index < modelIds.length; index += UPSERT_BATCH_SIZE) {
			const batch = modelIds.slice(index, index + UPSERT_BATCH_SIZE);
			const { data, error } = await supabase
				.from("model_discovery_seen_models")
				.delete()
				.eq("provider_id", providerId)
				.in("model_id", batch)
				.select("model_id");

			if (error) {
				throw new Error(error.message || "Failed to remove deleted discovered models");
			}

			deletedCount += Array.isArray(data) ? data.length : 0;
		}
	}

	return deletedCount;
}

export async function markPendingModelRemovals(rows: SeenModelPendingRemovalRow[]): Promise<void> {
	if (rows.length === 0) return;
	const supabase = getSupabaseAdmin();
	const modelIdsByProvider = new Map<string, string[]>();
	for (const row of rows) {
		const modelIds = modelIdsByProvider.get(row.provider_id) ?? [];
		modelIds.push(row.model_id);
		modelIdsByProvider.set(row.provider_id, modelIds);
	}
	for (const [providerId, modelIds] of modelIdsByProvider) {
		for (let index = 0; index < modelIds.length; index += UPSERT_BATCH_SIZE) {
			const { error } = await supabase
				.from("model_discovery_seen_models")
				.update({ removal_pending: true, last_seen_at: new Date().toISOString() })
				.eq("provider_id", providerId)
				.in("model_id", modelIds.slice(index, index + UPSERT_BATCH_SIZE));
			if (error) throw new Error(error.message || "Failed to mark provisional model removals");
		}
	}
}

async function pruneOldRows(cutoffIso: string): Promise<number> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("model_discovery_seen_models")
		.delete()
		.lt("last_seen_at", cutoffIso)
		.select("provider_id");
	if (error) throw new Error(error.message || "Failed to prune stale discovered models");
	return Array.isArray(data) ? data.length : 0;
}

async function pruneOldRuns(cutoffIso: string): Promise<void> {
	const supabase = getSupabaseAdmin();
	const { error } = await supabase
		.from("model_discovery_runs")
		.delete()
		.lt("started_at", cutoffIso);
	if (error) throw new Error(error.message || "Failed to prune old model discovery runs");
}

function shouldPruneRunsDaily(args: RunArgs, startedAt: Date): boolean {
	if (args.trigger !== "scheduled") return false;
	if (args.shardIndex !== undefined && args.shardIndex !== 0) return false;
	const anchor = args.scheduledAtIso ? new Date(args.scheduledAtIso) : startedAt;
	if (!Number.isFinite(anchor.getTime())) return false;
	const hour = anchor.getUTCHours();
	const minute = anchor.getUTCMinutes();
	return hour === 0 && minute < 10;
}

export async function runModelDiscoveryJob(args: RunArgs): Promise<DiscoveryRunSummary> {
	const startedAt = new Date();
	const runId = crypto.randomUUID();
	const retentionDays = toInt(readBindingEnv(["MODEL_DISCOVERY_RETENTION_DAYS"]) ?? String(DEFAULT_RETENTION_DAYS), DEFAULT_RETENTION_DAYS);
	const staleCutoff = new Date(startedAt.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
	const runsCutoff = new Date(startedAt.getTime() - RUNS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const shouldPrune = args.prune ?? true;
	const shouldNotify = args.notify ?? true;
	const providers = selectProvidersForShard(args);
	const discoveryConcurrency = normalizeModelDiscoveryConcurrency(
		args.concurrency ??
			toInt(
				readBindingEnv(["MODEL_DISCOVERY_CONCURRENCY"]) ??
					String(DEFAULT_MODEL_DISCOVERY_CONCURRENCY),
				DEFAULT_MODEL_DISCOVERY_CONCURRENCY,
			),
	);
	const pricingEnabled = toBool(readBindingEnv(["PRICING_MONITOR_ENABLED"]) ?? "false", false);
	const pricingExecuted = pricingEnabled && shouldRunPricingMonitor(args);
	const pricingPageExecuted = toBool(readBindingEnv(["PRICING_PAGE_MONITOR_ENABLED"]) ?? "true", true)
		&& shouldRunPricingMonitor(args);

	await insertRunStart(runId, args, startedAt.toISOString());

	try {
		const results: ProviderResult[] = [];
		const changes: ProviderChange[] = [];
		let issueSyncSummary: DiscoveryRunSummary["issueSync"] = {
			created: 0,
			updated: 0,
			skipped: false,
			reason: "not attempted",
		};
		let catalogSyncDispatch: DiscoveryRunSummary["catalogSyncDispatch"] = {
			dispatched: false,
			skipped: true,
			providers: [],
			reason: "not attempted",
		};
		const upsertRows: SeenModelUpsertRow[] = [];
		const deleteRows: SeenModelDeleteRow[] = [];
		const pendingRemovalRows: SeenModelPendingRemovalRow[] = [];
		const discoveredModelIdsByProvider = new Map<string, string[]>();
		const previousState = await fetchPreviousModelsByProviders(providers.map((provider) => provider.providerId));
		const providerApiPricingChangesByProvider = new Map<string, PricingProviderChange>();
		const providerApiProvidersWithoutPricing = new Set<string>();
		let providerApiModelsWithPricing = 0;
		let providerApiPricingBaselineInitialized = false;
		const providerProcessingResults = await mapWithConcurrency(
			providers,
			discoveryConcurrency,
			(provider) => processProvider(provider, previousState, runId),
		);

		// Merge in provider order, not completion order, so stored summaries and
		// notifications stay stable while the network calls run concurrently.
		for (const processed of providerProcessingResults) {
			results.push(processed.result);
			upsertRows.push(...processed.upsertRows);
			deleteRows.push(...processed.deleteRows);
			pendingRemovalRows.push(...processed.pendingRemovalRows);
			if (processed.currentModelIds) {
				const providerId = processed.result.providerId;
				discoveredModelIdsByProvider.set(providerId, processed.currentModelIds);
			}
			if (processed.change) changes.push(processed.change);
			if (processed.providerApiPricingChange) {
				providerApiPricingChangesByProvider.set(
					processed.providerApiPricingChange.providerId,
					processed.providerApiPricingChange,
				);
			}
			providerApiModelsWithPricing += processed.providerApiModelsWithPricing;
			providerApiPricingBaselineInitialized ||= processed.providerApiPricingBaselineInitialized;
			if (processed.providerApiProviderWithoutPricing) {
				providerApiProvidersWithoutPricing.add(processed.result.providerId);
			}
		}

		let reviewQueue: ModelDiscoveryReviewQueueSummary = { itemsDetected: 0 };
		if (changes.length > 0) {
			try {
				reviewQueue.itemsDetected = await upsertModelDiscoveryReviewItems(runId, args.source, changes);
			} catch (error) {
				reviewQueue.error = error instanceof Error ? error.message : String(error);
				console.error("[model-discovery] Review queue persistence failed:", reviewQueue.error);
			}
		}

		let publicModelAnnouncements: PublicModelAnnouncementSummary = {
			enabled: false,
			executed: false,
			baselineInitialized: false,
			detected: 0,
			notified: 0,
			skipped: 0,
			pending: 0,
			error: null,
		};
		// Scheduled release checks run independently each minute so they do not
		// wait for the slower provider discovery sweep to finish.
		if (args.trigger !== "scheduled") {
			try {
				publicModelAnnouncements = await runPublicModelAnnouncementCheck({
					runId,
					notify: shouldNotify,
				});
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				publicModelAnnouncements.error = reason;
				console.error("[model-discovery] Public model announcement check failed:", reason);
			}
		}

		let pricingMonitor: PricingMonitorSummary = {
			enabled: pricingEnabled,
			executed: pricingExecuted,
			baselineInitialized: false,
			cursorUpdatedAt: null,
			updatesDetected: 0,
			providersChanged: 0,
			providerChanges: [],
		};
		let providerApiPricingMonitor: ProviderApiPricingMonitorSummary = {
			enabled: true,
			executed: true,
			baselineInitialized: providerApiPricingBaselineInitialized,
			modelsWithPricing: providerApiModelsWithPricing,
			providersWithoutPricing: Array.from(providerApiProvidersWithoutPricing).sort(),
			updatesDetected: 0,
			providersChanged: 0,
			providerChanges: [],
		};
		let pricingTableMonitor: PricingTableMonitorSummary = {
			enabled: pricingPageExecuted,
			executed: false,
			baselineInitialized: false,
			sourcesChecked: 0,
			updatesDetected: 0,
			providerChanges: [],
			sources: [],
			errors: [],
		};
		let configuredModelCoverageMonitor: ConfiguredModelCoverageMonitorSummary = {
			enabled: true,
			executed: false,
			providersChecked: 0,
			updatesDetected: 0,
			providersChanged: 0,
			providerChanges: [],
			fingerprint: null,
		};

		let pricingPageSnapshotsToSave: PricingTableSnapshot[] = [];
		if (pricingExecuted) {
			try {
				pricingMonitor = await runPricingMonitorCheck();
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				pricingMonitor.error = reason;
				console.error("[model-discovery] Pricing monitor failed:", reason);
			}
		}
		if (pricingPageExecuted) {
			pricingTableMonitor.executed = true;
			try {
				const previousPages = await loadPricingPageStates();
				const previousContentByProvider = new Map(
					Array.from(previousPages.values(), (row) => [row.provider_id, row.content_lines] as const)
				);
				const { snapshots: sources, errors } = await fetchPricingTableSnapshots(previousContentByProvider);
				pricingTableMonitor.sources = sources;
				pricingTableMonitor.errors = errors;
				pricingTableMonitor.sourcesChecked = sources.length;
				pricingTableMonitor.baselineInitialized = sources.some(
					(source) => !previousPages.has(canonicalProviderId(source.providerId))
				);
				pricingTableMonitor.providerChanges = sources.filter((source) => {
					const previous = previousPages.get(canonicalProviderId(source.providerId));
					return Boolean(previous) && previous.fingerprint !== source.fingerprint;
				});
				pricingTableMonitor.updatesDetected = pricingTableMonitor.providerChanges.length;
				// State is persisted only after notifications succeed so a delivery
				// failure never silently swallows a pricing-page change.
				pricingPageSnapshotsToSave = sources;
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				pricingTableMonitor.error = reason;
				console.error("[model-discovery] Pricing table monitor failed:", reason);
			}
		}
		const providerChanges = Array.from(providerApiPricingChangesByProvider.values())
			.sort((a, b) => b.updates - a.updates || a.providerId.localeCompare(b.providerId));
		providerApiPricingMonitor.providerChanges = providerChanges;
		providerApiPricingMonitor.providersChanged = providerChanges.length;
		providerApiPricingMonitor.updatesDetected = providerChanges.reduce(
			(total, providerChange) => total + providerChange.updates,
			0
		);
		if (discoveredModelIdsByProvider.size > 0) {
			configuredModelCoverageMonitor.executed = true;
			configuredModelCoverageMonitor.providersChecked = discoveredModelIdsByProvider.size;
			try {
				const configuredModelIdsByProvider = await loadConfiguredProviderModelIds(
					Array.from(discoveredModelIdsByProvider.keys())
				);
				const providerChanges = summarizeMissingConfiguredProviderModels({
					discoveredModelIdsByProvider,
					configuredModelIdsByProvider,
				});
				configuredModelCoverageMonitor.providerChanges = providerChanges;
				configuredModelCoverageMonitor.providersChanged = providerChanges.length;
				configuredModelCoverageMonitor.updatesDetected = providerChanges.reduce(
					(total, providerChange) => total + providerChange.updates,
					0
				);
				configuredModelCoverageMonitor.fingerprint =
					computeConfiguredModelCoverageFingerprint(providerChanges);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				configuredModelCoverageMonitor.error = reason;
				console.error("[model-discovery] Configured model coverage monitor failed:", reason);
			}
		}

		let configuredModelCoverageNotificationSummary = configuredModelCoverageMonitor;
		if (
			configuredModelCoverageMonitor.executed &&
			!configuredModelCoverageMonitor.error &&
			configuredModelCoverageMonitor.updatesDetected > 0 &&
			configuredModelCoverageMonitor.providerChanges.length > 0
		) {
			try {
				const previousConfiguredCoverage = await loadLatestConfiguredCoverageState(args.source);
				if (previousConfiguredCoverage) {
					const currentFingerprint =
						configuredModelCoverageMonitor.fingerprint ??
						computeConfiguredModelCoverageFingerprint(configuredModelCoverageMonitor.providerChanges);
					const currentFallbackFingerprint = computeConfiguredModelCoverageFingerprint(
						configuredModelCoverageMonitor.providerChanges,
						MAX_SUMMARY_MODEL_SAMPLES
					);
					const changed = previousConfiguredCoverage.fingerprint
						? previousConfiguredCoverage.fingerprint !== currentFingerprint
						: previousConfiguredCoverage.fallbackFingerprint !== currentFallbackFingerprint;
					if (!changed) {
						configuredModelCoverageNotificationSummary = {
							...configuredModelCoverageMonitor,
							updatesDetected: 0,
							providersChanged: 0,
							providerChanges: [],
						};
					}
				}
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				console.error("[model-discovery] Failed to compare configured model coverage state:", reason);
			}
		}

		let notificationError: string | null = null;
		let notificationFingerprint: string | null = null;
		let notificationSummary: {
			delivered: boolean;
			skipped: boolean;
			reason?: string | null;
			error?: string | null;
		} = {
			delivered: false,
			skipped: true,
			reason: shouldNotify ? "not attempted" : "notifications disabled",
		};
		const notificationInput = {
			modelChanges: changes,
			pricing: pricingMonitor,
			providerApiPricing: providerApiPricingMonitor,
			pricingTable: pricingTableMonitor,
			configuredModelCoverage: configuredModelCoverageNotificationSummary,
		};
		const hasNotifiableChanges = hasDiscordNotifiableChanges(notificationInput);
		if (shouldNotify && hasNotifiableChanges) {
			try {
				notificationFingerprint = await computePrivateModelDiscoveryFingerprint(notificationInput);
				let previousFingerprint: string | null = null;
				try {
					previousFingerprint = await loadLatestDiscordNotificationFingerprint(args.source);
				} catch (error) {
					console.error(
						"[model-discovery] Failed to compare Discord notification fingerprint:",
						error instanceof Error ? error.message : String(error),
					);
				}

				if (notificationFingerprint && notificationFingerprint === previousFingerprint) {
					notificationSummary = { delivered: true, skipped: true, reason: "duplicate notification fingerprint" };
					console.log("[model-discovery] Discord notification skipped: duplicate notification fingerprint");
				} else {
					notificationSummary = await sendPrivateModelDiscoveryNotification(notificationInput);
					notificationError = notificationSummary.error ?? null;
					if (!notificationSummary.delivered) notificationFingerprint = null;
				}
			} catch (error) {
				notificationFingerprint = null;
				notificationError = error instanceof Error ? error.message : String(error);
				console.error("[model-discovery] Discord notification failed:", notificationError);
			}
		}

		const requiresNotificationDelivery = shouldNotify && hasNotifiableChanges;
		const notificationDelivered = !requiresNotificationDelivery || notificationSummary.delivered;
		const persistenceDeferredReason = !notificationDelivered
			? notificationError ?? notificationSummary.reason ?? "Discord notification not delivered"
			: null;

		let staleModelsDeleted = 0;
		if (!persistenceDeferredReason) {
			await upsertCurrentModels(upsertRows);
			await markPendingModelRemovals(pendingRemovalRows);
			await deleteRemovedModels(deleteRows);
			if (pricingPageSnapshotsToSave.length > 0) {
				await savePricingPageStates(pricingPageSnapshotsToSave);
			}
			if (shouldPrune) {
				staleModelsDeleted = await pruneOldRows(staleCutoff);
				if (shouldPruneRunsDaily(args, startedAt)) {
					await pruneOldRuns(runsCutoff);
				}
			}
		}

		if (
			changes.length > 0 ||
			pricingMonitor.providerChanges.length > 0 ||
			providerApiPricingMonitor.providerChanges.length > 0 ||
			pricingTableMonitor.providerChanges.length > 0
		) {
			if (!shouldSyncProviderDiscoveryIssues()) {
				issueSyncSummary = {
					created: 0,
					updated: 0,
					skipped: true,
					reason: "disabled by MODEL_DISCOVERY_ISSUE_SYNC_ENABLED",
				};
				console.log("[model-discovery] Provider GitHub issue sync skipped:", issueSyncSummary.reason);
			} else {
				try {
					const detectedAt = new Date().toISOString();
					const issueEntries = [
						...buildProviderIssueEntries({ changes, detectedAt, detectionSource: args.source }),
						...buildCatalogPricingIssueEntries({
							changes: pricingMonitor.providerChanges.map((change) => ({
								...change,
								providerName: PROVIDER_NAMES_BY_ID.get(change.providerId) ?? change.providerId,
							})),
							detectedAt,
							detectionSource: args.source,
						}),
						...buildProviderPricingIssueEntries({
							changes: providerApiPricingMonitor.providerChanges.map((change) => ({
								...change,
								providerName: PROVIDER_NAMES_BY_ID.get(change.providerId) ?? change.providerId,
							})),
							detectedAt,
							detectionSource: args.source,
						}),
						...buildPricingTableIssueEntries({
							changes: pricingTableMonitor.providerChanges,
							detectedAt,
							detectionSource: args.source,
						}),
					];
					issueSyncSummary = await syncUpstreamDiscoveryIssues(issueEntries);
					if (issueSyncSummary.skipped) {
						console.log(
							"[model-discovery] Provider GitHub issue sync skipped:",
							issueSyncSummary.reason ?? "no reason provided"
						);
					} else {
						console.log(
							`[model-discovery] Provider GitHub issue sync complete: created=${issueSyncSummary.created}, updated=${issueSyncSummary.updated}.`
						);
					}
				} catch (error) {
					const reason = error instanceof Error ? error.message : String(error);
					issueSyncSummary = {
						created: 0,
						updated: 0,
						skipped: false,
						error: reason,
					};
					console.error("[model-discovery] Provider GitHub issue sync failed:", reason);
				}
			}
		}

		const catalogSyncProviders = [
			...changes.map((change) => change.providerId),
			...pricingMonitor.providerChanges.map((change) => change.providerId),
			...providerApiPricingMonitor.providerChanges.map((change) => change.providerId),
			...pricingTableMonitor.providerChanges.map((change) => change.providerId),
		];
		try {
			catalogSyncDispatch = persistenceDeferredReason
				? {
					dispatched: false,
					skipped: true,
					providers: [...new Set(catalogSyncProviders)].sort(),
					reason: "discovery state was not persisted",
				}
				: await dispatchProviderCatalogSync(catalogSyncProviders);
			if (catalogSyncDispatch.skipped && catalogSyncProviders.length > 0) {
				console.log("[model-discovery] Provider catalog sync dispatch skipped:", catalogSyncDispatch.reason);
			}
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			catalogSyncDispatch = {
				dispatched: false,
				skipped: false,
				providers: [...new Set(catalogSyncProviders)].sort(),
				error: reason,
			};
			console.error("[model-discovery] Provider catalog sync dispatch failed:", reason);
		}

		const finishedAt = new Date();
		const summary: DiscoveryRunSummary = {
			runId,
			trigger: args.trigger,
			source: args.source,
			discoveryConcurrency,
			startedAt: startedAt.toISOString(),
			finishedAt: finishedAt.toISOString(),
			providersTotal: providers.length,
			providersSuccess: results.filter((result) => result.status === "success").length,
			providersSkipped: results.filter((result) => result.status === "skipped").length,
			providersError: results.filter((result) => result.status === "error").length,
			changesDetected: changes.length,
			staleModelsDeleted,
			results,
			changes,
			issueSync: issueSyncSummary,
			catalogSyncDispatch,
			statePersisted: !persistenceDeferredReason,
			persistenceDeferredReason,
			pricingMonitor,
			providerApiPricingMonitor,
			pricingTableMonitor,
			configuredModelCoverageMonitor,
			reviewQueue,
			publicModelAnnouncements,
			notificationFingerprint,
		};

		const status: RunStatus =
			summary.providersError > 0 ||
			notificationError ||
			Boolean(summary.issueSync?.error) ||
			Boolean(summary.catalogSyncDispatch?.error) ||
			Boolean(summary.persistenceDeferredReason) ||
			Boolean(summary.pricingMonitor.error) ||
			Boolean(summary.providerApiPricingMonitor.error) ||
			Boolean(summary.pricingTableMonitor.error) ||
			summary.pricingTableMonitor.errors.length > 0 ||
			Boolean(summary.configuredModelCoverageMonitor.error) ||
			Boolean(summary.reviewQueue.error) ||
			Boolean(summary.publicModelAnnouncements.error)
				? "completed_with_errors"
				: "completed";
		await updateRunFinish(summary, status, { notificationError });
		return summary;
	} catch (error) {
		const finishedAtIso = new Date().toISOString();
		const reason = error instanceof Error ? error.message : String(error);
		const failedSummary: DiscoveryRunSummary = {
			runId,
			trigger: args.trigger,
			source: args.source,
			discoveryConcurrency,
			startedAt: startedAt.toISOString(),
			finishedAt: finishedAtIso,
			providersTotal: providers.length,
			providersSuccess: 0,
			providersSkipped: 0,
			providersError: 0,
			changesDetected: 0,
			staleModelsDeleted: 0,
			results: [],
			changes: [],
			issueSync: {
				created: 0,
				updated: 0,
				skipped: false,
				error: reason,
			},
			catalogSyncDispatch: {
				dispatched: false,
				skipped: false,
				providers: [],
				error: reason,
			},
			statePersisted: false,
			persistenceDeferredReason: null,
			pricingMonitor: {
				enabled: pricingEnabled,
				executed: false,
				baselineInitialized: false,
				cursorUpdatedAt: null,
				updatesDetected: 0,
				providersChanged: 0,
				providerChanges: [],
			},
			providerApiPricingMonitor: {
				enabled: true,
				executed: false,
				baselineInitialized: false,
				modelsWithPricing: 0,
				providersWithoutPricing: [],
				updatesDetected: 0,
				providersChanged: 0,
				providerChanges: [],
			},
			pricingTableMonitor: {
				enabled: pricingPageExecuted,
				executed: false,
				baselineInitialized: false,
				sourcesChecked: 0,
				updatesDetected: 0,
				providerChanges: [],
				sources: [],
				errors: [],
			},
			configuredModelCoverageMonitor: {
				enabled: true,
				executed: false,
				providersChecked: 0,
				updatesDetected: 0,
				providersChanged: 0,
				providerChanges: [],
				fingerprint: null,
			},
			reviewQueue: { itemsDetected: 0, error: reason },
			publicModelAnnouncements: {
				enabled: false,
				executed: false,
				baselineInitialized: false,
				detected: 0,
				notified: 0,
				skipped: 0,
				pending: 0,
				error: reason,
			},
			notificationFingerprint: null,
		};
		try {
			await updateRunFinish(failedSummary, "failed", { error: reason });
		} catch (updateError) {
			console.error("[model-discovery] Failed to persist failed run status:", updateError);
		}
		throw error;
	}
}
