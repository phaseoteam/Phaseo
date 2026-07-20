import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { buildModelsPageFacets, fetchModelsPageCatalogue } from "@/models/page-catalogue";
import { composeGatewayMetadata, fetchGatewayMetadataSource } from "@/models/gateway-metadata";
import { composeModelPricing, fetchModelPricingSources } from "@/models/pricing";
import { buildFreeRouterCatalogueRow, fetchFreeRouterOverview } from "@/models/free-router";
import { withPublicCache, type PublicCachePolicy } from "@/http/cache";

const CACHE_PROFILES = {
	catalogue: {
		edgeTtlSeconds: 5 * 60,
		staleWhileRevalidateSeconds: 5 * 60,
		cacheTags: ["web-api-models"],
	},
	overview: {
		edgeTtlSeconds: 24 * 60 * 60,
		staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
		cacheTags: ["web-api-model-details"],
	},
	benchmarks: {
		edgeTtlSeconds: 24 * 60 * 60,
		staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
		cacheTags: ["web-api-model-benchmarks"],
	},
	timeline: {
		edgeTtlSeconds: 24 * 60 * 60,
		staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
		cacheTags: ["web-api-model-timelines"],
	},
	subscriptions: {
		edgeTtlSeconds: 24 * 60 * 60,
		staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
		cacheTags: ["web-api-model-subscriptions"],
	},
	pricing: {
		edgeTtlSeconds: 60 * 60,
		staleWhileRevalidateSeconds: 24 * 60 * 60,
		cacheTags: ["web-api-model-pricing"],
	},
	performance: {
		edgeTtlSeconds: 15 * 60,
		staleWhileRevalidateSeconds: 15 * 60,
		cacheTags: ["web-api-model-performance"],
	},
	pricingHistory: {
		edgeTtlSeconds: 60 * 60,
		staleWhileRevalidateSeconds: 24 * 60 * 60,
		cacheTags: ["web-api-model-pricing-history"],
	},
	usageDaily: {
		edgeTtlSeconds: 15 * 60,
		staleWhileRevalidateSeconds: 15 * 60,
		cacheTags: ["web-api-model-usage-daily"],
	},
	catalogPricing: {
		edgeTtlSeconds: 60 * 60,
		staleWhileRevalidateSeconds: 24 * 60 * 60,
		cacheTags: ["web-api-catalog-pricing"],
	},
	freeRouter: {
		edgeTtlSeconds: 60 * 60,
		staleWhileRevalidateSeconds: 6 * 60 * 60,
		cacheTags: ["web-api-free-router-overview"],
	},
	realtime: {
		edgeTtlSeconds: 5 * 60,
		staleWhileRevalidateSeconds: 5 * 60,
		cacheTags: ["web-api-model-realtime"],
	},
	trajectory: {
		edgeTtlSeconds: 60 * 60,
		staleWhileRevalidateSeconds: 6 * 60 * 60,
		cacheTags: ["web-api-model-token-trajectories"],
	},
	routingHealth: {
		edgeTtlSeconds: 5 * 60,
		staleWhileRevalidateSeconds: 5 * 60,
		cacheTags: ["web-api-provider-routing-health"],
	},
	providerHealth: {
		edgeTtlSeconds: 5 * 60,
		staleWhileRevalidateSeconds: 5 * 60,
		cacheTags: ["web-api-model-provider-health"],
	},
	notice: {
		edgeTtlSeconds: 60 * 60,
		staleWhileRevalidateSeconds: 24 * 60 * 60,
		cacheTags: ["web-api-model-notices"],
	},
	apps: { edgeTtlSeconds: 15 * 60, staleWhileRevalidateSeconds: 60 * 60, cacheTags: ["web-api-model-apps"] },
} as const satisfies Record<string, PublicCachePolicy>;

const MODEL_OVERVIEW_SELECT = `
	model_id, name, organisation_id, description, status, previous_model_id,
	announcement_date, release_date, deprecation_date, retirement_date, license,
	input_types, output_types, family_id, timeline, updated_at,
	organisation:data_organisations!data_models_organisation_id_fkey(name, country_code),
	model_links:data_model_links(url, platform, kind, title),
	model_family:data_model_families(family_name),
	model_details:data_model_details(detail_name, detail_value)
`;

function parseBoundedInt(value: string | null, fallback: number, maximum: number) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, Math.min(maximum, Math.floor(parsed)));
}

function modelTag(modelId: string) {
	return `web-api-model-${encodeURIComponent(modelId).replace(/%/g, "")}`.slice(0, 128);
}

function toStringList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
	if (typeof value !== "string") return [];
	const trimmed = value.trim();
	if (!trimmed) return [];
	return (trimmed.startsWith("{") && trimmed.endsWith("}")
		? trimmed.slice(1, -1).split(",")
		: trimmed.split(/[\s,]+/))
		.map((item) => item.trim().replace(/^"|"$/g, ""))
		.filter(Boolean);
}

function normaliseGatewayStatus(value: unknown, isActive: unknown): string {
	const status = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
	if (status === "disabled" || status === "inactive" || status.startsWith("deranked")) return status;
	if (status && status !== "active") return status;
	return isActive ? "active" : "inactive";
}

function collectJsonTokens(value: unknown, tokens: string[] = []): string[] {
	if (Array.isArray(value)) {
		for (const item of value) collectJsonTokens(item, tokens);
	} else if (value && typeof value === "object") {
		for (const [key, item] of Object.entries(value)) {
			tokens.push(key);
			collectJsonTokens(item, tokens);
		}
	} else if (value !== null && value !== undefined) {
		tokens.push(String(value));
	}
	return tokens;
}

function gatewayFeatures(params: unknown): string[] {
	const features = new Set<string>();
	for (const token of collectJsonTokens(params)) {
		const value = token.toLowerCase().replace(/[\s-]+/g, "_");
		if (value.includes("reasoning") || value.includes("thinking")) features.add("reasoning");
		if (value.includes("tool") || value.includes("function_call")) features.add("tools");
		if (value.includes("structured_output") || value.includes("json_schema")) features.add("structured_outputs");
		if (value.includes("web_search") || value.includes("websearch")) features.add("web_search");
	}
	return [...features].sort();
}

function supportedParameters(params: unknown): string[] {
	if (!params || typeof params !== "object") return [];
	const source = params as Record<string, unknown>;
	const properties = source.properties;
	if (properties && typeof properties === "object" && !Array.isArray(properties)) {
		return Object.keys(properties as Record<string, unknown>).sort();
	}
	return Object.keys(source)
		.filter((key) => !["type", "title", "description", "default", "required", "properties"].includes(key))
		.sort();
}

function numberOrNull(value: unknown): number | null {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
}

function outputTokens(usage: unknown): number | null {
	if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
	const record = usage as Record<string, unknown>;
	for (const key of [
		"output_tokens",
		"completion_tokens",
		"generated_tokens",
		"response_tokens",
		"outputTokens",
		"completionTokens",
		"total_tokens",
		"totalTokens",
	]) {
		const value = numberOrNull(record[key]);
		if (value != null && value > 0) return value;
	}
	return null;
}

const USAGE_INTEGER_FIELDS: Record<string, string> = {
	requests: "requests", success_requests: "successRequests", failed_requests: "failedRequests", neutral_requests: "neutralRequests", rate_limited_requests: "rateLimitedRequests", total_tokens: "totalTokens", input_tokens: "inputTokens", output_tokens: "outputTokens", reasoning_tokens: "reasoningTokens", input_text_tokens: "inputTextTokens", output_text_tokens: "outputTextTokens", input_image_tokens: "inputImageTokens", output_image_tokens: "outputImageTokens", input_audio_tokens: "inputAudioTokens", output_audio_tokens: "outputAudioTokens", input_video_tokens: "inputVideoTokens", output_video_tokens: "outputVideoTokens", image_inputs: "imageInputs", image_outputs: "imageOutputs", audio_inputs: "audioInputs", audio_outputs: "audioOutputs", video_inputs: "videoInputs", video_outputs: "videoOutputs", cached_read_tokens: "cachedReadTokens", cached_write_tokens: "cachedWriteTokens", cached_read_text_tokens: "cachedReadTextTokens", cached_write_text_tokens: "cachedWriteTextTokens", cached_write_text_tokens_5m: "cachedWriteTextTokens5m", cached_write_text_tokens_1h: "cachedWriteTextTokens1h", cached_read_image_tokens: "cachedReadImageTokens", cached_write_image_tokens: "cachedWriteImageTokens", cached_read_audio_tokens: "cachedReadAudioTokens", cached_write_audio_tokens: "cachedWriteAudioTokens", cached_read_video_tokens: "cachedReadVideoTokens", cached_write_video_tokens: "cachedWriteVideoTokens", input_quad_tokens: "inputQuadTokens", output_quad_tokens: "outputQuadTokens", total_quad_tokens: "totalQuadTokens", text_quad_tokens: "textQuadTokens", rerank_quad_tokens: "rerankQuadTokens", embedding_quad_tokens: "embeddingQuadTokens", moderation_quad_tokens: "moderationQuadTokens", ocr_quad_tokens: "ocrQuadTokens", input_characters: "inputCharacters", output_characters: "outputCharacters", total_characters: "totalCharacters", total_cost_nanos: "totalCostNanos",
};

