import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { fetchModelPricingSources } from "./pricing";
import { withDecisionOperationPricing } from "./decision-pricing";
import { publicProviderDisplayName, STEALTH_PROVIDER_ID } from "@/models/provider-identity";

type Row = Record<string, unknown>;

type OptionCount = { value: string; count: number };

type WeeklyMetricRow = {
	model_slug: string;
	popularity_tokens_week: number | null;
	weekly_usage_metric: string;
	weekly_usage_quantity: number;
	weekly_usage_unit: string;
	throughput_week: number | null;
	latency_week: number | null;
};

export type ModelsPageFacets = {
	statusCounts: {
		active: number;
		coming_soon: number;
		not_active: number;
		deprecated: number;
		retired: number;
	};
	endpointOptions: OptionCount[];
	inputModalityOptions: OptionCount[];
	outputModalityOptions: OptionCount[];
	featureOptions: OptionCount[];
	tierOptions: OptionCount[];
	supportedParameterOptions: OptionCount[];
	providerOptions: OptionCount[];
	regionOptions: OptionCount[];
	creatorOptions: OptionCount[];
	yearOptions: OptionCount[];
};

const MODALITY_ORDER = ["text", "image", "video", "audio", "audio_tts", "audio_stt", "audio_music", "file", "moderations", "rerank", "embeddings"];
const FEATURE_ORDER = ["reasoning", "tools", "structured_outputs", "web_search", "free"];
const ORGANISATION_NAMES: Record<string, string> = { ai21: "AI21", ibm: "IBM", lg: "LG", openai: "OpenAI", "spacex-ai": "SpaceXAI", "z-ai": "z.AI" };

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))].sort()
		: [];
}

function pricingUnit(row: Row): string | null {
	const displayUnit = String(row.display_unit ?? "").trim();
	const unit = String(row.unit ?? "").trim().toLowerCase();
	const quantity = Number(row.unit_quantity);
	if (
		/^1(?:000000|m)\s*tokens?$/i.test(displayUnit.replace(/,/g, ""))
		|| (unit === "token" && quantity === 1_000_000)
	) {
		return "1M tokens";
	}
	if (displayUnit && displayUnit.toLowerCase() !== "billing unit") {
		return displayUnit;
	}
	if (unit && Number.isFinite(quantity) && quantity > 0) {
		return `${quantity} ${unit}${quantity === 1 ? "" : "s"}`;
	}
	return unit || null;
}

function pricingLabel(value: unknown): string {
	return String(value ?? "")
		.trim()
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function pricingValue(price: number, unit: string): string {
	const formatted = price.toLocaleString("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 6,
	});
	return `$${formatted} / ${unit}`;
}

function structuredPricingRows(value: unknown): Row[] {
	return Array.isArray(value)
		? value.filter((row): row is Row => Boolean(row && typeof row === "object"))
		: [];
}

function directionPricingUnit(
	rows: Row[],
	direction: "input" | "output",
	price: unknown,
): string | null {
	const expectedPrice = Number(price);
	const candidates = rows.filter((row) => {
		const meter = String(row.meter_key ?? row.label ?? "").trim().toLowerCase();
		const tier = String(row.service_tier ?? "standard").trim().toLowerCase();
		return tier === "standard" && (meter === direction || meter.startsWith(`${direction}_`));
	});
	const matching = Number.isFinite(expectedPrice)
		? candidates.find((row) => Math.abs(Number(row.price) - expectedPrice) < 1e-9)
		: undefined;
	return pricingUnit(matching ?? candidates[0] ?? {});
}

