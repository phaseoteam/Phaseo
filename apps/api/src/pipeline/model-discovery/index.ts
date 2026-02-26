// Purpose: Run model discovery on a schedule and persist compact state in Supabase.
// Why: Replace filesystem snapshots with durable DB state for Cloudflare Worker cron runs.
// How: Poll provider model endpoints, diff against DB, notify on changes, and prune stale rows.

import { getBindings, getSupabaseAdmin } from "@/runtime/env";

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
	apiKeyEnv: string[];
	authStyle?: "bearer" | "anthropic" | "google_api_key_query" | "clarifai_key" | "elevenlabs";
};

type ProviderChange = {
	providerId: string;
	providerName: string;
	previousCount: number;
	currentCount: number;
	added: string[];
	removed: string[];
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
};

type SupabaseSeenModelRow = {
	provider_id: string;
	model_id: string;
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

const PROVIDERS: ProviderConfig[] = [
	{ providerId: "ai21", providerName: "AI21", modelsEndpoint: "https://api.ai21.com/studio/v1/models", apiKeyEnv: ["AI21_API_KEY"] },
	{ providerId: "aion-labs", providerName: "AionLabs", modelsEndpoint: "https://api.aionlabs.ai/v1/models", apiKeyEnv: ["AION_LABS_API_KEY"] },
	{
		providerId: "alibaba",
		providerName: "Alibaba Cloud",
		modelsEndpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
		apiKeyEnv: ["ALIBABA_CLOUD_API_KEY", "ALIBABA_API_KEY"],
	},
	{
		providerId: "anthropic",
		providerName: "Anthropic",
		modelsEndpoint: "https://api.anthropic.com/v1/models",
		apiKeyEnv: ["ANTHROPIC_API_KEY"],
		authStyle: "anthropic",
	},
	{ providerId: "arcee-ai", providerName: "Arcee AI", modelsEndpoint: "https://api.arcee.ai/api/v1/models", apiKeyEnv: ["ARCEE_API_KEY"] },
	{ providerId: "atlascloud", providerName: "AtlasCloud", modelsEndpoint: "https://api.atlascloud.ai/api/v1/models", apiKeyEnv: ["ATLAS_CLOUD_API_KEY"] },
	{ providerId: "baseten", providerName: "Baseten", modelsEndpoint: "https://inference.baseten.co/v1/models", apiKeyEnv: ["BASETEN_API_KEY"] },
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
		apiKeyEnv: ["GOOGLE_API_KEY", "GOOGLE_AI_STUDIO_API_KEY"],
		authStyle: "google_api_key_query",
	},
	{ providerId: "groq", providerName: "Groq", modelsEndpoint: "https://api.groq.com/openai/v1/models", apiKeyEnv: ["GROQ_API_KEY"] },
	{ providerId: "inception", providerName: "Inception", modelsEndpoint: "https://api.inceptionlabs.ai/v1/models", apiKeyEnv: ["INCEPTION_API_KEY"] },
	{ providerId: "mistral", providerName: "Mistral", modelsEndpoint: "https://api.mistral.ai/v1/models", apiKeyEnv: ["MISTRAL_AI_API_KEY", "MISTRAL_API_KEY"] },
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
	{ providerId: "stepfun", providerName: "StepFun", modelsEndpoint: "https://api.stepfun.ai/v1/models", apiKeyEnv: ["STEPFUN_API_KEY"] },
	{ providerId: "together", providerName: "Together", modelsEndpoint: "https://api.together.xyz/v1/models", apiKeyEnv: ["TOGETHER_API_KEY"] },
	{ providerId: "venice", providerName: "Venice", modelsEndpoint: "https://api.venice.ai/api/v1/models", apiKeyEnv: ["VENICE_API_KEY"] },
	{
		providerId: "weights-and-biases",
		providerName: "Weights & Biases",
		modelsEndpoint: "https://api.inference.wandb.ai/v1/models",
		apiKeyEnv: ["WEIGHTSANDBIASES_API_KEY", "WANDB_API_KEY"],
	},
	{ providerId: "x-ai", providerName: "xAI", modelsEndpoint: "https://api.x.ai/v1/models", apiKeyEnv: ["XAI_API_KEY", "X_AI_API_KEY"] },
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

function toInt(value: string | undefined, fallback: number): number {
	const parsed = Number(value ?? "");
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(1, Math.floor(parsed));
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function isPlaceholderValue(raw: string): boolean {
	const value = raw.trim().toLowerCase();
	if (!value) return true;
	if (value.startsWith("your-") || value.startsWith("example-")) return true;
	return new Set(["changeme", "replace-me", "todo"]).has(value);
}

function readBindingEnv(names: string[]): string | null {
	const bindings = getBindings() as unknown as Record<string, unknown>;
	for (const name of names) {
		const raw = bindings[name];
		if (typeof raw !== "string") continue;
		const trimmed = raw.trim();
		if (!trimmed || isPlaceholderValue(trimmed)) continue;
		return trimmed;
	}
	return null;
}

function normalizeModelId(providerId: string, raw: string): string | null {
	const value = raw.trim();
	if (!value) return null;
	if (providerId === "google-ai-studio" && value.startsWith("models/")) {
		return value.slice("models/".length);
	}
	return value;
}

function hasAtlascloudLlmCategory(row: Record<string, unknown>): boolean {
	const categories = asArray(row.categories)
		.filter((value): value is string => typeof value === "string")
		.map((value) => value.trim().toLowerCase());
	if (categories.includes("llm")) return true;

	if (typeof row.category === "string") {
		return row.category
			.split(",")
			.map((value) => value.trim().toLowerCase())
			.some((value) => value === "llm");
	}

	return false;
}

function shouldIncludeDiscoveredModel(providerId: string, row: Record<string, unknown>): boolean {
	if (providerId === "atlascloud") {
		return hasAtlascloudLlmCategory(row);
	}
	if (providerId === "clarifai") {
		return typeof row.model_type_id === "string" && row.model_type_id.trim().toLowerCase() === "text-to-text";
	}
	return true;
}

function extractModelIds(providerId: string, payload: unknown): string[] {
	const root = asRecord(payload);
	if (!root) return [];

	const candidateCollections: unknown[] = [
		root.data,
		root.models,
		asRecord(root.result)?.models,
	];

	const output = new Set<string>();

	for (const collection of candidateCollections) {
		for (const item of asArray(collection)) {
			const row = asRecord(item);
			if (!row) continue;
			if (!shouldIncludeDiscoveredModel(providerId, row)) continue;
			const candidates = [row.id, row.model_id, row.name, row.model, row.slug];
			for (const value of candidates) {
				if (typeof value !== "string") continue;
				const normalized = normalizeModelId(providerId, value);
				if (normalized) output.add(normalized);
				break;
			}
		}
	}

	return Array.from(output).sort((a, b) => a.localeCompare(b));
}

async function fetchProviderModels(provider: ProviderConfig, apiKey: string): Promise<string[]> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);

	try {
		const headers: Record<string, string> = {};
		let url = provider.modelsEndpoint;

		switch (provider.authStyle ?? "bearer") {
			case "anthropic":
				headers["x-api-key"] = apiKey;
				headers["anthropic-version"] = "2023-06-01";
				break;
			case "google_api_key_query": {
				const parsed = new URL(provider.modelsEndpoint);
				parsed.searchParams.set("key", apiKey);
				url = parsed.toString();
				break;
			}
			case "clarifai_key":
				headers["Authorization"] = `Key ${apiKey}`;
				break;
			case "elevenlabs":
				headers["xi-api-key"] = apiKey;
				break;
			case "bearer":
			default:
				headers["Authorization"] = `Bearer ${apiKey}`;
				break;
		}

		const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
		}

		const payload = await response.json();
		return extractModelIds(provider.providerId, payload);
	} finally {
		clearTimeout(timeout);
	}
}

