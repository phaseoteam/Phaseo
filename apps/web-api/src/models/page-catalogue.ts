import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";

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
	statusCounts: { active: number; coming_soon: number; not_active: number };
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

function primaryDate(row: Row): { primary_date: string | null; primary_timestamp: number | null; primary_group_key: string | null } {
	const value = [row.release_date, row.announcement_date].find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0) ?? null;
	if (!value) return { primary_date: null, primary_timestamp: null, primary_group_key: null };
	const timestamp = Date.parse(value);
	return { primary_date: value, primary_timestamp: Number.isFinite(timestamp) ? timestamp : null, primary_group_key: Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 7) : null };
}

function modelTail(modelId: string): string {
	const normalized = modelId.trim().toLowerCase();
	const tail = normalized.includes("/") ? normalized.split("/").slice(1).join("/") : normalized;
	return tail.replace(/[._/]+/g, "-").replace(/-\d{4}(?:-\d{2}){0,2}$/g, "").replace(/-(?:latest|stable)$/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function modelName(value: unknown): string {
	return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

function displayName(value: unknown, modelId: string): string {
	const name = String(value ?? modelId).trim() || modelId;
	if (!modelId.toLowerCase().endsWith(":free")) return name;
	if (/\(\s*free\s*\)$/i.test(name)) return name.replace(/\(\s*free\s*\)$/i, "(Free)");
	if (/\s+free$/i.test(name)) return name.replace(/\s+free$/i, " (Free)");
	return /\bfree\b/i.test(name) ? name : `${name} (Free)`;
}

function modality(value: string): string {
	const normalized = value.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("embed")) return "embeddings";
	if (normalized.includes("moderat")) return "moderations";
	if (normalized.includes("rerank") || normalized.includes("re rank")) return "rerank";
	if (normalized.includes("image")) return "image";
	if (normalized.includes("video")) return "video";
	if (normalized.includes("music")) return "audio_music";
	if (normalized.includes("transcrib") || normalized.includes("speech to text") || normalized.includes("stt")) return "audio_stt";
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
	const statusCounts = { active: 0, coming_soon: 0, not_active: 0 };
	const creatorCounts = new Map<string, number>();
	const yearCounts = new Map<string, number>();
	for (const row of rows) {
		const status = row.gateway_status === "active" ? "active" : row.gateway_status === "coming_soon" ? "coming_soon" : "not_active";
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
		outputModalityOptions: ordered(optionCounts(rows, "gateway_output_modalities", modality), MODALITY_ORDER),
		featureOptions: ordered(optionCounts(rows, "gateway_features"), FEATURE_ORDER),
		tierOptions: optionCounts(rows, "gateway_tiers"),
		supportedParameterOptions: optionCounts(rows, "supported_parameters"),
		providerOptions: optionCounts(rows, "gateway_provider_names"),
		regionOptions: optionCounts(rows, "gateway_execution_regions"),
		creatorOptions,
		yearOptions,
	};
}

async function aggregatedRows(env: Env): Promise<Row[]> {
	const rows: Row[] = [];
	for (let offset = 0; ; offset += 1_000) {
		const result = await getDataClient(env).rpc("get_public_model_catalogue_rows", { p_include_hidden: false }).range(offset, offset + 999);
		if (result.error) throw result.error;
		rows.push(...((result.data ?? []) as Row[]));
		if ((result.data?.length ?? 0) < 1_000) break;
	}
	return rows;
}

function isMissingPageRpc(error: { code?: string; message?: string } | null): boolean {
	if (!error) return false;
	return error.code === "PGRST202"
		|| /get_public_models_page_rows/i.test(error.message ?? "")
		&& /could not find|does not exist/i.test(error.message ?? "");
}

export type ModelsPageQuery = {
	region?: string | null;
	serviceTier?: string | null;
};

async function databasePageRows(env: Env, query: ModelsPageQuery = {}): Promise<Row[] | null> {
	const rows: Row[] = [];
	const useFilteredV2Rpc = Boolean(query.region || query.serviceTier);
	for (let offset = 0; ; offset += 1_000) {
		const result = await getDataClient(env).rpc(
			useFilteredV2Rpc ? "get_v2_public_models_page_rows" : "get_public_models_page_rows",
			useFilteredV2Rpc
				? { p_region: query.region ?? null, p_service_tier: query.serviceTier ?? null }
				: {},
		).range(offset, offset + 999);
		if (result.error) {
			if (isMissingPageRpc(result.error)) return null;
			throw result.error;
		}
		rows.push(...((result.data ?? []) as Row[]));
		if ((result.data?.length ?? 0) < 1_000) break;
	}
	return rows;
}

async function weeklyMetrics(env: Env): Promise<WeeklyMetricRow[]> {
	const rows: WeeklyMetricRow[] = [];
	for (let offset = 0; ; offset += 1_000) {
		const result = await getDataClient(env)
			.rpc("get_v2_public_model_weekly_metrics")
			.range(offset, offset + 999);
		if (result.error) throw result.error;
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

async function baseRows(env: Env): Promise<Row[]> {
	const rows: Row[] = [];
	for (let offset = 0; ; offset += 1_000) {
		const result = await getDataClient(env).from("data_models")
			.select("model_id,name,organisation_id,status,release_date,announcement_date,updated_at,input_types,output_types,organisation:data_organisations(name,colour)")
			.eq("hidden", false).order("name", { ascending: true }).range(offset, offset + 999);
		if (result.error) throw result.error;
		rows.push(...((result.data ?? []) as Row[]));
		if ((result.data?.length ?? 0) < 1_000) break;
	}
	return rows;
}

async function providerRegions(env: Env): Promise<Map<string, string[]>> {
	const result = await getDataClient(env).rpc("get_v2_provider_region_map", { p_provider_slugs: null });
	if (result.error) throw result.error;
	return new Map((result.data ?? []).map((row: Row) => [String(row.provider_slug), strings(row.regions).map((region) => region.toLowerCase())]));
}

function organisation(row: Row | undefined): Row | null {
	const value = row?.organisation;
	const candidate = Array.isArray(value) ? value[0] : value;
	return candidate && typeof candidate === "object" ? candidate as Row : null;
}

function baseCandidates(row: Row): string[] {
	return [String(row.model_id ?? ""), ...strings(row.gateway_api_model_ids)].filter(Boolean).flatMap((value) => value.toLowerCase().endsWith(":free") ? [value, value.slice(0, -5)] : [value]);
}

function gatewayTiers(row: Row): string[] {
	return strings(row.gateway_features).includes("free") ? ["free", "standard"] : ["standard"];
}

export async function fetchModelsPageCatalogue(env: Env, query: ModelsPageQuery = {}): Promise<{ models: Row[]; pricingComplete: boolean }> {
	const [databaseRows, modelWeeklyMetrics] = await Promise.all([
		databasePageRows(env, query),
		weeklyMetrics(env),
	]);
	if (databaseRows) {
		return {
			models: mergeModelWeeklyMetrics(databaseRows, modelWeeklyMetrics),
			pricingComplete: true,
		};
	}

	const [gatewayRows, catalogueRows, regions] = await Promise.all([aggregatedRows(env), baseRows(env), providerRegions(env)]);
	const baseById = new Map(catalogueRows.map((row) => [String(row.model_id), row]));
	const usedBaseIds = new Set<string>();

	const gatewayModels = gatewayRows.map((gateway) => {
		const modelId = String(gateway.model_id ?? "").trim();
		const base = baseCandidates(gateway).map((candidate) => baseById.get(candidate)).find(Boolean);
		if (base?.model_id) usedBaseIds.add(String(base.model_id));
		const dates = base ? primaryDate(base) : {
			primary_date: gateway.primary_date ?? null,
			primary_timestamp: gateway.primary_timestamp == null ? null : Number(gateway.primary_timestamp),
			primary_group_key: gateway.primary_group_key ?? null,
		};
		const providerDetails = Array.isArray(gateway.gateway_provider_details) ? gateway.gateway_provider_details : [];
		const executionRegions = strings(providerDetails.filter((provider: Row) => provider.is_active).flatMap((provider: Row) => regions.get(String(provider.id)) ?? []));
		const org = organisation(base);
		return {
			...gateway,
			model_id: modelId,
			name: displayName(base?.name ?? gateway.name, modelId),
			organisation_id: base?.organisation_id ?? gateway.organisation_id ?? modelId.split("/")[0] ?? "",
			organisation_name: org?.name ?? gateway.organisation_name ?? null,
			organisation_colour: org?.colour ?? gateway.organisation_colour ?? null,
			...dates,
			gateway_execution_regions: executionRegions,
			gateway_tiers: gatewayTiers(gateway),
			gateway_api_model_ids: strings(gateway.gateway_api_model_ids),
		};
	});

	const gatewayTailKeys = new Set<string>();
	const gatewayNameDateKeys = new Set<string>();
	for (const row of gatewayModels) {
		const org = String(row.organisation_id ?? "").trim().toLowerCase();
		if (!org) continue;
		const tail = modelTail(String(row.model_id));
		if (tail) gatewayTailKeys.add(`${org}::${tail}`);
		const name = modelName(row.name);
		if (name) gatewayNameDateKeys.add(`${org}::${name}::${String(row.primary_date ?? "")}`);
	}

	const catalogueOnly = catalogueRows.flatMap((row) => {
		const id = String(row.model_id ?? "").trim();
		if (!id || usedBaseIds.has(id)) return [];
		const orgId = String(row.organisation_id ?? "").trim();
		const orgKey = orgId.toLowerCase();
		const dates = primaryDate(row);
		if (orgKey) {
			const tail = modelTail(id);
			if (tail && gatewayTailKeys.has(`${orgKey}::${tail}`)) return [];
			const name = modelName(row.name);
			if (name && gatewayNameDateKeys.has(`${orgKey}::${name}::${String(dates.primary_date ?? "")}`)) return [];
		}
		const org = organisation(row);
		return [{
			model_id: id,
			name: row.name ?? id,
			organisation_id: orgId,
			organisation_name: org?.name ?? null,
			organisation_colour: org?.colour ?? null,
			...dates,
			gateway_status: String(row.status ?? "").toLowerCase() === "announced" ? "coming_soon" : "not_listed",
			gateway_provider_count: 0, gateway_active_provider_count: 0,
			gateway_endpoints: [], gateway_input_modalities: strings(row.input_types), gateway_output_modalities: strings(row.output_types),
			gateway_features: [], gateway_tiers: [], gateway_provider_names: [], gateway_active_provider_names: [], gateway_execution_regions: [], gateway_provider_details: [], gateway_api_model_ids: [], context_lengths: [], supported_parameters: [],
			lowest_input_price: null, lowest_output_price: null, lowest_standard_input_price: null, lowest_standard_output_price: null,
			lowest_standard_input_price_label: null, lowest_standard_input_price_unit: null, lowest_standard_output_price_label: null, lowest_standard_output_price_unit: null,
			lowest_from_price: null, lowest_from_price_unit: null, pricing_detail_rows: [], popularity_tokens_week: null, throughput_week: null, latency_week: null,
		}];
	});

	return {
		models: mergeModelWeeklyMetrics([...gatewayModels, ...catalogueOnly], modelWeeklyMetrics).sort((left, right) => Number(right.primary_timestamp ?? Number.NEGATIVE_INFINITY) - Number(left.primary_timestamp ?? Number.NEGATIVE_INFINITY) || String(left.organisation_name ?? "").localeCompare(String(right.organisation_name ?? "")) || String(left.name ?? "").localeCompare(String(right.name ?? ""))),
		pricingComplete: false,
	};
}