export function normalizeModelsPagePricing(row: Row): Row {
	const rows = structuredPricingRows(row.pricing_detail_rows);
	if (rows.length === 0) return row;
	const detailRows = rows.flatMap((pricingRow) => {
		const existingLabel = String(pricingRow.label ?? "").trim();
		const existingValue = String(pricingRow.value ?? "").trim();
		if (existingLabel && existingValue) return [{ label: existingLabel, value: existingValue }];
		const price = Number(pricingRow.price);
		const unit = pricingUnit(pricingRow);
		if (!Number.isFinite(price) || !unit) return [];
		const tier = String(pricingRow.service_tier ?? "standard").trim().toLowerCase();
		const baseLabel = pricingLabel(pricingRow.label ?? pricingRow.meter_key);
		if (!baseLabel) return [];
		return [{
			label: tier && tier !== "standard" ? `${baseLabel} (${pricingLabel(tier)})` : baseLabel,
			value: pricingValue(price, unit),
		}];
	});
	const uniqueDetailRows = [...new Map(
		detailRows.map((detail) => [`${detail.label}::${detail.value}`, detail] as const),
	).values()].slice(0, 6);
	const inputUnit = directionPricingUnit(rows, "input", row.lowest_standard_input_price ?? row.lowest_input_price);
	const outputUnit = directionPricingUnit(rows, "output", row.lowest_standard_output_price ?? row.lowest_output_price);
	const fromPrice = Number(row.lowest_from_price);
	const fromRow = Number.isFinite(fromPrice)
		? rows.find((pricingRow) => Math.abs(Number(pricingRow.price) - fromPrice) < 1e-9)
		: undefined;
	const fromUnit = pricingUnit(fromRow ?? {});

	return {
		...row,
		lowest_standard_input_price_label: row.lowest_standard_input_price != null ? "Input" : row.lowest_standard_input_price_label,
		lowest_standard_input_price_unit: inputUnit ?? row.lowest_standard_input_price_unit,
		lowest_standard_output_price_label: row.lowest_standard_output_price != null ? "Output" : row.lowest_standard_output_price_label,
		lowest_standard_output_price_unit: outputUnit ?? row.lowest_standard_output_price_unit,
		lowest_from_price_unit: fromUnit ?? row.lowest_from_price_unit,
		pricing_detail_rows: uniqueDetailRows,
	};
}

function baseModelId(row: Row): string {
	const explicit = String(row.base_model_id ?? row.base_model_slug ?? "").trim();
	if (explicit) return explicit;
	return String(row.model_id ?? "").trim();
}

function variantKind(row: Row): string {
	const explicit = String(row.variant_kind ?? "").trim().toLowerCase();
	if (explicit) return explicit;
	return String(row.model_id ?? "").trim().toLowerCase().endsWith(":free") ? "free" : "standard";
}

function providerDetails(value: unknown): Row[] {
	return Array.isArray(value)
		? value.filter((detail): detail is Row => Boolean(detail && typeof detail === "object"))
		: [];
}

function withoutExternalProviders(row: Row): Row {
	const lifecycleStatus = String(row.status ?? "").trim().toLowerCase();
	if (!Array.isArray(row.gateway_provider_details)) {
		return lifecycleStatus === "retired" || lifecycleStatus === "deprecated"
			? { ...row, gateway_status: lifecycleStatus }
			: row;
	}
	const details = providerDetails(row.gateway_provider_details);
	const visibleDetails = details.filter((detail) => {
		const status = String(detail.status ?? "").trim().toLowerCase();
		const accessScope = String(detail.access_scope ?? "public").trim().toLowerCase();
		const capabilityStatus = String(detail.capability_status ?? "").trim().toLowerCase();
		return status !== "external" && accessScope === "public" && capabilityStatus !== "internal_testing";
	}).map((detail) => {
		const providerId = String(detail.id ?? detail.provider_slug ?? "").trim();
		const providerName = publicProviderDisplayName(providerId, detail.name);
		return providerId.toLowerCase() === STEALTH_PROVIDER_ID || String(detail.name ?? "").trim().toLowerCase() === STEALTH_PROVIDER_ID
			? { ...detail, id: STEALTH_PROVIDER_ID, name: providerName }
			: detail;
	});
	const providerNames = strings(visibleDetails.map((detail) => detail.name));
	const activeProviderNames = strings(
		visibleDetails.filter((detail) => detail.is_active === true).map((detail) => detail.name),
	);
	const gatewayStatus = lifecycleStatus === "retired"
		? "retired"
		: lifecycleStatus === "deprecated"
			? "deprecated"
			: activeProviderNames.length > 0
				? "active"
				: String(row.gateway_status ?? "") === "coming_soon"
					? "coming_soon"
					: "not_active";
	return {
		...row,
		gateway_provider_details: visibleDetails,
		gateway_provider_names: providerNames,
		gateway_active_provider_names: activeProviderNames,
		gateway_provider_count: providerNames.length,
		gateway_active_provider_count: activeProviderNames.length,
		gateway_status: gatewayStatus,
	};
}

type ModelVariantLink = {
	model_id: string;
	name: string;
};