function diffModelIds(previousIds: string[], currentIds: string[]): { added: string[]; removed: string[] } {
	const previous = new Set(previousIds);
	const current = new Set(currentIds);
	const added = currentIds.filter((id) => !previous.has(id));
	const removed = previousIds.filter((id) => !current.has(id));
	return { added, removed };
}

function limitList(values: string[], maxItems = MAX_LIST_ITEMS): string {
	if (values.length <= maxItems) return values.join(", ");
	return `${values.slice(0, maxItems).join(", ")}, +${values.length - maxItems} more`;
}

function buildDiscordMessage(changes: ProviderChange[]): string {
	const lines: string[] = [
		`Model discovery detected changes across ${changes.length} provider${changes.length === 1 ? "" : "s"}.`,
		"",
	];

	for (const change of changes.slice(0, MAX_DISCORD_LINES)) {
		lines.push(
			`${change.providerName} (${change.providerId}): +${change.added.length} / -${change.removed.length} (${change.previousCount} -> ${change.currentCount})`,
		);
		if (change.added.length) lines.push(`  Added: ${limitList(change.added)}`);
		if (change.removed.length) lines.push(`  Removed: ${limitList(change.removed)}`);
		lines.push("");
	}

	const text = lines.join("\n").trim();
	if (text.length <= 1900) return text;
	return `${text.slice(0, 1888)}\n...[truncated]`;
}

