import { createAdminClient } from "@/utils/supabase/admin";
import { cacheLife, cacheTag } from "next/cache";
import { featureOrder } from "@/lib/config/featureLabels";
import type {
	GatewayProvider,
	MonitorModelData,
	MonitorModelFilters,
} from "@/lib/fetchers/models/table-view/types";
import {
	parseModalities,
	extractFeatureKeys,
	extractSupportedParameters,
	normalizeGatewayModel,
	normalizeCapabilityStatus,
	normalizeEndpoint,
	resolveGatewayStatus,
} from "./helpers";

export type { MonitorModelData } from "./types";

function toNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : null;
}

type MonitorModelRpcRow = {
	model_id: string | null;
	model_name: string | null;
	model_release_date: string | null;
	model_retirement_date: string | null;
	model_status: string | null;
	model_input_types: unknown;
	model_output_types: unknown;
	organisation_id: string | null;
	organisation_name: string | null;
	hidden: boolean | null;
	provider_api_model_id: string | null;
	provider_id: string | null;
	api_model_id: string | null;
	provider_model_slug: string | null;
	is_active_gateway: boolean | null;
	input_modalities: unknown;
	output_modalities: unknown;
	quantization_scheme: string | null;
	context_length: number | null;
	provider_max_output_tokens: number | null;
	effective_from: string | null;
	effective_to: string | null;
	capability_id: string | null;
	capability_params: unknown;
	capability_status: string | null;
	capability_max_input_tokens: number | null;
	capability_max_output_tokens: number | null;
	api_provider_name: string | null;
	provider_link: string | null;
	input_price: number | null;
	output_price: number | null;
	standard_input_price: number | null;
	standard_output_price: number | null;
	standard_input_price_label: string | null;
	standard_input_price_unit: string | null;
	standard_output_price_label: string | null;
	standard_output_price_unit: string | null;
	from_price: number | null;
	from_price_unit: string | null;
	pricing_tier: string | null;
	is_free_variant: boolean | null;
	weekly_tokens_model: number | null;
	weekly_tokens_model_provider: number | null;
	weekly_throughput_model: number | null;
	weekly_latency_model: number | null;
};