function mapUsageDailyRow(row: Record<string, unknown>) {
	const mapped: Record<string, unknown> = { dayBucket: String(row.day_bucket ?? "").slice(0, 10), modelId: String(row.model_id ?? ""), providerId: String(row.provider_id ?? ""), endpoint: String(row.endpoint ?? "") };
	for (const [source, target] of Object.entries(USAGE_INTEGER_FIELDS)) mapped[target] = Math.max(0, Math.trunc(Number(row[source] ?? 0) || 0));
	for (const [source, target] of [["image_megapixels", "imageMegapixels"], ["audio_seconds", "audioSeconds"], ["video_pixel_seconds", "videoPixelSeconds"]] as const) mapped[target] = Number(row[source] ?? 0) || 0;
	for (const [source, target] of [["avg_latency_ms", "avgLatencyMs"], ["avg_generation_ms", "avgGenerationMs"], ["avg_throughput", "avgThroughput"]] as const) mapped[target] = numberOrNull(row[source]);
	return mapped;
}

async function modelAliases(env: Env, modelId: string): Promise<string[]> {
	const aliases = new Set([modelId]);
	const client = getDataClient(env);
	const [byModelId, byApiModelId] = await Promise.all([
		client.from("data_api_provider_models").select("model_id,api_model_id").eq("model_id", modelId),
		client.from("data_api_provider_models").select("model_id,api_model_id").eq("api_model_id", modelId),
	]);
	for (const result of [byModelId, byApiModelId]) {
		if (result.error) throw result.error;
		for (const row of result.data ?? []) {
			const internalId = normalisedId(row.model_id);
			const apiId = normalisedId(row.api_model_id);
			if (internalId) aliases.add(internalId);
			if (apiId) aliases.add(apiId);
		}
	}
	return [...aliases];
}

function benchmarkType(value: unknown): "percentage" | "numerical" | null { const normalized = String(value ?? "").trim().toLowerCase(); return ["percentage", "percent", "pct", "%"].includes(normalized) ? "percentage" : ["numerical", "numeric", "number"].includes(normalized) ? "numerical" : null; }
function benchmarkScore(value: unknown, percentage: boolean): number | null { const match = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value.match(/[-+]?[0-9]*\.?[0-9]+/)?.[0] ?? "") : Number.NaN; if (!Number.isFinite(match)) return null; return percentage && Math.abs(match) > 0 && Math.abs(match) <= 1 ? match * 100 : match; }
function scoreDisplay(value: number | null, percentage: boolean, fallback: unknown): string { if (value == null) return fallback == null ? "-" : String(fallback); const formatted = value % 1 === 0 || Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2); return percentage ? `${formatted}%` : formatted; }
function benchmarkHighlights(results: Array<Record<string, unknown>>) {
	const selected = new Map<string, Record<string, unknown>>();
	for (const result of results) {
		const benchmark = (Array.isArray(result.benchmark) ? result.benchmark[0] : result.benchmark) as Record<string, unknown> | null; const id = String(result.benchmark_id ?? benchmark?.id ?? ""); if (!id) continue;
		const type = benchmarkType(benchmark?.type); const percentage = type ? type === "percentage" : typeof result.score === "string" && result.score.includes("%"); const score = benchmarkScore(result.score, percentage); const candidate = { ...result, _benchmark: benchmark ?? {}, _score: score, _percentage: percentage };
		const previous = selected.get(id); if (!previous) { selected.set(id, candidate); continue; }
		const rank = typeof result.rank === "number" ? result.rank : null; const previousRank = typeof previous.rank === "number" ? previous.rank : null;
		if (rank != null && (previousRank == null || rank < previousRank)) { selected.set(id, candidate); continue; } if (rank != null && previousRank != null && rank > previousRank) continue;
		const oldScore = typeof previous._score === "number" ? previous._score : null; if (score != null && (oldScore == null || (benchmark?.ascending_order === false ? score < oldScore : score > oldScore))) selected.set(id, candidate);
	}
	return Array.from(selected.entries()).map(([id, result]) => { const benchmark = result._benchmark as Record<string, unknown>; const score = typeof result._score === "number" ? result._score : null; const percentage = Boolean(result._percentage); return { benchmarkId: id, benchmarkName: String(benchmark.name ?? id), totalModels: typeof benchmark.total_models === "number" ? benchmark.total_models : null, rank: typeof result.rank === "number" ? result.rank : null, score, scoreDisplay: scoreDisplay(score, percentage, result.score), isPercentage: percentage, isSelfReported: Boolean(result.is_self_reported), otherInfo: typeof result.other_info === "string" ? result.other_info : null, sourceLink: typeof result.source_link === "string" ? result.source_link : null }; }).sort((a, b) => (b.totalModels ?? -1) - (a.totalModels ?? -1) || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.benchmarkName.localeCompare(b.benchmarkName));
}

function normalisedId(value: unknown): string | null {
	const id = String(value ?? "").trim();
	return id.length > 0 ? id : null;
}

async function resolveNoticeApiModelId(env: Env, modelId: string): Promise<string | null> {
	const client = getDataClient(env);
	const [aliasResult, internalResult, providerResult] = await Promise.all([
		client
			.from("data_api_model_aliases")
			.select("api_model_id")
			.eq("alias_slug", modelId)
			.eq("is_enabled", true)
			.maybeSingle(),
		client
			.from("data_models")
			.select("model_id")
			.eq("model_id", modelId)
			.eq("hidden", false)
			.maybeSingle(),
		client
			.from("data_api_provider_models")
			.select("api_model_id")
			.eq("model_id", modelId)
			.not("api_model_id", "is", null)
			.limit(1),
	]);
	for (const result of [aliasResult, internalResult, providerResult]) {
		if (result.error) throw result.error;
	}
	return normalisedId(aliasResult.data?.api_model_id)
		?? (internalResult.data ? normalisedId(modelId) : null)
		?? normalisedId(providerResult.data?.[0]?.api_model_id)
		?? null;
}

type ModelsCatalogueVersion = "v1" | "v2";

async function fetchProviderExecutionRegions(env: Env, providerIds: string[]) {
	const regionsByProvider = new Map<string, string[]>();
	if (providerIds.length === 0) return regionsByProvider;
	const { data, error } = await getDataClient(env)
		.from("data_api_providers")
		.select("api_provider_id,default_execution_regions")
		.in("api_provider_id", providerIds);
	if (error) throw error;
	for (const row of (data ?? []) as Record<string, unknown>[]) {
		const providerId = String(row.api_provider_id ?? "").trim();
		if (!providerId) continue;
		const regions = toStringList(row.default_execution_regions)
			.map((region) => region.toLowerCase())
			.filter(Boolean);
		regionsByProvider.set(providerId, [...new Set(regions)]);
	}
	return regionsByProvider;
}

