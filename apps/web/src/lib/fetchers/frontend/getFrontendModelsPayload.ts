import { cacheLife, cacheTag } from "next/cache";
import {
	getAllModelsCached,
	type ModelCard,
} from "@/lib/fetchers/models/getAllModels";

type GatewayMonitorRow = NonNullable<ModelCard["gateway_monitor_rows"]>[number];

export type FrontendModelEndpoint = {
	id: string;
	provider_id: string;
	provider_name: string;
	api_model_id?: string;
	endpoint: string;
	status: string;
	is_available: boolean;
	input_modalities?: string[];
	output_modalities?: string[];
	context_length?: number;
	max_output_tokens?: number;
	quantization?: string;
	supported_parameters?: string[];
	effective_from?: string;
	effective_to?: string;
	pricing?: {
		input_price?: number;
		output_price?: number;
		standard_input_price?: number;
		standard_output_price?: number;
		from_price?: number;
		from_price_unit?: string;
		detail_rows?: Array<{ label: string; value: string }>;
	};
	regions?: {
		execution: string[];
	};
	usage: {
		weekly_tokens?: number;
	};
	health: {
		status: "healthy" | "degraded" | "disabled" | "unknown";
		weekly_throughput?: number;
		weekly_latency_ms?: number;
	};
};

export type FrontendModelsApiModel = Omit<
	ModelCard,
	"gateway_monitor_rows" | "input_modalities" | "output_modalities"
> & {
	usage: {
		weekly_tokens: number | null;
		weekly_throughput: number | null;
		weekly_latency_ms: number | null;
	};
	endpoints: FrontendModelEndpoint[];
};

const ACTIVE_GATEWAY_STATUS_SET = new Set([
	"active",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
]);

function toFiniteNumber(value: unknown): number | null {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : null;
}

function toPositiveNumber(value: unknown): number | null {
	const numberValue = toFiniteNumber(value);
	return numberValue !== null && numberValue > 0 ? numberValue : null;
}

function normalizeStringList(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	return Array.from(
		new Set(
			values
				.map((value) => String(value ?? "").trim())
				.filter(Boolean),
		),
	).sort((a, b) => a.localeCompare(b));
}

function normalizeStatus(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (!normalized) return "unknown";
	if (normalized === "not_active") return "inactive";
	if (normalized === "comingsoon") return "coming_soon";
	if (normalized === "deranked" || normalized === "de_ranked") {
		return "deranked_lvl1";
	}
	if (normalized === "deranked_lvl_1") return "deranked_lvl1";
	if (normalized === "deranked_lvl_2") return "deranked_lvl2";
	if (normalized === "deranked_lvl_3") return "deranked_lvl3";
	return normalized;
}

function maxNullable(values: Array<number | null | undefined>): number | null {
	const finiteValues = values.filter(
		(value): value is number => typeof value === "number" && Number.isFinite(value),
	);
	return finiteValues.length > 0 ? Math.max(...finiteValues) : null;
}

function summarizeModelUsage(rows: GatewayMonitorRow[]): FrontendModelsApiModel["usage"] {
	return {
		weekly_tokens: maxNullable(rows.map((row) => row.weeklyTokensModel)),
		weekly_throughput: maxNullable(rows.map((row) => row.weeklyThroughputModel)),
		weekly_latency_ms: maxNullable(rows.map((row) => row.weeklyLatencyModel)),
	};
}

function endpointHealthStatus(status: string): FrontendModelEndpoint["health"]["status"] {
	if (status === "active") return "healthy";
	if (status.startsWith("deranked_")) return "degraded";
	if (status === "unknown") return "unknown";
	return "disabled";
}

function buildEndpoint(row: GatewayMonitorRow): FrontendModelEndpoint {
	const status = normalizeStatus(row.gatewayStatus);
	const inputModalities = normalizeStringList(row.inputModalities);
	const outputModalities = normalizeStringList(row.outputModalities);
	const supportedParameters = normalizeStringList(row.supportedParameters);
	const executionRegions = normalizeStringList(row.provider.executionRegions);
	const pricing = {
		input_price: toFiniteNumber(row.provider.inputPrice) ?? undefined,
		output_price: toFiniteNumber(row.provider.outputPrice) ?? undefined,
		standard_input_price:
			toFiniteNumber(row.provider.standardInputPrice) ?? undefined,
		standard_output_price:
			toFiniteNumber(row.provider.standardOutputPrice) ?? undefined,
		from_price: toFiniteNumber(row.provider.fromPrice) ?? undefined,
		from_price_unit: row.provider.fromPriceUnit ?? undefined,
		detail_rows:
			row.provider.pricingDetailRows && row.provider.pricingDetailRows.length > 0
				? row.provider.pricingDetailRows
				: undefined,
	};
	return {
		id: row.id,
		provider_id: row.provider.id,
		provider_name: row.provider.name,
		...(row.apiModelId ? { api_model_id: row.apiModelId } : {}),
		endpoint: row.endpoint,
		status,
		is_available: ACTIVE_GATEWAY_STATUS_SET.has(status),
		...(inputModalities.length > 0 ? { input_modalities: inputModalities } : {}),
		...(outputModalities.length > 0 ? { output_modalities: outputModalities } : {}),
		...(toPositiveNumber(row.context) !== null
			? { context_length: toPositiveNumber(row.context) ?? undefined }
			: {}),
		...(toPositiveNumber(row.maxOutput) !== null
			? { max_output_tokens: toPositiveNumber(row.maxOutput) ?? undefined }
			: {}),
		...(row.quantization ? { quantization: row.quantization } : {}),
		...(supportedParameters.length > 0
			? { supported_parameters: supportedParameters }
			: {}),
		...(row.effectiveFrom ? { effective_from: row.effectiveFrom } : {}),
		...(row.retired ? { effective_to: row.retired } : {}),
		...(Object.values(pricing).some((value) => value !== undefined)
			? { pricing }
			: {}),
		...(executionRegions.length > 0
			? { regions: { execution: executionRegions } }
			: {}),
		usage: {
			...(toFiniteNumber(row.weeklyTokensModelProvider) !== null
				? { weekly_tokens: toFiniteNumber(row.weeklyTokensModelProvider) ?? undefined }
				: {}),
		},
		health: {
			status: endpointHealthStatus(status),
			...(toFiniteNumber(row.weeklyThroughputModel) !== null
				? { weekly_throughput: toFiniteNumber(row.weeklyThroughputModel) ?? undefined }
				: {}),
			...(toFiniteNumber(row.weeklyLatencyModel) !== null
				? { weekly_latency_ms: toFiniteNumber(row.weeklyLatencyModel) ?? undefined }
				: {}),
		},
	};
}

export async function getFrontendModelsPayload(): Promise<ModelCard[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:models");
	cacheTag("data:models");
	cacheTag("models:list-base");

	return getAllModelsCached(false);
}

export async function getFrontendModelsApiPayload(): Promise<
	FrontendModelsApiModel[]
> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:models");
	cacheTag("data:models");
	cacheTag("models:list-base");

	const models = await getFrontendModelsPayload();
	return models.map(
		({
			gateway_monitor_rows: _gatewayMonitorRows,
			gateway_supported_models,
			input_modalities: _inputModalities,
			output_modalities: _outputModalities,
			...model
		}) => ({
			...model,
			usage: summarizeModelUsage(_gatewayMonitorRows ?? []),
			endpoints: (_gatewayMonitorRows ?? []).map(buildEndpoint),
			...(gateway_supported_models && gateway_supported_models.length > 0
				? { gateway_supported_models }
				: {}),
		}),
	);
}