export async function getMonitorModels(
	filters: MonitorModelFilters = {},
	includeHidden: boolean
): Promise<{
	models: MonitorModelData[];
	allTiers: string[];
	allEndpoints: string[];
	allModalities: string[];
	allFeatures: string[];
	allStatuses: string[];
}> {
	"use cache";

	cacheLife("minutes");
	cacheTag("models:monitor");
	cacheTag("monitor-models");
	cacheTag("data:data_api_model_aliases");
	cacheTag("data:data_api_provider_model_capabilities");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:data_api_pricing_rules");
	cacheTag("data:models");
	cacheTag("data:api_providers");

	const supabase = createAdminClient();
	const { data: rpcRows, error: rpcError } = await supabase.rpc(
		"get_monitor_model_rows",
		{ p_include_hidden: includeHidden },
	);

	if (rpcError) {
		throw rpcError;
	}

	const featureOrderIndexForRow = new Map(
		featureOrder.map((feature, index) => [feature, index]),
	);
	const allModels: MonitorModelData[] = [];

	for (const raw of (rpcRows ?? []) as MonitorModelRpcRow[]) {
		const row = raw as MonitorModelRpcRow;
		const modelId = String(row.model_id ?? row.api_model_id ?? "").trim();
		if (!modelId) continue;

		const providerInfo: GatewayProvider =
			row.api_provider_name || row.provider_link
				? {
					api_provider_name: row.api_provider_name ?? null,
					link: row.provider_link ?? null,
				}
				: null;

		const gatewayModel = normalizeGatewayModel({
			model_id: modelId,
			api_model_id: row.api_model_id,
			api_provider_id: row.provider_id,
			key: row.provider_id && row.api_model_id && row.capability_id
				? `${row.provider_id}:${row.api_model_id}:${row.capability_id}`
				: "",
			endpoint: row.capability_id,
			is_active_gateway: row.is_active_gateway,
			capability_status: row.capability_status,
			input_modalities: row.input_modalities,
			output_modalities: row.output_modalities,
			params: row.capability_params ?? {},
			provider: providerInfo,
		});

		const extractedFeatures = extractFeatureKeys(gatewayModel.params);
		const supportedParameters = extractSupportedParameters(gatewayModel.params);
		const isFreeVariant = Boolean(row.is_free_variant);
		const normalizedFeatures = new Set<string>(
			extractedFeatures.map((feature) => String(feature)),
		);
		if (isFreeVariant) normalizedFeatures.add("free");
		const sortedFeatures = Array.from(normalizedFeatures).sort((a, b) => {
			const aIndex = featureOrderIndexForRow.get(a);
			const bIndex = featureOrderIndexForRow.get(b);
			if (aIndex !== undefined || bIndex !== undefined) {
				if (aIndex === undefined) return 1;
				if (bIndex === undefined) return -1;
				return aIndex - bIndex;
			}
			return a.localeCompare(b);
		});

		const providerName =
			gatewayModel.provider?.api_provider_name || gatewayModel.api_provider_id;
		const providerContext = Number(row.context_length ?? Number.NaN);
		const providerMaxOutput = Number(
			row.provider_max_output_tokens ?? Number.NaN,
		);
		const capMaxInput = Number(row.capability_max_input_tokens ?? Number.NaN);
		const capMaxOutput = Number(row.capability_max_output_tokens ?? Number.NaN);
		const context =
			Number.isFinite(providerContext) && providerContext > 0
				? providerContext
				: Number.isFinite(capMaxInput) && capMaxInput > 0
					? capMaxInput
					: 0;
		const maxOutput =
			Number.isFinite(providerMaxOutput) && providerMaxOutput > 0
				? providerMaxOutput
				: Number.isFinite(capMaxOutput) && capMaxOutput > 0
					? capMaxOutput
					: 0;
		const quantization =
			typeof row.quantization_scheme === "string" &&
			row.quantization_scheme.trim()
				? row.quantization_scheme
				: undefined;

		const monitorModel: MonitorModelData = {
			id: `${modelId}-${gatewayModel.api_provider_id}-${gatewayModel.key}`,
			model: String(row.model_name ?? modelId).trim() || modelId,
			modelId,
			apiModelId: row.api_model_id ?? undefined,
			organisationId: row.organisation_id ?? undefined,
			organisationName: row.organisation_name ?? undefined,
			provider: {
				name: providerName ?? gatewayModel.api_provider_id,
				id: gatewayModel.api_provider_id,
				inputPrice: Number(row.input_price ?? 0) || 0,
				outputPrice: Number(row.output_price ?? 0) || 0,
				standardInputPrice: Number.isFinite(Number(row.standard_input_price))
					? Number(row.standard_input_price)
					: null,
				standardOutputPrice: Number.isFinite(Number(row.standard_output_price))
					? Number(row.standard_output_price)
					: null,
				standardInputPriceLabel: row.standard_input_price_label ?? null,
				standardInputPriceUnit: row.standard_input_price_unit ?? null,
				standardOutputPriceLabel: row.standard_output_price_label ?? null,
				standardOutputPriceUnit: row.standard_output_price_unit ?? null,
				fromPrice: Number.isFinite(Number(row.from_price))
					? Number(row.from_price)
					: null,
				fromPriceUnit: row.from_price_unit ?? null,
				features: sortedFeatures,
			},
			endpoint: normalizeEndpoint(String(row.capability_id ?? "")),
			gatewayStatus: resolveGatewayStatus(
				gatewayModel.is_active_gateway,
				gatewayModel.capability_status,
			),
			inputModalities: (() => {
				const gatewayValues = parseModalities(gatewayModel.input_modalities);
				return gatewayValues.length > 0
					? gatewayValues
					: parseModalities(row.model_input_types);
			})(),
			outputModalities: (() => {
				const gatewayValues = parseModalities(gatewayModel.output_modalities);
				return gatewayValues.length > 0
					? gatewayValues
					: parseModalities(row.model_output_types);
			})(),
			context,
			maxOutput,
			quantization,
			supportedParameters,
			effectiveFrom: row.effective_from ?? undefined,
			tier: isFreeVariant ? "free" : String(row.pricing_tier ?? "standard"),
			added: row.model_release_date ?? undefined,
			retired: row.model_retirement_date
				? new Date(row.model_retirement_date).toISOString().split("T")[0]
				: undefined,
			weeklyTokensModel: toNullableNumber(row.weekly_tokens_model),
			weeklyTokensModelProvider: toNullableNumber(
				row.weekly_tokens_model_provider,
			),
			weeklyThroughputModel: toNullableNumber(row.weekly_throughput_model),
			weeklyLatencyModel: toNullableNumber(row.weekly_latency_model),
		};

		allModels.push(monitorModel);
	}

	const endpointsSet = new Set<string>();
	const modalitiesSet = new Set<string>();
	const featuresSet = new Set<string>();
	const statusesSet = new Set<string>();

	for (const model of allModels) {
		const endpoint = normalizeEndpoint(model.endpoint);
		if (endpoint) endpointsSet.add(endpoint);
		model.inputModalities.forEach((mod) => modalitiesSet.add(mod));
		model.outputModalities.forEach((mod) => modalitiesSet.add(mod));
		model.provider.features.forEach((feat) => featuresSet.add(feat));
		statusesSet.add(model.gatewayStatus);
	}

	const allEndpoints = Array.from(endpointsSet).sort();
	const allModalities = Array.from(modalitiesSet).sort();
	const allTiers = Array.from(
		new Set(
			allModels
				.map((item) => String(item.tier ?? "").trim().toLowerCase())
				.filter(Boolean),
		),
	).sort();
	const featureOrderIndex = new Map(
		featureOrder.map((feature, index) => [feature, index])
	);
	const allFeatures = Array.from(featuresSet).sort((a, b) => {
		const aIndex = featureOrderIndex.get(a);
		const bIndex = featureOrderIndex.get(b);
		if (aIndex !== undefined || bIndex !== undefined) {
			if (aIndex === undefined) return 1;
			if (bIndex === undefined) return -1;
			return aIndex - bIndex;
		}
		return a.localeCompare(b);
	});
	const allStatuses = Array.from(statusesSet).sort();

	const normalizedFilters: Required<MonitorModelFilters> = {
		search: filters.search?.trim() || "",
		inputModalities: filters.inputModalities ?? [],
		outputModalities: filters.outputModalities ?? [],
		features: filters.features ?? [],
		endpoints: filters.endpoints ?? [],
		statuses: (filters.statuses ?? []).map((status) =>
			normalizeCapabilityStatus(status),
		),
		tiers: filters.tiers ?? [],
		year: filters.year ?? 0,
		sortField: filters.sortField || "added",
		sortDirection: filters.sortDirection === "asc" ? "asc" : "desc",
	};

	const filteredModels = allModels.filter((item) => {
		if (normalizedFilters.search) {
			const searchLower = normalizedFilters.search.toLowerCase();
			const matchesSearch = Object.values(item).some((value) => {
				if (Array.isArray(value)) {
					return value.some((v) =>
						String(v).toLowerCase().includes(searchLower)
					);
				}
				if (typeof value === "object" && value !== null) {
					return Object.values(value).some((nestedValue) => {
						if (Array.isArray(nestedValue)) {
							return nestedValue.some((v) =>
								String(v).toLowerCase().includes(searchLower)
							);
						}
						return String(nestedValue)
							.toLowerCase()
							.includes(searchLower);
					});
				}
				return String(value).toLowerCase().includes(searchLower);
			});
			if (!matchesSearch) return false;
		}

		if (normalizedFilters.year > 0) {
			const itemYear = item.added
				? new Date(item.added).getFullYear()
				: null;
			if (itemYear !== normalizedFilters.year) return false;
		}

		if (normalizedFilters.inputModalities.length > 0) {
			const hasAllInputs = normalizedFilters.inputModalities.every((mod) =>
				item.inputModalities.includes(mod)
			);
			if (!hasAllInputs) return false;
		}

		if (normalizedFilters.outputModalities.length > 0) {
			const hasAllOutputs = normalizedFilters.outputModalities.every(
				(mod) => item.outputModalities.includes(mod)
			);
			if (!hasAllOutputs) return false;
		}

		if (normalizedFilters.features.length > 0) {
			const hasAllFeatures = normalizedFilters.features.every((feat) =>
				item.provider.features.includes(feat)
			);
			if (!hasAllFeatures) return false;
		}

		if (normalizedFilters.endpoints.length > 0) {
			const endpoint = normalizeEndpoint(item.endpoint);
			if (!normalizedFilters.endpoints.includes(endpoint)) return false;
		}

		if (normalizedFilters.statuses.length > 0) {
			if (!normalizedFilters.statuses.includes(item.gatewayStatus))
				return false;
		}

		if (normalizedFilters.tiers.length > 0) {
			const tier = item.tier || "standard";
			if (!normalizedFilters.tiers.includes(tier)) return false;
		}

		return true;
	});

	const sortField = normalizedFilters.sortField;
	const sortDirection = normalizedFilters.sortDirection;

	const models = filteredModels.sort((a, b) => {
		let aValue: any;
		let bValue: any;

		if (sortField === "added" || sortField === "retired") {
			const field = sortField as "added" | "retired";
			const aHasDate = !!a[field];
			const bHasDate = !!b[field];

			if (aHasDate && bHasDate) {
				const aDate = new Date(a[field]!).getTime();
				const bDate = new Date(b[field]!).getTime();
				return sortDirection === "asc" ? aDate - bDate : bDate - aDate;
			}
			if (aHasDate && !bHasDate) return -1;
			if (!aHasDate && bHasDate) return 1;
			return 0;
		}

		switch (sortField) {
			case "model":
				aValue = a.model;
				bValue = b.model;
				break;
			case "provider":
				aValue = a.provider.name;
				bValue = b.provider.name;
				break;
			case "endpoint":
				aValue = normalizeEndpoint(a.endpoint);
				bValue = normalizeEndpoint(b.endpoint);
				break;
			case "inputPrice":
				aValue = a.provider.inputPrice;
				bValue = b.provider.inputPrice;
				break;
			case "outputPrice":
				aValue = a.provider.outputPrice;
				bValue = b.provider.outputPrice;
				break;
			case "status":
				aValue = a.gatewayStatus;
				bValue = b.gatewayStatus;
				break;
			case "tier":
				aValue = a.tier || "standard";
				bValue = b.tier || "standard";
				break;
			case "context":
				aValue = a.context;
				bValue = b.context;
				break;
			case "maxOutput":
				aValue = a.maxOutput;
				bValue = b.maxOutput;
				break;
			default:
				aValue = "";
				bValue = "";
		}

		if (typeof aValue === "number" && typeof bValue === "number") {
			return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
		}

		const aStr = String(aValue).toLowerCase();
		const bStr = String(bValue).toLowerCase();
		return sortDirection === "asc"
			? aStr.localeCompare(bStr)
			: bStr.localeCompare(aStr);
	});

	const tiers = new Set(allTiers.length ? allTiers : []);
	tiers.add("standard");

	return {
		models,
		allTiers: Array.from(tiers).sort(),
		allEndpoints,
		allModalities,
		allFeatures,
		allStatuses,
	};
}