export async function fetchGatewayMonitorRows(
	env: Env,
	catalogueVersion: ModelsCatalogueVersion = "v1",
): Promise<Map<string, Record<string, unknown>[]>> {
	const client = getDataClient(env);
	const rows: Record<string, unknown>[] = [];
	const rpcName =
		catalogueVersion === "v2"
			? "get_monitor_model_rows_v2"
			: "get_monitor_model_rows";
	for (let offset = 0; ; offset += 1000) {
		const { data, error } = await client
			.rpc(rpcName, { p_include_hidden: false })
			.range(offset, offset + 999);
		if (error) throw error;
		const page = (data ?? []) as Record<string, unknown>[];
		rows.push(...page.filter((row) => String(row.capability_status ?? "").toLowerCase() !== "internal_testing"));
		if (page.length < 1000) break;
	}
	const providerRegionsById = await fetchProviderExecutionRegions(
		env,
		Array.from(
			new Set(
				rows
					.map((row) => String(row.provider_id ?? "").trim())
					.filter(Boolean),
			),
		),
	);

	const byModelId = new Map<string, Record<string, unknown>[]>();
	for (const row of rows) {
		const modelId = String(row.model_id ?? row.api_model_id ?? "").trim();
		const providerId = String(row.provider_id ?? "").trim();
		const apiModelId = String(row.api_model_id ?? "").trim();
		const capabilityId = String(row.capability_id ?? "").trim();
		if (!modelId || !providerId || !apiModelId || !capabilityId) continue;
		const params = row.capability_params;
		const monitorRow = {
			id: `${modelId}-${providerId}-${capabilityId}`,
			model: String(row.model_name ?? modelId).trim() || modelId,
			modelId,
			apiModelId,
			organisationId: row.organisation_id ?? undefined,
			organisationName: row.organisation_name ?? undefined,
			provider: {
				name: String(row.api_provider_name ?? providerId).trim() || providerId,
				id: providerId,
				inputPrice: numberOrNull(row.input_price) ?? 0,
				outputPrice: numberOrNull(row.output_price) ?? 0,
				standardInputPrice: numberOrNull(row.standard_input_price),
				standardOutputPrice: numberOrNull(row.standard_output_price),
				standardInputPriceLabel: row.standard_input_price_label ?? null,
				standardInputPriceUnit: row.standard_input_price_unit ?? null,
				standardOutputPriceLabel: row.standard_output_price_label ?? null,
				standardOutputPriceUnit: row.standard_output_price_unit ?? null,
				fromPrice: numberOrNull(row.from_price),
				fromPriceUnit: row.from_price_unit ?? null,
				pricingDetailRows: [],
				features: gatewayFeatures(params),
				executionRegions: providerRegionsById.get(providerId) ?? [],
			},
			endpoint: capabilityId,
			gatewayStatus: normaliseGatewayStatus(row.capability_status, row.is_active_gateway),
			inputModalities: toStringList(row.input_modalities).length ? toStringList(row.input_modalities) : toStringList(row.model_input_types),
			outputModalities: toStringList(row.output_modalities).length ? toStringList(row.output_modalities) : toStringList(row.model_output_types),
			context: numberOrNull(row.context_length) ?? numberOrNull(row.capability_max_input_tokens) ?? 0,
			maxOutput: numberOrNull(row.provider_max_output_tokens) ?? numberOrNull(row.capability_max_output_tokens) ?? 0,
			quantization: row.quantization_scheme ?? undefined,
			supportedParameters: supportedParameters(params),
			effectiveFrom: row.effective_from ?? undefined,
			tier: row.is_free_variant ? "free" : String(row.pricing_tier ?? "standard"),
			added: row.model_release_date ?? undefined,
			retired: row.model_retirement_date ?? undefined,
			weeklyTokensModel: numberOrNull(row.weekly_tokens_model),
			weeklyTokensModelProvider: numberOrNull(row.weekly_tokens_model_provider),
			weeklyThroughputModel: numberOrNull(row.weekly_throughput_model),
			weeklyLatencyModel: numberOrNull(row.weekly_latency_model),
		};
		byModelId.set(modelId, [...(byModelId.get(modelId) ?? []), monitorRow]);
	}
	return byModelId;
}

async function matchCachedCatalogue(request: Request): Promise<Response | null> {
	if (typeof caches === "undefined") return null;
	try {
		const response = await (caches as unknown as { default: Cache }).default.match(request);
		if (!response) return null;
		const headers = new Headers(response.headers);
		headers.set("X-Phaseo-Local-Cache", "HIT");
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	} catch {
		return null;
	}
}

async function storeCatalogueInCache(request: Request, response: Response): Promise<void> {
	if (typeof caches === "undefined") return;
	try {
		await (caches as unknown as { default: Cache }).default.put(request, response.clone());
	} catch {
		// Cloudflare's CDN headers remain the shared-cache fallback if a local
		// Cache API write is unavailable or rejected.
	}
}

function sectionPolicy(section: keyof typeof CACHE_PROFILES, modelId?: string): PublicCachePolicy {
	const profile = CACHE_PROFILES[section];
	return {
		...profile,
		cacheTags: modelId ? [...profile.cacheTags, modelTag(modelId)] : profile.cacheTags,
	};
}

function cataloguePolicy(catalogueVersion: ModelsCatalogueVersion, includeVirtual = false): PublicCachePolicy {
	const policy = sectionPolicy("catalogue");
	const versionPolicy = catalogueVersion === "v2"
		? { ...policy, cacheTags: [...(policy.cacheTags ?? []), "web-api-models-v2"] }
		: policy;
	return includeVirtual
		? { ...versionPolicy, cacheTags: [...(versionPolicy.cacheTags ?? []), "web-api-free-router-overview"] }
		: versionPolicy;
}

function notFound(c: { json: (value: unknown, status: number) => Response }) {
	return c.json({ error: "model_not_found" }, 404);
}

export const publicModelsRouter = new Hono<{ Bindings: Env }>();

/** Main models API. Deliberately excludes volatile benchmark/performance data. */
publicModelsRouter.get("/", async (c) => {
	const cached = await matchCachedCatalogue(c.req.raw);
	if (cached) return cached;
	try {
		const requestedVersion = c.req.query("catalogue_version")?.trim().toLowerCase();
		if (requestedVersion && requestedVersion !== "v1" && requestedVersion !== "v2") {
			return c.json({ error: "invalid_catalogue_version" }, 400);
		}
		const catalogueVersion: ModelsCatalogueVersion =
			requestedVersion === "v2" ? "v2" : "v1";
		const limit = Math.max(1, parseBoundedInt(c.req.query("limit"), 100, 2_000));
		const offset = parseBoundedInt(c.req.query("offset"), 0, 10_000);
		const search = c.req.query("search")?.trim();
		if (c.req.query("shape") === "page" && catalogueVersion === "v1") {
			const projection = parseBoundedInt(c.req.query("projection"), 4, 100);
			const includeVirtual = projection >= 5;
			const [catalogue, freeRouter] = await Promise.all([
				fetchModelsPageCatalogue(c.env),
				includeVirtual ? fetchFreeRouterOverview(c.env) : Promise.resolve(null),
			]);
			const databaseModels = catalogue.models.filter((model) => model.model_id !== "phaseo/free");
			const allModels = freeRouter ? [buildFreeRouterCatalogueRow(freeRouter), ...databaseModels] : databaseModels;
			const normalizedSearch = search?.toLowerCase();
			const filtered = normalizedSearch ? allModels.filter((model) => String(model.name ?? "").toLowerCase().includes(normalizedSearch)) : allModels;
			const response = withPublicCache(c.json({ models: filtered.slice(offset, offset + limit), facets: buildModelsPageFacets(filtered), pricing_complete: catalogue.pricingComplete, total: filtered.length, limit, offset, catalogue_version: catalogueVersion, shape: "page", projection }), cataloguePolicy(catalogueVersion, includeVirtual));
			await storeCatalogueInCache(c.req.raw, response);
			return response;
		}
		const gatewayRowsByModelId = await fetchGatewayMonitorRows(
			c.env,
			catalogueVersion,
		);
		const table = catalogueVersion === "v2" ? "data_models_v2" : "data_models";
		const select = catalogueVersion === "v2"
			? "model_id,full_name,organisation_id,description,status,release_date,announcement_date,updated_at,input_modalities,output_modalities,organisation:data_organisations!data_models_v2_organisation_id_fkey(name,colour)"
			: "model_id,name,organisation_id,description,status,release_date,announcement_date,updated_at,input_types,output_types,organisation:data_organisations(name,colour)";
		const createQuery = () => {
			let query = getDataClient(c.env)
				.from(table)
				.select(select, { count: "exact" })
				.eq("hidden", false)
				.order(catalogueVersion === "v2" ? "full_name" : "name", {
					ascending: true,
				});
			if (search) {
				query = query.ilike(
					catalogueVersion === "v2" ? "full_name" : "name",
					`%${search.replace(/[\\%_]/g, "\\$&")}%`,
				);
			}
			return query;
		};

		// Supabase returns at most 1,000 rows per REST request. Assemble a larger
		// requested page here so callers still receive one canonical API response.
		const databasePageSize = 1_000;
		const rows: Record<string, unknown>[] = [];
		let count = 0;
		for (let pageOffset = offset; pageOffset < offset + limit; pageOffset += databasePageSize) {
			const { data, error, count: pageCount } = await createQuery().range(
				pageOffset,
				Math.min(pageOffset + databasePageSize - 1, offset + limit - 1),
			);
			if (error) throw error;
			if (pageOffset === offset) count = pageCount ?? 0;
			const page = (data ?? []) as Record<string, unknown>[];
			rows.push(...page);
			if (page.length < databasePageSize) break;
		}

		const models = rows.map((model) => ({
			...model,
			...(catalogueVersion === "v2"
				? {
					name: model.full_name,
					input_types: model.input_modalities,
					output_types: model.output_modalities,
				}
				: {}),
			gateway_monitor_rows:
				gatewayRowsByModelId.get(String(model.model_id ?? "")) ?? [],
		}));
		const response = withPublicCache(
			c.json({ models, total: count, limit, offset, catalogue_version: catalogueVersion }),
			cataloguePolicy(catalogueVersion),
		);
		await storeCatalogueInCache(c.req.raw, response);
		return response;
	} catch (error) {
		console.error("[web-api/models] catalogue failed", error);
		return c.json({ error: "models_unavailable" }, 503);
	}
});