type ModelVariantLinks = Record<string, ModelVariantLink>;

/**
 * Keep every callable model variant as its own catalogue row while attaching
 * stable family links. This lets /models display `:free` separately without
 * making clients infer relationships from the slug suffix.
 */
export function attachModelsPageVariants(rows: Row[]): Row[] {
	const variantsByBaseModel = new Map<string, ModelVariantLinks>();

	for (const row of rows) {
		const modelId = String(row.model_id ?? "").trim();
		if (!modelId) continue;
		const baseId = baseModelId(row);
		const kind = variantKind(row);
		const variants = variantsByBaseModel.get(baseId) ?? {};
		variants[kind] = {
			model_id: modelId,
			name: String(row.name ?? modelId).trim() || modelId,
		};
		variantsByBaseModel.set(baseId, variants);
	}

	return rows.map((row) => {
		const baseId = baseModelId(row);
		return withoutExternalProviders({
			...row,
			base_model_id: baseId,
			variant_kind: variantKind(row),
			variants: variantsByBaseModel.get(baseId) ?? {},
		});
	});
}

function modality(value: string): string {
	const normalized = value.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("embed")) return "embeddings";
	if (normalized.includes("moderat")) return "moderations";
	if (normalized.includes("rerank") || normalized.includes("re rank")) return "rerank";
	if (normalized.includes("image")) return "image";
	if (normalized.includes("video")) return "video";
	if (normalized.includes("music")) return "audio_music";
	if (normalized.includes("transcri") || normalized.includes("speech to text") || normalized.includes("stt")) return "audio_stt";
	if (normalized.includes("text to speech") || normalized.includes("audio speech") || normalized.includes("speech synth") || normalized.includes("tts")) return "audio_tts";
	if (normalized.includes("audio")) return "audio";
	if (normalized.includes("file")) return "file";
	if (normalized.includes("text")) return "text";
	return normalized.trim();
}

