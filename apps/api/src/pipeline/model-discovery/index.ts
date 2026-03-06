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
	pricingMonitor: PricingMonitorSummary;
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
const MAX_PRICING_PROVIDER_LINES = 20;
const MAX_PRICING_SAMPLE_LINES = 6;
const MAX_PRICING_ROWS = 5_000;
const PRICING_PAGE_SIZE = 500;
const RUNS_RETENTION_DAYS = 5;

const PROVIDERS: ProviderConfig[] = [
	{ providerId: "ai21", providerName: "AI21", modelsEndpoint: "https://api.ai21.com/studio/v1/models", apiKeyEnv: ["AI21_API_KEY"] },
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
	{ providerId: "stepfun", providerName: "StepFun", modelsEndpoint: "https://api.stepfun.ai/v1/models", apiKeyEnv: ["STEPFUN_API_KEY"] },
	{ providerId: "together", providerName: "Together", modelsEndpoint: "https://api.together.xyz/v1/models", apiKeyEnv: ["TOGETHER_API_KEY"] },
	{ providerId: "venice", providerName: "Venice", modelsEndpoint: "https://api.venice.ai/api/v1/models", apiKeyEnv: ["VENICE_API_KEY"] },
	{
		providerId: "weights-and-biases",
		providerName: "Weights & Biases",
		modelsEndpoint: "https://api.inference.wandb.ai/v1/models",
		apiKeyEnv: ["WEIGHTSANDBIASES_API_KEY"],
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

function toBool(value: string | undefined | null, fallback = false): boolean {
	if (value === undefined || value === null) return fallback;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return fallback;
	return ["1", "true", "yes", "on"].includes(normalized);
}

function safeId(value: string | null): string {
	return value?.trim() || "?";
}

function normalizePrice(value: number | string | null): string {
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	if (typeof value === "string" && value.trim()) return value.trim();
	return "?";
}

function pricingRuleIdentity(row: PricingRuleRow): string {
	if (row.rule_id && row.rule_id.trim()) return row.rule_id.trim();
	return [
		safeId(row.provider_id),
		safeId(row.api_model_id),
		safeId(row.capability_id),
		safeId(row.pricing_plan),
		safeId(row.meter),
		safeId(row.updated_at),
	].join("|");
}

function isNewerTimestamp(a: string, b: string): boolean {
	const aMs = Date.parse(a);
	const bMs = Date.parse(b);
	if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return a > b;
	return aMs > bMs;
}

function isSameTimestamp(a: string, b: string): boolean {
	const aMs = Date.parse(a);
	const bMs = Date.parse(b);
	if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return a === b;
	return aMs === bMs;
}

function formatPricingSample(row: PricingRuleRow): string {
	const model = safeId(row.api_model_id);
	const capability = safeId(row.capability_id);
	const plan = safeId(row.pricing_plan);
	const meter = safeId(row.meter);
	const price = normalizePrice(row.price_per_unit);
	const currency = safeId(row.currency);
	const status = row.effective_to ? "ended" : "active";
	return `${model} | ${capability} | ${plan} | ${meter}=${price} ${currency} (${status})`;
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

function parsePricingCursorFromSummary(summary: unknown): PricingCursor | null {
	const summaryRecord = asRecord(summary);
	if (!summaryRecord) return null;
	const pricingRecord = asRecord(summaryRecord.pricingMonitor);
	if (!pricingRecord) return null;
	if (typeof pricingRecord.cursorUpdatedAt !== "string" || !pricingRecord.cursorUpdatedAt.trim()) {
		return null;
	}
	const ruleIds =
		Array.isArray(pricingRecord.ruleIdsAtTimestamp)
			? pricingRecord.ruleIdsAtTimestamp
				.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
			: [];
	return {
		updatedAt: pricingRecord.cursorUpdatedAt,
		ruleIdsAtTimestamp: ruleIds,
	};
}

async function loadLatestPricingCursor(): Promise<PricingCursor | null> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("model_discovery_runs")
		.select("summary,status,started_at")
		.in("status", ["completed", "completed_with_errors"])
		.order("started_at", { ascending: false })
		.limit(200);

	if (error) throw new Error(error.message || "Failed to load pricing cursor from previous runs");

	for (const row of data ?? []) {
		const cursor = parsePricingCursorFromSummary((row as Record<string, unknown>).summary);
		if (cursor) return cursor;
	}
	return null;
}

async function fetchLatestPricingUpdatedAt(): Promise<string | null> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("data_api_pricing_rules")
		.select("updated_at")
		.not("updated_at", "is", null)
		.order("updated_at", { ascending: false })
		.limit(1);

	if (error) throw new Error(error.message || "Failed to load latest pricing updated_at");
	const row = (data ?? [])[0] as { updated_at?: string | null } | undefined;
	if (!row || typeof row.updated_at !== "string" || !row.updated_at.trim()) return null;
	return row.updated_at;
}

async function fetchPricingRuleIdsAtTimestamp(updatedAt: string): Promise<string[]> {
	const supabase = getSupabaseAdmin();
	const rows: PricingRuleRow[] = [];
	let from = 0;
	while (rows.length < MAX_PRICING_ROWS) {
		const to = from + PRICING_PAGE_SIZE - 1;
		const { data, error } = await supabase
			.from("data_api_pricing_rules")
			.select("rule_id,provider_id,api_model_id,capability_id,pricing_plan,meter,price_per_unit,currency,effective_from,effective_to,updated_at")
			.eq("updated_at", updatedAt)
			.order("rule_id", { ascending: true })
			.range(from, to);
		if (error) throw new Error(error.message || "Failed to load pricing ids at checkpoint timestamp");
		const chunk = (data ?? []) as PricingRuleRow[];
		if (chunk.length === 0) break;
		rows.push(...chunk);
		if (chunk.length < PRICING_PAGE_SIZE) break;
		from += PRICING_PAGE_SIZE;
	}
	return rows.map((row) => pricingRuleIdentity(row)).sort((a, b) => a.localeCompare(b));
}

async function fetchPricingRowsSince(sinceInclusive: string): Promise<PricingRuleRow[]> {
	const supabase = getSupabaseAdmin();
	const rows: PricingRuleRow[] = [];
	let from = 0;

	while (rows.length < MAX_PRICING_ROWS) {
		const to = from + PRICING_PAGE_SIZE - 1;
		const { data, error } = await supabase
			.from("data_api_pricing_rules")
			.select("rule_id,provider_id,api_model_id,capability_id,pricing_plan,meter,price_per_unit,currency,effective_from,effective_to,updated_at")
			.gte("updated_at", sinceInclusive)
			.order("updated_at", { ascending: true })
			.range(from, to);

		if (error) throw new Error(error.message || "Failed to fetch pricing changes");
		const chunk = (data ?? []) as PricingRuleRow[];
		if (chunk.length === 0) break;
		rows.push(...chunk);
		if (chunk.length < PRICING_PAGE_SIZE) break;
		from += PRICING_PAGE_SIZE;
	}

	return rows.length > MAX_PRICING_ROWS ? rows.slice(0, MAX_PRICING_ROWS) : rows;
}

function summarizePricingChanges(rows: PricingRuleRow[]): PricingProviderChange[] {
	const providerMap = new Map<string, PricingProviderChange>();
	for (const row of rows) {
		const providerId = safeId(row.provider_id);
		const existing = providerMap.get(providerId) ?? { providerId, updates: 0, samples: [] };
		existing.updates += 1;
		if (existing.samples.length < MAX_PRICING_SAMPLE_LINES) {
			existing.samples.push(formatPricingSample(row));
		}
		providerMap.set(providerId, existing);
	}
	return Array.from(providerMap.values()).sort((a, b) => b.updates - a.updates || a.providerId.localeCompare(b.providerId));
}

function shouldRunPricingMonitor(args: RunArgs): boolean {
	if (args.shardIndex === undefined || args.shardCount === undefined) return true;
	return args.shardIndex === 0;
}

async function runPricingMonitorCheck(): Promise<PricingMonitorSummary> {
	const summary: PricingMonitorSummary = {
		enabled: true,
		executed: true,
		baselineInitialized: false,
		cursorUpdatedAt: null,
		updatesDetected: 0,
		providersChanged: 0,
		providerChanges: [],
	};

	const cursor = await loadLatestPricingCursor();
	if (!cursor) {
		const latest = await fetchLatestPricingUpdatedAt();
		summary.baselineInitialized = true;
		summary.cursorUpdatedAt = latest;
		summary.ruleIdsAtTimestamp = latest ? await fetchPricingRuleIdsAtTimestamp(latest) : [];
		return summary;
	}

	const rows = await fetchPricingRowsSince(cursor.updatedAt);
	const seenRuleIds = new Set(cursor.ruleIdsAtTimestamp);
	const filtered: PricingRuleRow[] = [];

	for (const row of rows) {
		if (!row.updated_at) continue;
		if (isNewerTimestamp(cursor.updatedAt, row.updated_at)) continue;
		if (isSameTimestamp(row.updated_at, cursor.updatedAt)) {
			const identity = pricingRuleIdentity(row);
			if (seenRuleIds.has(identity)) continue;
		}
		filtered.push(row);
	}

	let nextUpdatedAt = cursor.updatedAt;
	let nextRuleIdsAtTimestamp = new Set(cursor.ruleIdsAtTimestamp);
	for (const row of filtered) {
		if (!row.updated_at) continue;
		const identity = pricingRuleIdentity(row);
		if (isNewerTimestamp(row.updated_at, nextUpdatedAt)) {
			nextUpdatedAt = row.updated_at;
			nextRuleIdsAtTimestamp = new Set([identity]);
		} else if (isSameTimestamp(row.updated_at, nextUpdatedAt)) {
			nextRuleIdsAtTimestamp.add(identity);
		}
	}

	const providerChanges = summarizePricingChanges(filtered);
	summary.cursorUpdatedAt = nextUpdatedAt;
	summary.updatesDetected = filtered.length;
	summary.providersChanged = providerChanges.length;
	summary.providerChanges = providerChanges;
	summary.ruleIdsAtTimestamp = Array.from(nextRuleIdsAtTimestamp).sort((a, b) => a.localeCompare(b));
	return summary;
}

function appendBulletedList(lines: string[], values: string[]): void {
	const visible = values.slice(0, MAX_LIST_ITEMS);
	for (const value of visible) {
		lines.push(`- ${value}`);
	}
	if (values.length > MAX_LIST_ITEMS) {
		lines.push(`- ...and ${values.length - MAX_LIST_ITEMS} more`);
	}
}

function buildModelDiscordSection(changes: ProviderChange[]): string {
	if (changes.length === 0) return "";
	const lines: string[] = [
		`Model discovery detected changes across ${changes.length} provider${changes.length === 1 ? "" : "s"}.`,
		"",
	];

	for (const change of changes.slice(0, MAX_DISCORD_LINES)) {
		lines.push(`${change.providerName}`);
		if (change.added.length > 0) {
			lines.push(`Additions (${change.added.length}):`);
			appendBulletedList(lines, change.added);
		}
		if (change.removed.length > 0) {
			lines.push(`Deletions (${change.removed.length}):`);
			appendBulletedList(lines, change.removed);
		}
		lines.push("");
	}

	return lines.join("\n").trim();
}

function buildPricingDiscordSection(pricing: PricingMonitorSummary): string {
	if (pricing.updatesDetected === 0 || pricing.providerChanges.length === 0) return "";
	const lines: string[] = [
		`Pricing monitor detected ${pricing.updatesDetected} updated rule${pricing.updatesDetected === 1 ? "" : "s"} across ${pricing.providerChanges.length} provider${pricing.providerChanges.length === 1 ? "" : "s"}.`,
		"",
	];

	for (const provider of pricing.providerChanges.slice(0, MAX_PRICING_PROVIDER_LINES)) {
		lines.push(`${provider.providerId}`);
		lines.push(`Updates (${provider.updates}):`);
		appendBulletedList(lines, provider.samples);
		lines.push("");
	}

	if (pricing.providerChanges.length > MAX_PRICING_PROVIDER_LINES) {
		lines.push(`...and ${pricing.providerChanges.length - MAX_PRICING_PROVIDER_LINES} more provider(s).`);
	}

	return lines.join("\n").trim();
}

function buildDiscordMessage(args: { modelChanges: ProviderChange[]; pricing: PricingMonitorSummary }): string {
	const sections: string[] = [];
	const modelSection = buildModelDiscordSection(args.modelChanges);
	const pricingSection = buildPricingDiscordSection(args.pricing);
	if (modelSection) sections.push(modelSection);
	if (pricingSection) sections.push(pricingSection);
	const text = sections.join("\n\n").trim();
	if (text.length <= 1900) return text;
	return `${text.slice(0, 1888)}\n...[truncated]`;
}

async function sendDiscordNotification(args: { modelChanges: ProviderChange[]; pricing: PricingMonitorSummary }): Promise<void> {
	if (args.modelChanges.length === 0 && args.pricing.updatesDetected === 0) return;
	const webhookUrl = readBindingEnv(["DISCORD_WEBHOOK_URL"]);
	if (!webhookUrl) return;

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(webhookUrl);
	} catch {
		console.warn("[model-discovery] invalid DISCORD_WEBHOOK_URL; skipping notification");
		return;
	}

	const message = buildDiscordMessage(args);
	const roleId = readBindingEnv(["DISCORD_ROLE_ID"]);
	const userId = readBindingEnv(["DISCORD_USER_ID"]);
	const mentions: string[] = [];
	if (roleId) mentions.push(`<@&${roleId}>`);
	if (userId) mentions.push(`<@${userId}>`);

	const payload: Record<string, unknown> = {
		content: mentions.length ? `${mentions.join(" ")}\n${message}` : message,
	};
	if (roleId || userId) {
		payload.allowed_mentions = {
			parse: [],
			roles: roleId ? [roleId] : [],
			users: userId ? [userId] : [],
		};
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

type SeenModelDeleteRow = {
	provider_id: string;
	model_id: string;
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
		const upsertRows: SeenModelUpsertRow[] = [];
		const deleteRows: SeenModelDeleteRow[] = [];
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
		await deleteRemovedModels(deleteRows);
		let staleModelsDeleted = 0;
		if (shouldPrune) {
			staleModelsDeleted = await pruneOldRows(staleCutoff);
			if (shouldPruneRunsDaily(args, startedAt)) {
				await pruneOldRuns(runsCutoff);
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

		if (pricingExecuted) {
			try {
				pricingMonitor = await runPricingMonitorCheck();
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				pricingMonitor.error = reason;
				console.error("[model-discovery] Pricing monitor failed:", reason);
			}
		}

		let notificationError: string | null = null;
		if (shouldNotify) {
			try {
				await sendDiscordNotification({ modelChanges: changes, pricing: pricingMonitor });
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
			pricingMonitor,
		};

		const status: RunStatus =
			summary.providersError > 0 || notificationError || Boolean(summary.pricingMonitor.error)
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
			pricingMonitor: {
				enabled: pricingEnabled,
				executed: false,
				baselineInitialized: false,
				cursorUpdatedAt: null,
				updatesDetected: 0,
				providersChanged: 0,
				providerChanges: [],
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