/** Volatile provider circuit-breaker state shared by model provider lists. */
publicModelsRouter.get("/provider-routing-health", async (c) => {
	const providerIds = [...new Set(
		(c.req.query("provider_ids") ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	)].sort((left, right) => left.localeCompare(right));
	if (providerIds.length === 0) {
		return withPublicCache(c.json({ providers: {} }), sectionPolicy("routingHealth"));
	}
	if (providerIds.length > 100) return c.json({ error: "too_many_provider_ids" }, 400);
	const windowHours = Math.max(1, parseBoundedInt(c.req.query("window_hours"), 24, 168));
	const nowMs = Date.now();
	const sinceIso = new Date(nowMs - windowHours * 60 * 60 * 1000).toISOString();
	try {
		const rows: Array<Record<string, unknown>> = [];
		for (let offset = 0; offset < 20_000; offset += 1_000) {
			const { data, error } = await getDataClient(c.env)
				.from("gateway_provider_health_states")
				.select("provider_id,breaker_state,is_deranked,open_until_ms,updated_at")
				.in("provider_id", providerIds)
				.gte("updated_at", sinceIso)
				.order("updated_at", { ascending: false })
				.range(offset, offset + 999);
			if (error) throw error;
			rows.push(...((data ?? []) as Array<Record<string, unknown>>));
			if ((data?.length ?? 0) < 1_000) break;
		}
		const providers = Object.fromEntries(providerIds.map((providerId) => {
			const matches = rows.filter((row) => row.provider_id === providerId);
			const openCount = matches.filter((row) => row.breaker_state === "open").length;
			const halfOpenCount = matches.filter((row) => row.breaker_state === "half_open").length;
			const deranked = matches.some((row) => Boolean(row.is_deranked)
				|| (row.breaker_state === "open" && Number(row.open_until_ms ?? 0) > nowMs));
			return [providerId, {
				providerId,
				deranked,
				recovering: !deranked && halfOpenCount > 0,
				openCount,
				halfOpenCount,
				checkedPairs: matches.length,
			}];
		}));
		return withPublicCache(c.json({ providers }), sectionPolicy("routingHealth"));
	} catch (error) {
		console.error("[web-api/models] provider routing health failed", { providerIds, error });
		return c.json({ error: "provider_routing_health_unavailable" }, 503);
	}
});

/** Public standard-rate rows used to enrich catalogue-only model cards. */
publicModelsRouter.get("/catalog-pricing-rules", async (c) => {
	try {
		const rows: Array<Record<string, unknown>> = [];
		for (let offset = 0; ; offset += 1_000) {
			const { data, error } = await getDataClient(c.env)
				.from("data_api_pricing_rules")
				.select("model_key,pricing_plan,meter,note,unit,unit_size,price_per_unit,effective_from,effective_to")
				.order("rule_id", { ascending: true })
				.range(offset, offset + 999);
			if (error) throw error;
			rows.push(...((data ?? []) as Array<Record<string, unknown>>));
			if ((data?.length ?? 0) < 1_000) break;
		}
		return withPublicCache(c.json({ rules: rows }), sectionPolicy("catalogPricing"));
	} catch (error) {
		console.error("[web-api/models] catalogue pricing failed", error);
		return c.json({ error: "catalog_pricing_unavailable" }, 503);
	}
});

publicModelsRouter.get("/free-router-overview", async (c) => {
	try {
		return withPublicCache(c.json(await fetchFreeRouterOverview(c.env)), sectionPolicy("freeRouter"));
	} catch (error) {
		console.error("[web-api/models] free router overview failed", error);
		return c.json({ error: "free_router_overview_unavailable" }, 503);
	}
});

/** Stable model facts used by the overview, about, timeline, and SEO surfaces. */
publicModelsRouter.get("/:modelId", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const client = getDataClient(c.env);
		const [modelResult, aliasResult] = await Promise.all([
			client.from("data_models").select(MODEL_OVERVIEW_SELECT).eq("model_id", modelId).eq("hidden", false).maybeSingle(),
			client.from("data_api_model_aliases").select("alias_slug").eq("api_model_id", modelId).eq("is_enabled", true).order("alias_slug", { ascending: true }),
		]);
		const { data, error } = modelResult;
		if (error) throw error;
		if (aliasResult.error) throw aliasResult.error;
		if (!data) return notFound(c);
		const modelDetails = Array.isArray(data.model_details)
			? [...data.model_details]
			: [];
		if (data.license) {
			modelDetails.push({ detail_name: "license", detail_value: data.license });
		}
		const model = {
			...data,
			aliases: [...new Set((aliasResult.data ?? []).map((row) => String(row.alias_slug ?? "").trim()).filter(Boolean))],
			license: data.license ? null : data.license ?? null,
			model_details: modelDetails,
		};
		return withPublicCache(c.json({ model }), sectionPolicy("overview", modelId));
	} catch (error) {
		console.error("[web-api/models] overview failed", { modelId, error });
		return c.json({ error: "model_unavailable" }, 503);
	}
});

/** Near-realtime request-window metrics; deliberately isolated from stable model facts. */
publicModelsRouter.get("/:modelId/realtime", async (c) => {
	const modelId = c.req.param("modelId");
	const windowMinutes = Math.max(1, parseBoundedInt(c.req.query("minutes"), 30, 24 * 60));
	try {
		const aliases = await modelAliases(c.env, modelId);
		const now = new Date();
		const sinceIso = new Date(now.getTime() - windowMinutes * 60_000).toISOString();
		const rows: Array<Record<string, unknown>> = [];
		for (let offset = 0; ; offset += 5_000) {
			const { data, error } = await getDataClient(c.env)
				.from("gateway_requests")
				.select("latency_ms,throughput,generation_ms,usage")
				.in("model_id", aliases)
				.gte("created_at", sinceIso)
				.lte("created_at", now.toISOString())
				.order("created_at", { ascending: true })
				.range(offset, offset + 4_999);
			if (error) throw error;
			rows.push(...((data ?? []) as Array<Record<string, unknown>>));
			if ((data?.length ?? 0) < 5_000) break;
		}
		const latencies: number[] = [];
		const throughputs: number[] = [];
		for (const row of rows) {
			const latency = numberOrNull(row.latency_ms);
			if (latency != null && latency > 0) latencies.push(latency);
			const directThroughput = numberOrNull(row.throughput);
			if (directThroughput != null && directThroughput > 0) {
				throughputs.push(directThroughput);
				continue;
			}
			const generationMs = numberOrNull(row.generation_ms);
			const tokens = outputTokens(row.usage);
			if (generationMs != null && generationMs > 0 && tokens != null) {
				throughputs.push((tokens * 1_000) / generationMs);
			}
		}
		return withPublicCache(c.json({ stats: {
			requestsInWindow: rows.length,
			latencyP50Ms: median(latencies),
			throughputP50TokPerSec: median(throughputs),
		} }), sectionPolicy("realtime", modelId));
	} catch (error) {
		console.error("[web-api/models] realtime stats failed", { modelId, error });
		return c.json({ error: "model_realtime_unavailable" }, 503);
	}
});

publicModelsRouter.get("/:modelId/token-trajectory", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const client = getDataClient(c.env);
		const { data: model, error: modelError } = await client
			.from("data_models")
			.select("model_id")
			.eq("model_id", modelId)
			.eq("hidden", false)
			.maybeSingle();
		if (modelError) throw modelError;
		if (!model) return notFound(c);
		const { data, error } = await client.rpc("get_model_token_trajectory", { p_model_id: modelId });
		if (error) throw error;
		const row = (data?.[0] ?? null) as Record<string, unknown> | null;
		if (!row?.release_date) {
			return withPublicCache(c.json({ trajectory: null }), sectionPolicy("trajectory", modelId));
		}
		const points = Array.isArray(row.points) ? row.points as Array<Record<string, unknown>> : [];
		const deprecationDate = typeof row.deprecation_date === "string" ? row.deprecation_date : null;
		const trajectory = {
			releaseDate: String(row.release_date),
			deprecationDate,
			deprecationDaysSinceRelease: deprecationDate
				? numberOrNull(points.find((point) => String(point.date ?? "").startsWith(deprecationDate.slice(0, 10)))?.daysSinceRelease)
				: null,
			points,
			tokenMilestones: Array.isArray(row.token_milestones) ? row.token_milestones : [],
			successorMilestones: Array.isArray(row.successor_milestones) ? row.successor_milestones : [],
		};
		return withPublicCache(c.json({ trajectory }), sectionPolicy("trajectory", modelId));
	} catch (error) {
		console.error("[web-api/models] token trajectory failed", { modelId, error });
		return c.json({ error: "model_token_trajectory_unavailable" }, 503);
	}
});