function optionCounts(rows: Row[], field: string, normalize: (value: string) => string = (value) => value): OptionCount[] {
	const counts = new Map<string, number>();
	for (const row of rows) for (const raw of strings(row[field])) {
		const value = normalize(raw);
		if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts].map(([value, count]) => ({ value, count })).sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function ordered(options: OptionCount[], order: string[]): OptionCount[] {
	const positions = new Map(order.map((value, index) => [value, index]));
	return [...options].sort((left, right) => {
		const leftIndex = positions.get(left.value);
		const rightIndex = positions.get(right.value);
		if (leftIndex != null || rightIndex != null) return leftIndex == null ? 1 : rightIndex == null ? -1 : leftIndex - rightIndex;
		return right.count - left.count || left.value.localeCompare(right.value);
	});
}

function creator(row: Row): string {
	const id = String(row.organisation_id ?? "").trim().toLowerCase();
	const name = String(row.organisation_name ?? "").trim();
	const override = ORGANISATION_NAMES[id];
	if (!name) return override ?? "";
	return override && (name.toLowerCase().replace(/\s+/g, "-") === id || name === name.toLowerCase()) ? override : name;
}

export function buildModelsPageFacets(rows: Row[]): ModelsPageFacets {
	const statusCounts = {
		active: 0,
		coming_soon: 0,
		not_active: 0,
		deprecated: 0,
		retired: 0,
	};
	const creatorCounts = new Map<string, number>();
	const yearCounts = new Map<string, number>();
	for (const row of rows) {
		const status = row.gateway_status === "active"
			? "active"
			: row.gateway_status === "coming_soon"
				? "coming_soon"
				: row.gateway_status === "deprecated"
					? "deprecated"
					: row.gateway_status === "retired"
						? "retired"
						: "not_active";
		statusCounts[status] += 1;
		const creatorName = creator(row);
		if (creatorName) creatorCounts.set(creatorName, (creatorCounts.get(creatorName) ?? 0) + 1);
		const timestamp = Number(row.primary_timestamp);
		const date = Number.isFinite(timestamp) ? new Date(timestamp) : row.primary_date ? new Date(String(row.primary_date)) : null;
		const year = date && Number.isFinite(date.getTime()) ? String(date.getUTCFullYear()) : "";
		if (year) yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
	}
	const creatorOptions = [...creatorCounts].map(([value, count]) => ({ value, count })).sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
	const yearOptions = [...yearCounts].map(([value, count]) => ({ value, count })).sort((left, right) => Number(right.value) - Number(left.value));
	return {
		statusCounts,
		endpointOptions: optionCounts(rows, "gateway_endpoints"),
		inputModalityOptions: ordered(optionCounts(rows, "gateway_input_modalities", modality), MODALITY_ORDER),
		outputModalityOptions: ordered(optionCounts(rows.map(row => ({ ...row,
			gateway_output_modalities: strings([...strings(row.gateway_output_modalities).map(modality), ...(strings(row.gateway_endpoints).includes("decisions.make") ? ["decisions"] : [])]),
		})), "gateway_output_modalities", modality), MODALITY_ORDER),
		featureOptions: ordered(optionCounts(rows, "gateway_features"), FEATURE_ORDER),
		tierOptions: optionCounts(rows, "gateway_tiers"),
		supportedParameterOptions: optionCounts(rows, "supported_parameters"),
		providerOptions: optionCounts(rows, "gateway_provider_names"),
		regionOptions: optionCounts(rows, "gateway_execution_regions"),
		creatorOptions,
		yearOptions,
	};
}

export type ModelsPageQuery = {
	organisationId?: string | null;
	region?: string | null;
	serviceTier?: string | null;
	includeMetrics?: boolean;
};

async function loadPageRows(env: Env, region: string | null, serviceTier: string | null, organisationId: string | null): Promise<Row[]> {
	const { data, error } = await getDataClient(env).rpc("get_public_models_page_payload", {
		p_region: region,
		p_service_tier: serviceTier,
		p_organisation_id: organisationId,
	});
	if (error) throw error;
	if (!Array.isArray(data)) throw new Error("Invalid models catalogue payload");
	return data;
}

// The payload costs ~1s of database time and ~6.6MB per build, yet edge
// responses are keyed by URL, so every offset, search, projection and
// organisation page rebuilt it. Share one copy per catalogue revision, region
// and tier across those callers. Revision triggers cover every catalogue table
// the payload reads except v2_labs, so the TTL bounds lab edits to the same
// window as the edge cache.
const SHARED_ROWS_TTL_SECONDS = 15 * 60;
const sharedRowsInflight = new Map<string, Promise<Row[]>>();

async function catalogueRevision(env: Env): Promise<string | null> {
	const { data, error } = await getDataClient(env).rpc("gateway_catalogue_revision");
	const revision = error ? null : String(data ?? "");
	return revision && /^\d+$/.test(revision) ? revision : null;
}

async function sharedPageRows(env: Env, cache: Cache, region: string | null, serviceTier: string | null, organisationId: string | null): Promise<Row[]> {
	const revision = await catalogueRevision(env);
	// Without a revision nothing is cached, so keep the narrow organisation query.
	if (!revision) return loadPageRows(env, region, serviceTier, organisationId);
	const key = `https://web-api.internal/models-page-rows/v1/${revision}/${encodeURIComponent(region ?? "")}/${encodeURIComponent(serviceTier ?? "")}`;
	const inflight = sharedRowsInflight.get(key);
	if (inflight) return inflight;
	const load = (async () => {
		const cached = await cache.match(key).catch(() => undefined);
		if (cached) {
			const rows = await cached.json().catch(() => null);
			if (Array.isArray(rows)) return rows as Row[];
		}
		const rows = await loadPageRows(env, region, serviceTier, null);
		await cache.put(key, new Response(JSON.stringify(rows), {
			headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${SHARED_ROWS_TTL_SECONDS}` },
		})).catch(() => {});
		return rows;
	})();
	sharedRowsInflight.set(key, load);
	try {
		return await load;
	} finally {
		sharedRowsInflight.delete(key);
	}
}

async function databasePageRows(env: Env, query: ModelsPageQuery = {}): Promise<Row[]> {
	const region = query.region || null;
	const serviceTier = query.serviceTier || null;
	const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
	const data = cache
		? await sharedPageRows(env, cache, region, serviceTier, query.organisationId || null)
		: await loadPageRows(env, region, serviceTier, query.organisationId || null);
	return query.organisationId
		? data.filter((row: Row) => String(row.organisation_id ?? "") === query.organisationId)
		: data;
}

async function weeklyMetrics(env: Env, modelIds?: string[], throwOnError = false): Promise<WeeklyMetricRow[]> {
	if (modelIds?.length === 0) return [];
	const rows: WeeklyMetricRow[] = [];
	for (let offset = 0; ; offset += 1_000) {
		let request = getDataClient(env).rpc("get_v2_public_model_weekly_metrics");
		if (modelIds) request = request.in("model_slug", modelIds);
		const result = await request.range(offset, offset + 999);
		if (result.error) {
			if (throwOnError) throw result.error;
			console.error("models_weekly_metrics_failed", {
				code: result.error.code,
				message: result.error.message,
			});
			return [];
		}
		rows.push(...((result.data ?? []) as WeeklyMetricRow[]));
		if ((result.data?.length ?? 0) < 1_000) break;
	}
	return rows;
}

export function mergeModelWeeklyMetrics(rows: Row[], metrics: WeeklyMetricRow[]): Row[] {
	const metricsByModel = new Map(
		metrics.map((metric) => [String(metric.model_slug ?? "").trim(), metric]),
	);
	return rows.map((row) => {
		const metric = metricsByModel.get(String(row.model_id ?? "").trim());
		return metric
			? {
				...row,
				popularity_tokens_week: metric.popularity_tokens_week,
				weekly_usage_metric: metric.weekly_usage_metric,
				weekly_usage_quantity: metric.weekly_usage_quantity,
				weekly_usage_unit: metric.weekly_usage_unit,
				throughput_week: metric.throughput_week,
				latency_week: metric.latency_week,
			}
			: row;
	});
}

export async function fetchModelsPageCatalogue(
	env: Env,
	query: ModelsPageQuery = {},
	_catalogueVersion: "v1" | "v2" = "v2",
): Promise<{ models: Row[]; pricingComplete: boolean }> {
	const rowsPromise = databasePageRows(env, query);
	const metricsPromise = query.includeMetrics === false ? Promise.resolve([]) : query.organisationId
		? rowsPromise.then((rows) => weeklyMetrics(
			env, rows.map((row) => String(row.model_id ?? "")).filter(Boolean),
		))
		: weeklyMetrics(env);
	const pricingPromise = rowsPromise.then(async rows => {
		const dualModels = rows.filter(row => strings(row.gateway_endpoints).includes("text.generate") &&
			strings(row.gateway_endpoints).includes("decisions.make"));
		if (!dualModels.length) return [];
		try {
			return withDecisionOperationPricing(dualModels,
				await fetchModelPricingSources(env, dualModels.map(row => String(row.model_id))));
		} catch {
			console.error("models_decision_pricing_failed");
			return withDecisionOperationPricing(dualModels, { providerRows: [], pricingRows: [] });
		}
	});
	const [databaseRows, modelWeeklyMetrics, dualPricing] = await Promise.all([rowsPromise, metricsPromise, pricingPromise]);
	const pricingByModel = new Map(dualPricing.map(row => [String(row.model_id), row]));
	return {
		models: attachModelsPageVariants(mergeModelWeeklyMetrics(
		databaseRows.map(row => pricingByModel.get(String(row.model_id)) ?? row)
			.filter((row) => String(row.access_scope ?? "public").trim().toLowerCase() === "public" && String(row.capability_status ?? "").trim().toLowerCase() !== "internal_testing")
			.map(normalizeModelsPagePricing)
			.map((row) => query.includeMetrics === false ? {
				...row, popularity_tokens_week: null, weekly_usage_metric: null,
				weekly_usage_quantity: null, weekly_usage_unit: null,
				throughput_week: null, latency_week: null,
			} : row),
			modelWeeklyMetrics,
		)),
		pricingComplete: true,
	};
}

/** Publish metrics only for models whose identity is visible in the catalogue. */
export async function fetchPublicModelWeeklyMetrics(env: Env): Promise<WeeklyMetricRow[]> {
	const metrics = await weeklyMetrics(env, undefined, true);
	const visibleIds = new Set<string>();
	for (let offset = 0; offset < metrics.length; offset += 1_000) {
		const { data, error } = await getDataClient(env).from("v2_models")
			.select("model_slug")
			.in("model_slug", metrics.slice(offset, offset + 1_000).map((row) => row.model_slug))
			.eq("hidden", false).neq("status", "disabled");
		if (error) throw error;
		for (const row of data ?? []) visibleIds.add(row.model_slug);
	}
	return metrics.filter((row) => visibleIds.has(row.model_slug));
}