async function sendDiscordNotification(changes: ProviderChange[]): Promise<void> {
	if (changes.length === 0) return;
	const webhookUrl = readBindingEnv(["DISCORD_WEBHOOK_URL"]);
	if (!webhookUrl) return;

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(webhookUrl);
	} catch {
		console.warn("[model-discovery] invalid DISCORD_WEBHOOK_URL; skipping notification");
		return;
	}

	const message = buildDiscordMessage(changes);
	const userId = readBindingEnv(["DISCORD_USER_ID"]);
	const payload: Record<string, unknown> = {
		content: userId ? `<@${userId}>\n${message}` : message,
	};
	if (userId) {
		payload.allowed_mentions = { users: [userId] };
	}

	const response = await fetch(parsedUrl.toString(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Discord webhook failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
	}
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
	last_seen_at: string;
	last_run_id: string;
};

async function fetchPreviousModelIdsByProviders(providerIds: string[]): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	for (const providerId of providerIds) map.set(providerId, []);
	if (providerIds.length === 0) return map;

	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("model_discovery_seen_models")
		.select("provider_id,model_id")
		.in("provider_id", providerIds);

	if (error) {
		throw new Error(error.message || "Failed to load previous discovered models");
	}

	for (const row of (data ?? []) as SupabaseSeenModelRow[]) {
		if (typeof row.provider_id !== "string" || typeof row.model_id !== "string") continue;
		const list = map.get(row.provider_id);
		if (!list) continue;
		list.push(row.model_id);
	}

	for (const [, list] of map) {
		list.sort((a, b) => a.localeCompare(b));
	}

	return map;
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

export async function runModelDiscoveryJob(args: RunArgs): Promise<DiscoveryRunSummary> {
	const startedAt = new Date();
	const runId = crypto.randomUUID();
	const retentionDays = toInt(readBindingEnv(["MODEL_DISCOVERY_RETENTION_DAYS"]) ?? String(DEFAULT_RETENTION_DAYS), DEFAULT_RETENTION_DAYS);
	const staleCutoff = new Date(startedAt.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
	const runsCutoff = new Date(startedAt.getTime() - Math.max(retentionDays * 4, 14) * 24 * 60 * 60 * 1000).toISOString();
	const shouldPrune = args.prune ?? true;
	const shouldNotify = args.notify ?? true;
	const providers = selectProvidersForShard(args);

	await insertRunStart(runId, args, startedAt.toISOString());

	try {
		const results: ProviderResult[] = [];
		const changes: ProviderChange[] = [];
		const upsertRows: SeenModelUpsertRow[] = [];
		const previousByProvider = await fetchPreviousModelIdsByProviders(providers.map((provider) => provider.providerId));

		for (const provider of providers) {
			const apiKey = readBindingEnv(provider.apiKeyEnv);
			if (!apiKey) {
				results.push({
					providerId: provider.providerId,
					providerName: provider.providerName,
					status: "skipped",
					reason: `Missing env: ${provider.apiKeyEnv.join(" | ")}`,
				});
				continue;
			}

			const providerStarted = Date.now();
			try {
				const currentModelIds = await fetchProviderModels(provider, apiKey);
				const previousModelIds = previousByProvider.get(provider.providerId) ?? [];
				const { added, removed } = diffModelIds(previousModelIds, currentModelIds);

				const nowIso = new Date().toISOString();
				for (const modelId of currentModelIds) {
					upsertRows.push({
						provider_id: provider.providerId,
						provider_name: provider.providerName,
						model_id: modelId,
						last_seen_at: nowIso,
						last_run_id: runId,
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

		await upsertCurrentModels(upsertRows);
		let staleModelsDeleted = 0;
		if (shouldPrune) {
			staleModelsDeleted = await pruneOldRows(staleCutoff);
			await pruneOldRuns(runsCutoff);
		}

		let notificationError: string | null = null;
		if (shouldNotify) {
			try {
				await sendDiscordNotification(changes);
			} catch (error) {
				notificationError = error instanceof Error ? error.message : String(error);
				console.error("[model-discovery] Discord notification failed:", notificationError);
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
		};

		const status: RunStatus =
			summary.providersError > 0 || notificationError
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
		};
		try {
			await updateRunFinish(failedSummary, "failed", { error: reason });
		} catch (updateError) {
			console.error("[model-discovery] Failed to persist failed run status:", updateError);
		}
		throw error;
	}
}
