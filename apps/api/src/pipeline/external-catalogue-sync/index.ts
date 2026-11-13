// Purpose: Keep external providers' catalogue routes in step with their public model lists.
// Why: External routes (gateways and clouds Phaseo lists but does not route to) were imported once and
// went stale: prices, limits and availability never changed after the import.
// How: Once a day, fetch each provider's public /models list, parse it with the discovery pricing
// normalisers, and hand the rows to `sync_external_provider_catalogue`, which only writes changed values.

import { getSupabaseAdmin } from "@/runtime/env";
import { normalizeProviderModelPricing } from "@/pipeline/model-discovery/pricing-normalizers";

export type ExternalCatalogueSource = {
	/** `v2_providers.provider_slug`; the provider must have status `external`. */
	providerSlug: string;
	url: string;
	/** Key used by `normalizeProviderModelPricing`. Omit when the list carries no prices. */
	pricing?: string;
};

/**
 * Providers with a public model list. Providers whose list needs an API key, or that no longer
 * publish one, are left out and keep their stored data.
 */
export const EXTERNAL_CATALOGUE_SOURCES: ExternalCatalogueSource[] = [
	{ providerSlug: "openrouter", url: "https://openrouter.ai/api/v1/models", pricing: "openrouter" },
	{ providerSlug: "requesty", url: "https://router.requesty.ai/v1/models", pricing: "requesty" },
	{ providerSlug: "kilo", url: "https://api.kilo.ai/api/openrouter/models", pricing: "kilo" },
	{ providerSlug: "vercel", url: "https://ai-gateway.vercel.sh/v1/models", pricing: "vercel" },
	{ providerSlug: "zenmux", url: "https://zenmux.ai/api/v1/models", pricing: "zenmux" },
	{ providerSlug: "nano-gpt", url: "https://nano-gpt.com/api/v1/models?detailed=true", pricing: "nano-gpt" },
	{ providerSlug: "fastrouter", url: "https://go.fastrouter.ai/api/v1/models", pricing: "fastrouter" },
	{ providerSlug: "abacus", url: "https://routellm.abacus.ai/v1/models", pricing: "abacus" },
	{ providerSlug: "crossmodel", url: "https://www.crossmodel.ai/api/models", pricing: "crossmodel" },
	{ providerSlug: "inference", url: "https://api.inference.net/v1/models", pricing: "inference" },
	{ providerSlug: "ofox", url: "https://api.ofox.ai/v1/models", pricing: "ofox" },
	{ providerSlug: "jiekou", url: "https://api.jiekou.ai/openai/v1/models", pricing: "jiekou" },
	{ providerSlug: "meganova", url: "https://api.meganova.ai/v1/models", pricing: "meganova" },
	// Lists without usable USD prices: availability and limits only.
	{ providerSlug: "orcarouter", url: "https://api.orcarouter.ai/v1/models" },
	{ providerSlug: "huggingface", url: "https://router.huggingface.co/v1/models" },
	{ providerSlug: "neuralwatt", url: "https://api.neuralwatt.com/v1/models" },
	{ providerSlug: "qiniu-ai", url: "https://api.qnaigc.com/v1/models" },
	{ providerSlug: "vultr", url: "https://api.vultrinference.com/v1/models" },
	{ providerSlug: "berget", url: "https://api.berget.ai/v1/models" },
];