publicModelsRouter.get("/:modelId/header", async (c) => {
	const modelId = c.req.param("modelId");
	if (modelId === "phaseo/free") {
		return withPublicCache(c.json({ header: { model_id: "phaseo/free", name: "Phaseo Free Router", organisation_id: "phaseo", organisation: { name: "Phaseo", country_code: "" }, aliases: [], status: "Available", hidden: false } }), sectionPolicy("overview", modelId));
	}
	try {
		const client = getDataClient(c.env);
		const { data: model, error } = await client.from("data_models")
			.select("model_id,name,status,organisation_id,hidden,family_id,organisation:data_organisations!data_models_organisation_id_fkey(name,country_code)")
			.eq("model_id", modelId).eq("hidden", false).maybeSingle();
		if (error) throw error;
		let apiModelId = model?.model_id ?? null;
		let resolvedModelId = model?.model_id ?? null;
		let name = model?.name ?? null;
		let organisationId = model?.organisation_id ?? null;
		let organisation = Array.isArray(model?.organisation) ? model?.organisation[0] : model?.organisation;
		if (!model) {
			const [apiResult, byApiResult, byModelResult] = await Promise.all([
				client.from("data_api_models").select("api_model_id,display_name,organisation_id").eq("api_model_id", modelId).maybeSingle(),
				client.from("data_api_provider_models").select("model_id,api_model_id").eq("api_model_id", modelId).not("model_id", "is", null).limit(1),
				client.from("data_api_provider_models").select("model_id,api_model_id").eq("model_id", modelId).not("api_model_id", "is", null).limit(1),
			]);
			for (const result of [apiResult, byApiResult, byModelResult]) if (result.error) throw result.error;
			apiModelId = normalisedId(apiResult.data?.api_model_id) ?? normalisedId(byModelResult.data?.[0]?.api_model_id) ?? (byApiResult.data?.length ? modelId : null);
			resolvedModelId = apiModelId;
			name = normalisedId(apiResult.data?.display_name) ?? apiModelId;
			organisationId = normalisedId(apiResult.data?.organisation_id) ?? normalisedId(apiModelId?.split("/")[0]) ?? normalisedId(byApiResult.data?.[0]?.model_id?.split("/")[0]);
			if (organisationId) {
				const result = await client.from("data_organisations").select("name,country_code").eq("organisation_id", organisationId).maybeSingle();
				if (result.error) throw result.error;
				organisation = result.data;
			}
		}
		if (!resolvedModelId || !name || !organisationId) return notFound(c);
		const aliasResult = apiModelId ? await client.from("data_api_model_aliases").select("alias_slug").eq("api_model_id", apiModelId).eq("is_enabled", true).order("alias_slug", { ascending: true }) : { data: [], error: null };
		if (aliasResult.error) throw aliasResult.error;
		const aliases = [...new Set((aliasResult.data ?? []).map((row) => normalisedId(row.alias_slug)).filter((id): id is string => Boolean(id && id !== apiModelId)))];
		return withPublicCache(c.json({ header: { model_id: resolvedModelId, name, organisation_id: organisationId, organisation: { name: organisation?.name ?? organisationId, country_code: organisation?.country_code ?? "" }, aliases, family_id: model?.family_id ?? undefined, status: model?.status ?? null, hidden: false } }), sectionPolicy("overview", modelId));
	} catch (error) {
		console.error("[web-api/models] header failed", { modelId, error });
		return c.json({ error: "model_header_unavailable" }, 503);
	}
});

publicModelsRouter.get("/:modelId/canonical", async (c) => {
	const requestedModelId = c.req.param("modelId").trim();
	const unresolved = { requestedModelId, canonicalModelId: null, internalModelId: null, source: "unresolved" as const };
	if (!requestedModelId) return withPublicCache(c.json({ resolution: unresolved }), sectionPolicy("overview"));
	try {
		const client = getDataClient(c.env);
		const visibleInternal = async (ids: string[]) => {
			if (ids.length === 0) return null;
			const result = await client.from("data_models").select("model_id").in("model_id", ids).eq("hidden", false);
			if (result.error) throw result.error;
			const visible = new Set((result.data ?? []).map((row) => row.model_id));
			return ids.find((id) => visible.has(id)) ?? null;
		};
		const direct = await visibleInternal([requestedModelId]);
		if (direct) return withPublicCache(c.json({ resolution: { requestedModelId, canonicalModelId: direct, internalModelId: direct, source: "direct" } }), sectionPolicy("overview", requestedModelId));
		const [aliasResult, apiResult, byApiResult, byProviderIdResult, bySlugResult] = await Promise.all([
			client.from("data_api_model_aliases").select("api_model_id").eq("alias_slug", requestedModelId).eq("is_enabled", true).maybeSingle(),
			client.from("data_api_models").select("api_model_id").eq("api_model_id", requestedModelId).maybeSingle(),
			client.from("data_api_provider_models").select("model_id,api_model_id").eq("api_model_id", requestedModelId).not("model_id", "is", null).limit(50),
			client.from("data_api_provider_models").select("model_id,api_model_id").eq("provider_api_model_id", requestedModelId).not("model_id", "is", null).limit(1),
			client.from("data_api_provider_models").select("model_id,api_model_id").eq("provider_model_slug", requestedModelId).not("model_id", "is", null).limit(1),
		]);
		for (const result of [aliasResult, apiResult, byApiResult, byProviderIdResult, bySlugResult]) if (result.error) throw result.error;
		const alias = normalisedId(aliasResult.data?.api_model_id);
		if (alias) { const internalModelId = await visibleInternal((await client.from("data_api_provider_models").select("model_id").eq("api_model_id", alias).not("model_id", "is", null)).data?.map((row) => row.model_id) ?? []); return withPublicCache(c.json({ resolution: { requestedModelId, canonicalModelId: alias, internalModelId, source: "alias" } }), sectionPolicy("overview", requestedModelId)); }
		if (apiResult.data?.api_model_id) { const internalModelId = await visibleInternal((byApiResult.data ?? []).map((row) => row.model_id)); return withPublicCache(c.json({ resolution: { requestedModelId, canonicalModelId: requestedModelId, internalModelId, source: "api_model" } }), sectionPolicy("overview", requestedModelId)); }
		const mapping = byProviderIdResult.data?.[0] ?? bySlugResult.data?.[0];
		if (mapping?.model_id) { const internalModelId = await visibleInternal([mapping.model_id]); if (internalModelId) return withPublicCache(c.json({ resolution: { requestedModelId, canonicalModelId: normalisedId(mapping.api_model_id) ?? internalModelId, internalModelId, source: "provider_mapping" } }), sectionPolicy("overview", requestedModelId)); }
		return withPublicCache(c.json({ resolution: unresolved }), sectionPolicy("overview", requestedModelId));
	} catch (error) {
		console.error("[web-api/models] canonical resolution failed", { requestedModelId, error });
		return c.json({ error: "model_resolution_unavailable" }, 503);
	}
});

publicModelsRouter.get("/:modelId/availability", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const client = getDataClient(c.env);
		const select = "provider_api_model_id,is_active_gateway,routing_status,effective_from,effective_to,data_api_provider_model_capabilities(status),data_api_providers(status,routing_status)";
		const [byModel, byApi] = await Promise.all([
			client.from("data_api_provider_models").select(select).eq("model_id", modelId),
			client.from("data_api_provider_models").select(select).eq("api_model_id", modelId),
		]);
		if (byModel.error) throw byModel.error;
		if (byApi.error) throw byApi.error;
		const rows = new Map<string, Record<string, unknown>>();
		for (const row of [...(byModel.data ?? []), ...(byApi.data ?? [])] as Array<Record<string, unknown>>) {
			const id = normalisedId(row.provider_api_model_id);
			if (id) rows.set(id, row);
		}
		const now = Date.now();
		const status = (value: unknown) => normalisedId(value)?.toLowerCase().replace(/[\s-]+/g, "_") ?? null;
		const publicRouting = (value: unknown) => {
			const normalized = status(value);
			return normalized === null || normalized === "active" || normalized === "deranked_lvl1" || normalized === "deranked_lvl2" || normalized === "deranked_lvl3";
		};
		const activeProviderIds = new Set<string>();
		for (const row of rows.values()) {
			if (!row.is_active_gateway) continue;
			const from = row.effective_from ? Date.parse(String(row.effective_from)) : Number.NEGATIVE_INFINITY;
			const to = row.effective_to ? Date.parse(String(row.effective_to)) : Number.POSITIVE_INFINITY;
			if (now < from || now >= to) continue;
			const provider = (Array.isArray(row.data_api_providers) ? row.data_api_providers[0] : row.data_api_providers) as Record<string, unknown> | null | undefined;
			const providerStatus = status(provider?.status);
			if (providerStatus && providerStatus !== "active") continue;
			if (!publicRouting(provider?.routing_status) || !publicRouting(row.routing_status)) continue;
			const capabilities = Array.isArray(row.data_api_provider_model_capabilities) ? row.data_api_provider_model_capabilities as Array<Record<string, unknown>> : [];
			if (!capabilities.some((capability) => {
				const capabilityStatus = status(capability.status);
				return capabilityStatus === null || capabilityStatus === "active";
			})) continue;
			const providerModelId = normalisedId(row.provider_api_model_id);
			if (providerModelId) activeProviderIds.add(providerModelId);
		}
		return withPublicCache(c.json({ availability: { isGatewayActive: activeProviderIds.size > 0, activeProviderCount: activeProviderIds.size } }), sectionPolicy("catalogue", modelId));
	} catch (error) {
		console.error("[web-api/models] availability failed", { modelId, error });
		return c.json({ error: "model_availability_unavailable" }, 503);
	}
});

