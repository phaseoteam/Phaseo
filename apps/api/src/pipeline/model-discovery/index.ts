// Purpose: Run model discovery on a schedule and persist compact state in Supabase.
// Why: Replace filesystem snapshots with durable DB state for Cloudflare Worker cron runs.
// How: Poll provider model endpoints, diff against DB, notify on changes, and prune stale rows.

import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import {
	asRecord,
	buildProviderApiModelSnapshotDiff,
	computeConfiguredModelCoverageFingerprint,
	diffModelIds,
	extractProviderApiModelSnapshot,
	fetchProviderModels,
	hasProviderApiSnapshotValue,
	loadConfiguredProviderModelIds,
	loadLatestConfiguredCoverageState,
	readBindingEnv,
	runPricingMonitorCheck,
	sendDiscordNotification,
	shouldNotifyConfiguredModelCoverage,
	shouldRunPricingMonitor,
	summarizeMissingConfiguredProviderModels,
	toBool,
	toInt,
	toPricingFingerprint,
} from "./helpers";
import {
	buildProviderIssueEntries,
	shouldSyncProviderDiscoveryIssues,
	syncUpstreamDiscoveryIssues,
} from "./github-issues";

type DiscoveryTrigger = "scheduled" | "manual";

type RunArgs = {
	trigger: DiscoveryTrigger;
	source: string;
	scheduledAtIso?: string;
	shardIndex?: number;
	shardCount?: number;
	notify?: boolean;
	prune?: boolean;
};

type ProviderConfig = {
	providerId: string;
	providerName: string;
	modelsEndpoint: string;
	pathPrefix?: string;
	modelsPath?: string;
	baseUrlEnv?: string[];
	apiKeyEnv?: string[];
	authStyle?: "bearer" | "anthropic" | "google_api_key_query" | "clarifai_key" | "elevenlabs" | "api_key_authorization" | "none";
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
	statePersisted: boolean;
	persistenceDeferredReason?: string | null;
	pricingMonitor: PricingMonitorSummary;
	providerApiPricingMonitor: ProviderApiPricingMonitorSummary;
	configuredModelCoverageMonitor: ConfiguredModelCoverageMonitorSummary;
};