export type ExternalCatalogueModel = {
	id: string;
	context_length: number | null;
	max_output_tokens: number | null;
	meters: Record<string, number> | null;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function positiveInteger(...values: unknown[]): number | null {
	for (const value of values) {
		const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
		if (typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647) return parsed;
	}
	return null;
}

/** The model array, whichever envelope the provider uses. */
export function listEntries(payload: unknown): unknown[] {
	if (Array.isArray(payload)) return payload;
	const record = asRecord(payload);
	if (Array.isArray(record?.data)) return record.data;
	if (Array.isArray(record?.models)) return record.models;
	return [];
}

/** Turns one provider list entry into the row `sync_external_provider_catalogue` expects. */
export function toCatalogueModel(source: ExternalCatalogueSource, entry: unknown): ExternalCatalogueModel | null {
	const model = asRecord(entry);
	const id = typeof model?.id === "string" ? model.id.trim() : "";
	if (!model || !id) return null;
	const topProvider = asRecord(model.top_provider);
	const limits = asRecord(model.limits);
	const contextLength = positiveInteger(
		model.context_length,
		model.context_window,
		model.context_window_tokens,
		model.context_size,
		model.max_model_len,
		topProvider?.context_length,
		limits?.context,
	);
	let maxOutput = positiveInteger(
		topProvider?.max_completion_tokens,
		model.max_output_tokens,
		model.max_completion_tokens,
		model.max_tokens,
		limits?.output,
	);
	// Some lists report the context window as the output limit; never store an output limit above it.
	if (maxOutput !== null && contextLength !== null && maxOutput > contextLength) maxOutput = null;
	const pricing = source.pricing ? normalizeProviderModelPricing(source.pricing, model) : null;
	return {
		id,
		context_length: contextLength,
		max_output_tokens: maxOutput,
		meters: pricing?.meters ?? null,
	};
}

export type ExternalCatalogueSyncResult =
	| { provider: string; ok: true; summary: Record<string, unknown> }
	| { provider: string; ok: false; error: string };

type SyncDeps = {
	fetchImpl?: typeof fetch;
	rpc?: (providerSlug: string, models: ExternalCatalogueModel[]) => Promise<Record<string, unknown>>;
	sources?: ExternalCatalogueSource[];
	timeoutMs?: number;
};

async function syncViaSupabase(providerSlug: string, models: ExternalCatalogueModel[]) {
	const { data, error } = await getSupabaseAdmin().rpc("sync_external_provider_catalogue", {
		p_provider_slug: providerSlug,
		p_models: models,
	});
	if (error) throw new Error(error.message);
	return (data ?? {}) as Record<string, unknown>;
}

export async function syncExternalCatalogueSource(
	source: ExternalCatalogueSource,
	deps: SyncDeps = {},
): Promise<ExternalCatalogueSyncResult> {
	const fetchImpl = deps.fetchImpl ?? fetch;
	try {
		const response = await fetchImpl(source.url, {
			headers: { accept: "application/json", "user-agent": "PhaseoCatalogueSync/1.0" },
			signal: AbortSignal.timeout(deps.timeoutMs ?? 30_000),
		});
		if (!response.ok) return { provider: source.providerSlug, ok: false, error: `HTTP ${response.status}` };
		const entries = listEntries(await response.json());
		// A failed or reshaped response must not look like "the provider removed everything".
		if (entries.length === 0) return { provider: source.providerSlug, ok: false, error: "empty model list" };
		const models = entries
			.map((entry) => toCatalogueModel(source, entry))
			.filter((model): model is ExternalCatalogueModel => model !== null);
		const summary = await (deps.rpc ?? syncViaSupabase)(source.providerSlug, models);
		return { provider: source.providerSlug, ok: true, summary };
	} catch (error) {
		return { provider: source.providerSlug, ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/** Syncs every source, a few at a time, and logs one line per provider. */
export async function runExternalCatalogueSync(deps: SyncDeps = {}): Promise<ExternalCatalogueSyncResult[]> {
	const sources = deps.sources ?? EXTERNAL_CATALOGUE_SOURCES;
	const results: ExternalCatalogueSyncResult[] = [];
	const concurrency = 4;
	for (let index = 0; index < sources.length; index += concurrency) {
		const batch = await Promise.all(sources.slice(index, index + concurrency).map((source) => syncExternalCatalogueSource(source, deps)));
		results.push(...batch);
	}
	for (const result of results) {
		if (result.ok === true) console.log("external_catalogue_sync", result.summary);
		if (result.ok === false) console.warn("external_catalogue_sync_failed", { provider: result.provider, error: result.error });
	}
	return results;
}