publicModelsRouter.get("/:modelId/usage-daily", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const aliases = new Set(await modelAliases(c.env, modelId));
		for (let pass = 0; pass < 2; pass++) {
			const ids = [...aliases]; const client = getDataClient(c.env);
			const [byModel, byApi, bySlug, aliasByApi, aliasBySlug] = await Promise.all([
				client.from("data_api_provider_models").select("model_id,api_model_id,provider_model_slug").in("model_id", ids), client.from("data_api_provider_models").select("model_id,api_model_id,provider_model_slug").in("api_model_id", ids), client.from("data_api_provider_models").select("model_id,api_model_id,provider_model_slug").in("provider_model_slug", ids), client.from("data_api_model_aliases").select("api_model_id,alias_slug").in("api_model_id", ids), client.from("data_api_model_aliases").select("api_model_id,alias_slug").in("alias_slug", ids),
			]);
			for (const result of [byModel, byApi, bySlug, aliasByApi, aliasBySlug]) { if (result.error) continue; for (const item of result.data ?? []) { const row = item as Record<string, unknown>; for (const value of [row.model_id, row.api_model_id, row.provider_model_slug, row.alias_slug]) { const id = normalisedId(value); if (id) aliases.add(id); } } }
		}
		const days = Math.max(1, Math.min(365, parseBoundedInt(c.req.query("days"), 30, 365))); const now = new Date(); const defaultSince = new Date(now); defaultSince.setUTCDate(defaultSince.getUTCDate() - days);
		const providerIds = [...new Set((c.req.query("provider_ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
		const { data, error } = await getDataClient(c.env).rpc("get_model_usage_daily_breakdown", { p_model_ids: [...aliases].sort(), p_provider_ids: providerIds.length ? providerIds.sort() : null, p_since: c.req.query("since")?.slice(0, 10) || defaultSince.toISOString().slice(0, 10), p_until: c.req.query("until")?.slice(0, 10) || now.toISOString().slice(0, 10) });
		if (error) throw error;
		return withPublicCache(c.json({ rows: ((data ?? []) as Array<Record<string, unknown>>).map(mapUsageDailyRow) }), sectionPolicy("usageDaily", modelId));
	} catch (error) { console.error("[web-api/models] usage daily failed", { modelId, error }); return c.json({ error: "model_usage_daily_unavailable" }, 503); }
});

publicModelsRouter.get("/:modelId/provider-health", async (c) => {
	const modelId = c.req.param("modelId");
	const providerIds = [...new Set((c.req.query("provider_ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean))].sort();
	if (!providerIds.length) return withPublicCache(c.json({ rows: [] }), sectionPolicy("providerHealth", modelId));
	try {
		const aliases = new Set([modelId, ...(c.req.query("model_aliases") ?? "").split(",").map((id) => id.trim()).filter(Boolean)]);
		for (const alias of await modelAliases(c.env, modelId)) aliases.add(alias);
		const { data, error } = await getDataClient(c.env).rpc("get_model_provider_health_metrics", { p_model_ids: [...aliases].sort(), p_provider_ids: providerIds, p_window_days: Math.max(1, Math.min(90, parseBoundedInt(c.req.query("window_days"), 3, 90))), p_bucket_hours: Math.max(1, Math.min(24 * 7, parseBoundedInt(c.req.query("bucket_hours"), 1, 24 * 7))) });
		if (error) throw error;
		return withPublicCache(c.json({ rows: data ?? [] }), sectionPolicy("providerHealth", modelId));
	} catch (error) { console.error("[web-api/models] provider health failed", { modelId, error }); return c.json({ error: "model_provider_health_unavailable" }, 503); }
});

publicModelsRouter.get("/:modelId/pricing-history", async (c) => {
	const modelId = c.req.param("modelId"); const days = Math.max(1, Math.min(365, parseBoundedInt(c.req.query("days"), 30, 365))); const now = Date.now(); const windowStart = now - days * 24 * 60 * 60 * 1_000;
	try {
		const client = getDataClient(c.env); const select = "provider_api_model_id,provider_id,api_model_id,model_id,data_api_provider_model_capabilities(capability_id,status),provider:data_api_providers(api_provider_name)";
		const [byModel, byApi] = await Promise.all([client.from("data_api_provider_models").select(select).eq("model_id", modelId), client.from("data_api_provider_models").select(select).eq("api_model_id", modelId)]);
		if (byModel.error) throw byModel.error; if (byApi.error) throw byApi.error;
		const rows = new Map<string, Record<string, any>>(); for (const row of [...(byModel.data ?? []), ...(byApi.data ?? [])] as Array<Record<string, any>>) if (row.provider_api_model_id) rows.set(row.provider_api_model_id, row);
		const providerByKey = new Map<string, { id: string; name: string }>(); const providerByPrefix = new Map<string, { id: string; name: string }>();
		for (const row of rows.values()) { const provider = Array.isArray(row.provider) ? row.provider[0] : row.provider; const info = { id: String(row.provider_id), name: String(provider?.api_provider_name ?? row.provider_id) }; for (const capability of row.data_api_provider_model_capabilities ?? []) { if (!capability.capability_id || String(capability.status ?? "").toLowerCase() === "internal_testing") continue; const key = `${row.provider_id}:${row.api_model_id}:${capability.capability_id}`; providerByKey.set(key, info); providerByPrefix.set(`${row.provider_id}:${row.api_model_id}:`, info); } }
		const keys = [...providerByKey.keys()]; if (!keys.length) return withPublicCache(c.json({ rules: [] }), sectionPolicy("pricingHistory", modelId));
		const { data, error } = await client.from("data_api_pricing_rules").select("rule_id,model_key,pricing_plan,meter,unit,unit_size,price_per_unit,currency,priority,effective_from,effective_to,note,match").in("model_key", keys).order("priority", { ascending: false }).order("effective_from", { ascending: false });
		if (error) throw error;
		const rules = (data ?? []).flatMap((row) => { const from = row.effective_from ? Date.parse(row.effective_from) : Number.NEGATIVE_INFINITY; const to = row.effective_to ? Date.parse(row.effective_to) : Number.POSITIVE_INFINITY; if (to < windowStart || from > now) return []; const modelKey = String(row.model_key ?? ""); const last = modelKey.lastIndexOf(":"); const info = providerByKey.get(modelKey) ?? (last > 0 ? providerByPrefix.get(`${modelKey.slice(0, last)}:`) : undefined); const unitSize = Number(row.unit_size ?? 1); const pricePerUnit = Number(row.price_per_unit); const meter = String(row.meter ?? "").trim().toLowerCase(); if (!info || !row.rule_id || !modelKey || !meter || !Number.isFinite(unitSize) || unitSize <= 0 || !Number.isFinite(pricePerUnit) || pricePerUnit < 0) return []; const extracted = modelKey.slice(modelKey.indexOf(":") + 1, last).toLowerCase(); const note = String(row.note ?? "").toLowerCase(); const inferredFree = extracted.endsWith(":free") || extracted.endsWith("-free") || note === "free" || note.startsWith("free "); const plan = String(row.pricing_plan ?? "").trim().toLowerCase(); return [{ ruleId: row.rule_id, providerId: info.id, providerName: info.name, modelKey, pricingPlan: !plan ? (inferredFree ? "free" : "standard") : plan === "standard" && inferredFree ? "free" : plan, meter, unit: String(row.unit ?? "token").toLowerCase(), unitSize, pricePerUnit, pricePer1MUnits: pricePerUnit * (1_000_000 / unitSize), currency: String(row.currency ?? "USD"), priority: Number(row.priority ?? 100), effectiveFrom: row.effective_from ?? null, effectiveTo: row.effective_to ?? null, note: row.note ?? null, match: Array.isArray(row.match) ? row.match : [] }]; }).sort((a, b) => a.providerName.localeCompare(b.providerName) || a.meter.localeCompare(b.meter) || (Date.parse(b.effectiveFrom ?? "") || Number.NEGATIVE_INFINITY) - (Date.parse(a.effectiveFrom ?? "") || Number.NEGATIVE_INFINITY));
		return withPublicCache(c.json({ rules }), sectionPolicy("pricingHistory", modelId));
	} catch (error) { console.error("[web-api/models] pricing history failed", { modelId, error }); return c.json({ error: "model_pricing_history_unavailable" }, 503); }
});

publicModelsRouter.get("/:modelId/gateway-metadata-source", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const source = await fetchGatewayMetadataSource(c.env, modelId);
		if (!source) return notFound(c);
		return withPublicCache(c.json({ source }), sectionPolicy("pricing", modelId));
	} catch (error) { console.error("[web-api/models] gateway metadata source failed", { modelId, error }); return c.json({ error: "model_gateway_metadata_unavailable" }, 503); }
});

publicModelsRouter.get("/:modelId/gateway-metadata", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const source = await fetchGatewayMetadataSource(c.env, modelId);
		if (!source) return notFound(c);
		return withPublicCache(c.json({ metadata: composeGatewayMetadata(modelId, source) }), sectionPolicy("pricing", modelId));
	} catch (error) {
		console.error("[web-api/models] gateway metadata failed", { modelId, error });
		return c.json({ error: "model_gateway_metadata_unavailable" }, 503);
	}
});

publicModelsRouter.get("/:modelId/notice", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const apiModelId = await resolveNoticeApiModelId(c.env, modelId);
		if (!apiModelId) {
			return withPublicCache(c.json({ notice: null }), sectionPolicy("notice", modelId));
		}
		const { data, error } = await getDataClient(c.env)
			.from("data_api_model_page_notices")
			.select("api_model_id,tone,markdown")
			.eq("api_model_id", apiModelId)
			.maybeSingle();
		if (error) throw error;
		const tone = String(data?.tone ?? "").trim();
		const markdown = String(data?.markdown ?? "").trim();
		const notice = data && apiModelId && markdown && ["info", "warning", "critical"].includes(tone)
			? { apiModelId, tone, markdown }
			: null;
		return withPublicCache(c.json({ notice }), sectionPolicy("notice", modelId));
	} catch (error) {
		console.error("[web-api/models] notice failed", { modelId, error });
		return c.json({ error: "model_notice_unavailable" }, 503);
	}
});