type SupabaseSeenModelRow = {
	provider_id: string;
	model_id: string;
	model_details?: unknown;
	pricing_details?: unknown;
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
const RUNS_RETENTION_DAYS = 5;
const PRICING_KEY_PATTERN = /(price|pricing|cost|billing|currency|rate|meter|unit|token)/i;
const PRICING_EXTRACTION_MAX_DEPTH = 4;
const MAX_SAMPLE_TEXT_LENGTH = 180;
const PROVIDER_ID_ALIASES: Record<string, string> = {
	"alibaba-cloud": "alibaba",
	"xai": "x-ai",
	"atlas-cloud": "atlascloud",
};
const PROVIDER_API_PRICING_WATCH_PROVIDER_IDS = new Set<string>(["atlascloud", "crofai"]);

const PROVIDERS: ProviderConfig[] = [
	{ providerId: "ai21", providerName: "AI21", modelsEndpoint: "https://api.ai21.com/studio/v1/models", apiKeyEnv: ["AI21_API_KEY"] },
	{ providerId: "akashml", providerName: "AkashML", modelsEndpoint: "https://api.akashml.com/v1/models", apiKeyEnv: ["AKASHML_API_KEY"] },
	{ providerId: "aion-labs", providerName: "AionLabs", modelsEndpoint: "https://api.aionlabs.ai/v1/models", apiKeyEnv: ["AION_LABS_API_KEY"] },
	{
		providerId: "alibaba",
		providerName: "Alibaba Cloud",
		modelsEndpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
		apiKeyEnv: ["ALIBABA_CLOUD_API_KEY"],
	},
	{
		providerId: "anthropic",
		providerName: "Anthropic",
		modelsEndpoint: "https://api.anthropic.com/v1/models",
		apiKeyEnv: ["ANTHROPIC_API_KEY"],
		authStyle: "anthropic",
	},
	{ providerId: "arcee-ai", providerName: "Arcee AI", modelsEndpoint: "https://api.arcee.ai/api/v1/models", apiKeyEnv: ["ARCEE_AI_API_KEY", "ARCEE_API_KEY"] },
	{ providerId: "atlascloud", providerName: "AtlasCloud", modelsEndpoint: "https://api.atlascloud.ai/api/v1/models", apiKeyEnv: ["ATLAS_CLOUD_API_KEY"] },
	{ providerId: "crofai", providerName: "CrofAI", modelsEndpoint: "https://crof.ai/v1/models", authStyle: "none" },
	{
		providerId: "baseten",
		providerName: "Baseten",
		modelsEndpoint: "https://inference.baseten.co/v1/models",
		apiKeyEnv: ["BASETEN_API_KEY"],
		authStyle: "api_key_authorization",
	},
	{
		providerId: "byteplus",
		providerName: "BytePlus",
		modelsEndpoint: "https://ark.ap-southeast.bytepluses.com/api/v3/models",
		apiKeyEnv: ["BYTEPLUS_API_KEY", "BYTEDANCE_SEED_API_KEY", "ARK_API_KEY"],
	},
	{ providerId: "cerebras", providerName: "Cerebras", modelsEndpoint: "https://api.cerebras.ai/v1/models", apiKeyEnv: ["CEREBRAS_API_KEY"] },
	{ providerId: "chutes", providerName: "Chutes", modelsEndpoint: "https://llm.chutes.ai/v1/models", apiKeyEnv: ["CHUTES_API_KEY"] },
	{
		providerId: "clarifai",
		providerName: "Clarifai",
		modelsEndpoint: "https://api.clarifai.com/v2/models",
		apiKeyEnv: ["CLARIFAI_PAT"],
		authStyle: "clarifai_key",
	},
	{ providerId: "cohere", providerName: "Cohere", modelsEndpoint: "https://api.cohere.ai/compatibility/v1/models", apiKeyEnv: ["COHERE_API_KEY"] },
	{ providerId: "deepinfra", providerName: "DeepInfra", modelsEndpoint: "https://api.deepinfra.com/v1/openai/models", apiKeyEnv: ["DEEPINFRA_API_KEY"] },
	{ providerId: "deepseek", providerName: "DeepSeek", modelsEndpoint: "https://api.deepseek.com/models", apiKeyEnv: ["DEEPSEEK_API_KEY"] },
	{
		providerId: "elevenlabs",
		providerName: "ElevenLabs",
		modelsEndpoint: "https://api.elevenlabs.io/v1/models",
		apiKeyEnv: ["ELEVEN_LABS_API_KEY", "ELEVENLABS_API_KEY"],
		authStyle: "elevenlabs",
	},
	{ providerId: "fireworks", providerName: "Fireworks", modelsEndpoint: "https://api.fireworks.ai/inference/v1/models", apiKeyEnv: ["FIREWORKS_API_KEY"] },
	{
		providerId: "gmicloud",
		providerName: "GMICloud",
		modelsEndpoint: "https://api.gmi-serving.com/v1/models",
		apiKeyEnv: ["GMI_CLOUD_API_KEY", "GMI_API_KEY"],
	},
	{
		providerId: "google-ai-studio",
		providerName: "Google AI Studio",
		modelsEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
		apiKeyEnv: ["GOOGLE_AI_STUDIO_API_KEY"],
		authStyle: "google_api_key_query",
	},
	{ providerId: "groq", providerName: "Groq", modelsEndpoint: "https://api.groq.com/openai/v1/models", apiKeyEnv: ["GROQ_API_KEY"] },
	{ providerId: "inception", providerName: "Inception", modelsEndpoint: "https://api.inceptionlabs.ai/v1/models", apiKeyEnv: ["INCEPTION_API_KEY"] },
	{ providerId: "ionrouter", providerName: "IonRouter", modelsEndpoint: "https://api.ionrouter.io/v1/models", apiKeyEnv: ["IONROUTER_API_KEY"] },
	{ providerId: "mistral", providerName: "Mistral", modelsEndpoint: "https://api.mistral.ai/v1/models", apiKeyEnv: ["MISTRAL_AI_API_KEY"] },
	{ providerId: "moonshot-ai", providerName: "Moonshot AI", modelsEndpoint: "https://api.moonshot.ai/v1/models", apiKeyEnv: ["MOONSHOT_AI_API_KEY"] },
	{
		providerId: "nebius-token-factory",
		providerName: "Nebius Token Factory",
		modelsEndpoint: "https://api.tokenfactory.nebius.com/v1/models",
		apiKeyEnv: ["NEBIUS_TOKEN_FACTORY_API_KEY", "NEBIUS_API_KEY"],
	},
	{ providerId: "nextbit", providerName: "NextBit", modelsEndpoint: "https://api.nextbit256.com/v1/models", apiKeyEnv: ["NEXTBIT_API_KEY"] },
	{ providerId: "novitaai", providerName: "NovitaAI", modelsEndpoint: "https://api.novita.ai/openai/v1/models", apiKeyEnv: ["NOVITA_API_KEY"] },
	{ providerId: "openai", providerName: "OpenAI", modelsEndpoint: "https://api.openai.com/v1/models", apiKeyEnv: ["OPENAI_API_KEY"] },
	{ providerId: "perplexity", providerName: "Perplexity", modelsEndpoint: "https://api.perplexity.ai/v1/models", apiKeyEnv: ["PERPLEXITY_API_KEY"] },
	{
		providerId: "poolside",
		providerName: "Poolside",
		modelsEndpoint: "https://inference.poolside.ai/openai/v1/models",
		pathPrefix: "/openai/v1",
		baseUrlEnv: ["POOLSIDE_BASE_URL"],
		apiKeyEnv: ["POOLSIDE_API_KEY"],
	},
	{ providerId: "voyage", providerName: "Voyage", modelsEndpoint: "https://api.voyageai.com/v1/models", apiKeyEnv: ["VOYAGE_API_KEY"] },
	{ providerId: "stepfun", providerName: "StepFun", modelsEndpoint: "https://api.stepfun.ai/v1/models", apiKeyEnv: ["STEPFUN_API_KEY"] },
	{ providerId: "together", providerName: "Together", modelsEndpoint: "https://api.together.xyz/v1/models", apiKeyEnv: ["TOGETHER_API_KEY"] },
	{ providerId: "venice", providerName: "Venice", modelsEndpoint: "https://api.venice.ai/api/v1/models", apiKeyEnv: ["VENICE_API_KEY"] },
		{
			providerId: "weights-and-biases",
			providerName: "Weights & Biases",
			modelsEndpoint: "https://api.inference.wandb.ai/v1/models",
			apiKeyEnv: ["WEIGHTSANDBIASES_API_KEY", "WANDB_API_KEY"],
		},
	{ providerId: "x-ai", providerName: "xAI", modelsEndpoint: "https://api.x.ai/v1/models", apiKeyEnv: ["X_AI_API_KEY"] },
	{ providerId: "xiaomi", providerName: "Xiaomi", modelsEndpoint: "https://api.xiaomimimo.com/v1/models", apiKeyEnv: ["XIAOMI_MIMO_API_KEY"] },
	{ providerId: "z-ai", providerName: "z.AI", modelsEndpoint: "https://api.z.ai/api/paas/v4/models", apiKeyEnv: ["ZAI_API_KEY"] },
];

export function getModelDiscoveryProviderCount(): number {
	return PROVIDERS.length;
}

export function normalizeModelDiscoveryShardSize(shardSize: number): number {
	const normalized = Math.max(1, Math.floor(shardSize));
	return Math.min(normalized, MAX_MODEL_DISCOVERY_SHARD_SIZE);
}

export function getModelDiscoveryShardCount(shardSize: number): number {
	const normalizedSize = normalizeModelDiscoveryShardSize(shardSize);
	return Math.max(1, Math.ceil(PROVIDERS.length / normalizedSize));
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

	return PROVIDERS.filter((_, index) => index % shardCount === shardIndex);
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
	return {
		statePersisted: summary.statePersisted,
		persistenceDeferredReason: summary.persistenceDeferredReason ?? undefined,
		results: summary.results.map((result) => ({
			providerId: result.providerId,
			status: result.status,
			modelCount: result.status === "success" ? result.modelCount : undefined,
			durationMs: result.status === "success" || result.status === "error" ? result.durationMs : undefined,
			reason: result.status !== "success" ? result.reason : undefined,
		})),
		changes: summary.changes.map((change) => ({
			providerId: change.providerId,
			addedCount: change.added.length,
			removedCount: change.removed.length,
			previousCount: change.previousCount,
			currentCount: change.currentCount,
			addedSample: change.added.slice(0, MAX_SUMMARY_MODEL_SAMPLES),
			removedSample: change.removed.slice(0, MAX_SUMMARY_MODEL_SAMPLES),
		})),
		pricingMonitor: {
			enabled: summary.pricingMonitor.enabled,
			executed: summary.pricingMonitor.executed,
			baselineInitialized: summary.pricingMonitor.baselineInitialized,
			cursorUpdatedAt: summary.pricingMonitor.cursorUpdatedAt,
			ruleIdsAtTimestamp: summary.pricingMonitor.ruleIdsAtTimestamp ?? [],
			updatesDetected: summary.pricingMonitor.updatesDetected,
			providersChanged: summary.pricingMonitor.providersChanged,
			providerChanges: summary.pricingMonitor.providerChanges.map((provider) => ({
				providerId: provider.providerId,
				updates: provider.updates,
				samples: provider.samples.slice(0, MAX_SUMMARY_MODEL_SAMPLES),
			})),
			error: summary.pricingMonitor.error ?? undefined,
		},
		providerApiPricingMonitor: {
			enabled: summary.providerApiPricingMonitor.enabled,
			executed: summary.providerApiPricingMonitor.executed,
			baselineInitialized: summary.providerApiPricingMonitor.baselineInitialized,
			modelsWithPricing: summary.providerApiPricingMonitor.modelsWithPricing,
			updatesDetected: summary.providerApiPricingMonitor.updatesDetected,
			providersChanged: summary.providerApiPricingMonitor.providersChanged,
			providerChanges: summary.providerApiPricingMonitor.providerChanges.map((provider) => ({
				providerId: provider.providerId,
				updates: provider.updates,
				samples: provider.samples.slice(0, MAX_SUMMARY_MODEL_SAMPLES),
			})),
			error: summary.providerApiPricingMonitor.error ?? undefined,
		},
		configuredModelCoverageMonitor: {
			enabled: summary.configuredModelCoverageMonitor.enabled,
			executed: summary.configuredModelCoverageMonitor.executed,
			providersChecked: summary.configuredModelCoverageMonitor.providersChecked,
			updatesDetected: summary.configuredModelCoverageMonitor.updatesDetected,
			providersChanged: summary.configuredModelCoverageMonitor.providersChanged,
			providerChanges: summary.configuredModelCoverageMonitor.providerChanges.map((provider) => ({
				providerId: provider.providerId,
				updates: provider.updates,
				samples: provider.samples.slice(0, MAX_SUMMARY_MODEL_SAMPLES),
			})),
			fingerprint: summary.configuredModelCoverageMonitor.fingerprint,
			error: summary.configuredModelCoverageMonitor.error ?? undefined,
		},
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
	model_details: Record<string, unknown>;
	pricing_details: unknown;
	last_seen_at: string;
	last_run_id: string;
};

type SeenModelDeleteRow = {
	provider_id: string;
	model_id: string;
};

type PreviousProviderModels = {
	modelIds: string[];
	pricingByModelId: Map<string, string | null>;
	providerApiSnapshotByModelId: Map<string, ProviderApiModelSnapshot>;
};

type PreviousModelsState = {
	byProvider: Map<string, PreviousProviderModels>;
	providerApiSnapshotReadyByProvider: Set<string>;
};

async function fetchPreviousModelsByProviders(providerIds: string[]): Promise<PreviousModelsState> {
	const map = new Map<string, PreviousProviderModels>();
	for (const providerId of providerIds) {
		map.set(providerId, {
			modelIds: [],
			pricingByModelId: new Map<string, string | null>(),
			providerApiSnapshotByModelId: new Map<string, ProviderApiModelSnapshot>(),
		});
	}
	if (providerIds.length === 0) {
		return { byProvider: map, providerApiSnapshotReadyByProvider: new Set<string>() };
	}

	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("model_discovery_seen_models")
		.select("provider_id,model_id,model_details,pricing_details")
		.in("provider_id", providerIds);

	if (error) {
		throw new Error(error.message || "Failed to load previous discovered models");
	}

	const providerApiSnapshotReadyByProvider = new Set<string>();

	for (const row of (data ?? []) as SupabaseSeenModelRow[]) {
		if (typeof row.provider_id !== "string" || typeof row.model_id !== "string") continue;
		const state = map.get(row.provider_id);
		if (!state) continue;
		state.modelIds.push(row.model_id);
		const pricingDetails = row.pricing_details ?? null;
		const fingerprint = toPricingFingerprint(pricingDetails);
		state.pricingByModelId.set(row.model_id, fingerprint);
		if (PROVIDER_API_PRICING_WATCH_PROVIDER_IDS.has(row.provider_id)) {
			const snapshot = extractProviderApiModelSnapshot(row.provider_id, asRecord(row.model_details), pricingDetails);
			state.providerApiSnapshotByModelId.set(row.model_id, snapshot);
			if (hasProviderApiSnapshotValue(snapshot)) {
				providerApiSnapshotReadyByProvider.add(row.provider_id);
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
	const pricingEnabled = toBool(readBindingEnv(["PRICING_MONITOR_ENABLED"]) ?? "true", true);
	const pricingExecuted = pricingEnabled && shouldRunPricingMonitor(args);

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
		const upsertRows: SeenModelUpsertRow[] = [];
		const deleteRows: SeenModelDeleteRow[] = [];
		const discoveredModelIdsByProvider = new Map<string, string[]>();
		const previousState = await fetchPreviousModelsByProviders(providers.map((provider) => provider.providerId));
		const providerApiPricingChangesByProvider = new Map<string, PricingProviderChange>();
		let providerApiModelsWithPricing = 0;
		let providerApiPricingBaselineInitialized = false;

		for (const provider of providers) {
			const requiresApiKey = (provider.authStyle ?? "bearer") !== "none";
			const apiKey = provider.apiKeyEnv ? readBindingEnv(provider.apiKeyEnv) : null;
			if (requiresApiKey && !apiKey) {
				results.push({
					providerId: provider.providerId,
					providerName: provider.providerName,
					status: "skipped",
					reason: `Missing env: ${(provider.apiKeyEnv ?? []).join(" | ")}`,
				});
				continue;
			}
			const hasProviderApiSnapshotBaseline = previousState.providerApiSnapshotReadyByProvider.has(provider.providerId);
			if (PROVIDER_API_PRICING_WATCH_PROVIDER_IDS.has(provider.providerId) && !hasProviderApiSnapshotBaseline) {
				providerApiPricingBaselineInitialized = true;
			}

			const providerStarted = Date.now();
			try {
				const discoveredModels = await fetchProviderModels(provider, apiKey);
				const currentModelIds = discoveredModels.map((model) => model.id);
				discoveredModelIdsByProvider.set(provider.providerId, currentModelIds);
				const previousProviderState = previousState.byProvider.get(provider.providerId);
				const previousModelIds = previousProviderState?.modelIds ?? [];
				const { added, removed } = diffModelIds(previousModelIds, currentModelIds);

				const nowIso = new Date().toISOString();
				for (const model of discoveredModels) {
					if (toPricingFingerprint(model.pricingDetails)) {
						providerApiModelsWithPricing += 1;
					}
					upsertRows.push({
						provider_id: provider.providerId,
						provider_name: provider.providerName,
						model_id: model.id,
						model_details: model.modelDetails,
						pricing_details: model.pricingDetails,
						last_seen_at: nowIso,
						last_run_id: runId,
					});
				}
				for (const modelId of removed) {
					deleteRows.push({
						provider_id: provider.providerId,
						model_id: modelId,
					});
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
				if (change) changes.push(change);

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
						const currentSnapshot = extractProviderApiModelSnapshot(
							provider.providerId,
							model.modelDetails,
							model.pricingDetails
						);
						const snapshotDiff = buildProviderApiModelSnapshotDiff(previousSnapshot, currentSnapshot);
						if (snapshotDiff.length === 0) continue;

						const existing = providerApiPricingChangesByProvider.get(provider.providerId) ?? {
							providerId: provider.providerId,
							updates: 0,
							samples: [],
						};
						existing.updates += 1;
						if (existing.samples.length < MAX_PRICING_SAMPLE_LINES) {
							existing.samples.push(
								`${model.id} | ${snapshotDiff.join("; ")}`
							);
						}
						providerApiPricingChangesByProvider.set(provider.providerId, existing);
					}
				}

				results.push({
					providerId: provider.providerId,
					providerName: provider.providerName,
					status: "success",
					modelCount: currentModelIds.length,
					durationMs: Date.now() - providerStarted,
					change,
				});
			} catch (error) {
				results.push({
					providerId: provider.providerId,
					providerName: provider.providerName,
					status: "error",
					reason: error instanceof Error ? error.message : String(error),
					durationMs: Date.now() - providerStarted,
				});
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
			updatesDetected: 0,
			providersChanged: 0,
			providerChanges: [],
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

		if (pricingExecuted) {
			try {
				pricingMonitor = await runPricingMonitorCheck();
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				pricingMonitor.error = reason;
				console.error("[model-discovery] Pricing monitor failed:", reason);
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
		let notificationSummary: {
			delivered: boolean;
			skipped: boolean;
			reason?: string | null;
		} = {
			delivered: false,
			skipped: true,
			reason: shouldNotify ? "not attempted" : "notifications disabled",
		};
		if (shouldNotify) {
			try {
				notificationSummary = await sendDiscordNotification({
					modelChanges: changes,
					pricing: pricingMonitor,
					providerApiPricing: providerApiPricingMonitor,
					configuredModelCoverage: configuredModelCoverageNotificationSummary,
				});
			} catch (error) {
				notificationError = error instanceof Error ? error.message : String(error);
				console.error("[model-discovery] Discord notification failed:", notificationError);
			}
		}

		const includeConfiguredCoverageNotifications = shouldNotifyConfiguredModelCoverage();
		const hasNotifiableChanges =
			changes.length > 0 ||
			pricingMonitor.updatesDetected > 0 ||
			providerApiPricingMonitor.updatesDetected > 0 ||
			(includeConfiguredCoverageNotifications &&
				configuredModelCoverageNotificationSummary.updatesDetected > 0);
		const requiresNotificationDelivery = shouldNotify && hasNotifiableChanges;
		const notificationDelivered = !requiresNotificationDelivery || notificationSummary.delivered;
		const persistenceDeferredReason = !notificationDelivered
			? notificationError ?? notificationSummary.reason ?? "Discord notification not delivered"
			: null;

		let staleModelsDeleted = 0;
		if (!persistenceDeferredReason) {
			await upsertCurrentModels(upsertRows);
			await deleteRemovedModels(deleteRows);
			if (shouldPrune) {
				staleModelsDeleted = await pruneOldRows(staleCutoff);
				if (shouldPruneRunsDaily(args, startedAt)) {
					await pruneOldRuns(runsCutoff);
				}
			}
		}

		if (changes.length > 0) {
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
					const issueEntries = buildProviderIssueEntries({
						changes,
						detectedAt: new Date().toISOString(),
						detectionSource: args.source,
					});
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

		const finishedAt = new Date();
		const summary: DiscoveryRunSummary = {
			runId,
			trigger: args.trigger,
			source: args.source,
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
			statePersisted: !persistenceDeferredReason,
			persistenceDeferredReason,
			pricingMonitor,
			providerApiPricingMonitor,
			configuredModelCoverageMonitor,
		};

		const status: RunStatus =
			summary.providersError > 0 ||
			notificationError ||
			Boolean(summary.issueSync?.error) ||
			Boolean(summary.persistenceDeferredReason) ||
			Boolean(summary.pricingMonitor.error) ||
			Boolean(summary.providerApiPricingMonitor.error) ||
			Boolean(summary.configuredModelCoverageMonitor.error)
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
				updatesDetected: 0,
				providersChanged: 0,
				providerChanges: [],
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
		};
		try {
			await updateRunFinish(failedSummary, "failed", { error: reason });
		} catch (updateError) {
			console.error("[model-discovery] Failed to persist failed run status:", updateError);
		}
		throw error;
	}
}