publicModelsRouter.get("/:modelId/apps", async (c) => {
	const modelId = c.req.param("modelId"); const limit = Math.max(1, Math.min(100, parseBoundedInt(c.req.query("limit"), 24, 100)));
	try {
		const client = getDataClient(c.env); const aliases = new Set([modelId]);
		const [byModel, byApi] = await Promise.all([
			client.from("data_api_provider_models").select("model_id,api_model_id").eq("model_id", modelId),
			client.from("data_api_provider_models").select("model_id,api_model_id").eq("api_model_id", modelId),
		]);
		for (const result of [byModel, byApi]) for (const row of result.data ?? []) { if (row.model_id) aliases.add(row.model_id); if (row.api_model_id) aliases.add(row.api_model_id); }
		const rpc = await client.rpc("get_usage_model_apps", { p_model_ids: Array.from(aliases), p_limit: limit, p_since: null });
		if (!rpc.error) {
			const apps = (rpc.data ?? []).map((row) => { const appId = String(row.app_id ?? "").trim(); return appId ? { appId, title: String(row.title ?? appId).trim() || appId, imageUrl: typeof row.image_url === "string" && row.image_url.trim() ? row.image_url.trim() : null, url: typeof row.url === "string" && row.url.trim() ? row.url.trim() : null, lastSeen: typeof row.last_seen === "string" && row.last_seen.trim() ? row.last_seen : null, totalRequests: Math.max(0, Math.round(Number(row.requests ?? 0) || 0)), successfulRequests: Math.max(0, Math.round(Number(row.success_requests ?? 0) || 0)), totalTokens: Math.max(0, Math.round(Number(row.total_tokens ?? 0) || 0)) } : null; }).filter((row): row is NonNullable<typeof row> => Boolean(row));
			return withPublicCache(c.json({ apps }), sectionPolicy("apps", modelId));
		}
		if (!String(rpc.error.message ?? "").toLowerCase().match(/does not exist|could not find|relation/)) throw rpc.error;
		const aggregate = new Map<string, { requests: number; success: number; tokens: number }>();
		for (let offset = 0; ; offset += 5000) {
			const result = await client.from("gateway_usage_rollup_daily_app_model").select("app_id,requests,success_requests,total_tokens").in("canonical_model_id", Array.from(aliases)).not("app_id", "is", null).order("day_bucket", { ascending: true }).order("app_id", { ascending: true }).range(offset, offset + 4999);
			if (result.error && (result.error.code === "PGRST205" || /could not find the table|does not exist/i.test(result.error.message ?? ""))) {
				return withPublicCache(c.json({ apps: [], source: "pending_apps_rpc_migration" }), sectionPolicy("apps", modelId));
			}
			if (result.error) throw result.error; for (const row of result.data ?? []) { const id = String(row.app_id ?? "").trim(); if (!id) continue; const item = aggregate.get(id) ?? { requests: 0, success: 0, tokens: 0 }; item.requests += Number(row.requests ?? 0) || 0; item.success += Number(row.success_requests ?? 0) || 0; item.tokens += Number(row.total_tokens ?? 0) || 0; aggregate.set(id, item); } if ((result.data?.length ?? 0) < 5000) break;
		}
		const ids = Array.from(aggregate.keys()); const metadata = new Map<string, Record<string, unknown>>();
		for (let offset = 0; offset < ids.length; offset += 500) { const result = await client.from("api_apps").select("id,title,image_url,url,last_seen,is_public").in("id", ids.slice(offset, offset + 500)); if (result.error) throw result.error; for (const row of result.data ?? []) metadata.set(row.id, row); }
		const apps = ids.map((appId) => { const usage = aggregate.get(appId)!; const meta = metadata.get(appId); return { appId, title: String(meta?.title ?? appId), imageUrl: typeof meta?.image_url === "string" ? meta.image_url : null, url: typeof meta?.url === "string" ? meta.url : null, lastSeen: typeof meta?.last_seen === "string" ? meta.last_seen : null, totalRequests: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(usage.requests))), successfulRequests: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(usage.success))), totalTokens: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(usage.tokens))), isPublic: Boolean(meta?.is_public) }; }).filter((row) => row.isPublic).sort((a, b) => b.totalTokens - a.totalTokens || b.totalRequests - a.totalRequests || a.appId.localeCompare(b.appId)).slice(0, limit).map(({ isPublic: _ignored, ...row }) => row);
		return withPublicCache(c.json({ apps }), sectionPolicy("apps", modelId));
	} catch (error) { console.error("[web-api/models] apps failed", { modelId, error }); return c.json({ error: "model_apps_unavailable" }, 503); }
});

/** Benchmark results are isolated so their long-lived cache never holds up live performance data. */
publicModelsRouter.get("/:modelId/benchmarks", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const { data, error } = await getDataClient(c.env)
			.from("data_models")
			.select(`model_id,benchmark_results:data_benchmark_results(id,benchmark_id,score,is_self_reported,other_info,source_link,created_at,updated_at,rank,benchmark:data_benchmarks(id,name,category,link,total_models,ascending_order,type))`)
			.eq("model_id", modelId)
			.eq("hidden", false)
			.maybeSingle();
		if (error) throw error;
		if (!data) return notFound(c);
		const results = (data.benchmark_results ?? []) as Array<Record<string, unknown>>;
		return withPublicCache(c.json({ modelId: data.model_id, results, highlights: benchmarkHighlights(results) }), sectionPolicy("benchmarks", modelId));
	} catch (error) {
		console.error("[web-api/models] benchmarks failed", { modelId, error });
		return c.json({ error: "benchmarks_unavailable" }, 503);
	}
});

publicModelsRouter.get("/:modelId/timeline", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const client = getDataClient(c.env);
		const { data: model, error } = await client
			.from("data_models")
			.select("model_id,name,previous_model_id,announcement_date,release_date,deprecation_date,retirement_date")
			.eq("model_id", modelId)
			.eq("hidden", false)
			.maybeSingle();
		if (error) throw error;
		if (!model) return notFound(c);
		const [previousResult, futureResult] = await Promise.all([
			model.previous_model_id
				? client.from("data_models").select("model_id,name,announcement_date,release_date").eq("model_id", model.previous_model_id).eq("hidden", false).maybeSingle()
				: Promise.resolve({ data: null, error: null }),
			client.from("data_models").select("model_id,name,announcement_date,release_date").eq("previous_model_id", modelId).eq("hidden", false),
		]);
		if (previousResult.error) throw previousResult.error;
		if (futureResult.error) throw futureResult.error;
		const events: Array<Record<string, string>> = [];
		for (const [date, eventName] of [[model.announcement_date, "Announced"], [model.release_date, "Released"], [model.deprecation_date, "Deprecated"], [model.retirement_date, "Retired"]] as const) {
			if (date) events.push({ date, eventType: "ModelEvent", eventName });
		}
		const previous = previousResult.data;
		const previousDate = previous?.release_date ?? previous?.announcement_date;
		if (previous && previousDate) events.push({ date: previousDate, eventType: "PreviousModel", modelId: previous.model_id, modelName: previous.name ?? previous.model_id });
		const future = (futureResult.data ?? [])
			.map((candidate) => ({ candidate, date: candidate.release_date ?? candidate.announcement_date }))
			.filter((entry): entry is { candidate: NonNullable<typeof entry.candidate>; date: string } => Boolean(entry.date))
			.sort((left, right) => left.date.localeCompare(right.date))[0];
		if (future) events.push({ date: future.date, eventType: "FutureModel", modelId: future.candidate.model_id, modelName: future.candidate.name ?? future.candidate.model_id });
		events.sort((left, right) => right.date.localeCompare(left.date));
		return withPublicCache(c.json({ events }), sectionPolicy("timeline", modelId));
	} catch (error) {
		console.error("[web-api/models] timeline failed", { modelId, error });
		return c.json({ error: "timeline_unavailable" }, 503);
	}
});

publicModelsRouter.get("/:modelId/subscription-plans", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const client = getDataClient(c.env);
		const { data: model, error: modelError } = await client.from("data_models").select("model_id").eq("model_id", modelId).eq("hidden", false).maybeSingle();
		if (modelError) throw modelError;
		if (!model) return notFound(c);
		const { data: modelPlans, error: modelPlansError } = await client.from("data_subscription_plan_models").select("plan_uuid,model_info,rate_limit,other_info").eq("model_id", modelId);
		if (modelPlansError) throw modelPlansError;
		if (!modelPlans?.length) return withPublicCache(c.json({ subscription_plans: [] }), sectionPolicy("subscriptions", modelId));
		const { data: planRows, error: planError } = await client
			.from("data_subscription_plans")
			.select("plan_uuid,plan_id,name,organisation_id,description,frequency,price,currency,link,other_info,created_at,updated_at,organisation:data_organisations!organisation_id(organisation_id,name,colour)")
			.in("plan_uuid", modelPlans.map((plan) => plan.plan_uuid))
			.order("plan_id", { ascending: true })
			.order("frequency", { ascending: true });
		if (planError) throw planError;
		const grouped = new Map<string, Record<string, unknown>>();
		for (const row of planRows ?? []) {
			const modelPlan = modelPlans.find((plan) => plan.plan_uuid === row.plan_uuid);
			const plan = grouped.get(row.plan_id) ?? {
				plan_id: row.plan_id, plan_uuid: row.plan_uuid, name: row.name, organisation_id: row.organisation_id,
				description: row.description, link: row.link, other_info: row.other_info, created_at: row.created_at,
				updated_at: row.updated_at, organisation: Array.isArray(row.organisation) ? row.organisation[0] ?? null : row.organisation ?? null,
				prices: [], model_info: { model_info: modelPlan?.model_info, rate_limit: modelPlan?.rate_limit, other_info: modelPlan?.other_info },
			};
			(plan.prices as Array<Record<string, unknown>>).push({ price: row.price, currency: row.currency, frequency: row.frequency });
			grouped.set(row.plan_id, plan);
		}
		return withPublicCache(c.json({ subscription_plans: Array.from(grouped.values()) }), sectionPolicy("subscriptions", modelId));
	} catch (error) {
		console.error("[web-api/models] subscription plans failed", { modelId, error });
		return c.json({ error: "model_subscription_plans_unavailable" }, 503);
	}
});

/** Pricing changes independently from model metadata, so it intentionally has its own shorter cache. */
publicModelsRouter.get("/:modelId/pricing", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const client = getDataClient(c.env);
		const { data: model, error: modelError } = await client.from("data_models").select("model_id").eq("model_id", modelId).eq("hidden", false).maybeSingle();
		if (modelError) throw modelError;
		if (!model) return notFound(c);
		const { providerRows, pricingRows } = await fetchModelPricingSources(c.env, [modelId]);
		const payload = c.req.query("shape") === "source"
			? { modelId, provider_rows: providerRows, pricing_rules: pricingRows }
			: { modelId, providers: composeModelPricing(providerRows, pricingRows) };
		return withPublicCache(c.json(payload), sectionPolicy("pricing", modelId));
	} catch (error) {
		console.error("[web-api/models] pricing failed", { modelId, error });
		return c.json({ error: "pricing_unavailable" }, 503);
	}
});

/** 15-minute cache for the live-ish performance rollup; raw RPC payload preserves the source fidelity. */
publicModelsRouter.get("/:modelId/performance", async (c) => {
	const modelId = c.req.param("modelId");
	try {
		const { data, error } = await getDataClient(c.env).rpc("get_model_performance_overview", {
			p_model_id: modelId,
		});
		if (error) throw error;
		const performance = data?.[0] ?? null;
		if (!performance) return withPublicCache(c.json({ modelId, performance: null, metrics: null, activity: null }), sectionPolicy("performance", modelId));
		const number = (value: unknown) => { const parsed = Number(value); return value == null || !Number.isFinite(parsed) ? null : parsed; };
		const summary = (value: Record<string, unknown> | null | undefined) => ({ avgThroughput: number(value?.avg_throughput), avgLatencyMs: number(value?.avg_latency_ms), avgGenerationMs: number(value?.avg_generation_ms), uptimePct: number(value?.uptime_pct), totalRequests: Number(value?.total_requests ?? 0), successfulRequests: Number(value?.successful_requests ?? 0) });
		const hourly = (performance.hourly_24h ?? []).map((value: Record<string, unknown>) => ({ bucket: value.bucket ?? "", avgThroughput: number(value.avg_throughput), avgLatencyMs: number(value.avg_latency_ms), avgGenerationMs: number(value.avg_generation_ms), requests: Number(value.requests ?? 0), successPct: number(value.success_pct) }));
		const providerPerformance = (performance.provider_uptime_24h ?? []).map((value: Record<string, any>) => ({ provider: value.provider ?? "", providerName: value.provider_name ?? value.provider ?? "", providerColor: null, avgThroughput: number(value.avg_throughput), avgLatencyMs: number(value.avg_latency_ms), avgGenerationMs: number(value.avg_generation_ms), requests: Number(value.requests ?? 0), uptimePct: number(value.uptime_pct), uptimeBuckets: (value.uptime_buckets ?? []).map((bucket: Record<string, unknown>) => ({ start: bucket.start ?? "", end: bucket.end ?? "", successPct: number(bucket.success_pct) })) }));
		const providerCount = providerPerformance.filter((provider: Record<string, unknown>) => Number(provider.requests ?? 0) > 0 && provider.uptimePct != null).length;
		const successSeries = (performance.hourly_24h ?? []).map((value: Record<string, unknown>) => ({ bucket: value.bucket ?? "", overallSuccessPct: number(value.success_pct), worstProviderSuccessPct: providerCount > 1 ? number(value.worst_provider_success_pct) : null, providerCount, requests: Number(value.requests ?? 0) }));
		const timeOfDay = (performance.time_of_day_5d ?? []).map((value: Record<string, unknown>) => ({ hour: Number(value.hour ?? 0), avgThroughput: number(value.avg_throughput), avgLatencyMs: number(value.avg_latency_ms), avgGenerationMs: number(value.avg_generation_ms), sampleCount: Number(value.sample_count ?? 0) }));
		const metrics = { summary: summary(performance.last_24h), prevSummary: summary(performance.prev_24h), hourly, successSeries, timeOfDay, providerPerformance, providerDaily7d: [], dataRange: hourly.length ? { start: hourly[0]?.bucket ?? "", end: hourly[hourly.length - 1]?.bucket ?? "" } : { start: "", end: "" }, cumulativeTokens: number(performance.cumulative_tokens?.total_tokens), releaseDate: performance.cumulative_tokens?.release_date ?? null };
		const activity = { summary: metrics.summary, providerPerformance, cumulativeTokens: metrics.cumulativeTokens };
		return withPublicCache(c.json({ modelId, performance, metrics, activity }), sectionPolicy("performance", modelId));
	} catch (error) {
		console.error("[web-api/models] performance failed", { modelId, error });
		return c.json({ error: "performance_unavailable" }, 503);
	}
});
