import { createAdminClient } from "@/utils/supabase/admin";
import { cacheLife, cacheTag } from "next/cache";
import { featureOrder } from "@/lib/config/featureLabels";
import type { MonitorModelData, MonitorModelFilters, GatewayProvider, GatewayModel } from "./types";
import {
	parseModalities,
	extractFeatureKeys,
	normalizeGatewayModel,
	normalizeEndpoint,
} from "./helpers";

export type { MonitorModelData } from "./types";

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

	cacheLife("days");
	cacheTag("monitor-models");

	const supabase = createAdminClient();

	const { data: providerModels, error: providerModelsError } = await supabase
		.from("data_api_provider_models")
		.select(`
			provider_api_model_id,
			provider_id,
			api_model_id,
			internal_model_id,
			provider_model_slug,
			is_active_gateway,
			input_modalities,
			output_modalities,
			effective_from,
			effective_to,
			capabilities: data_api_provider_model_capabilities!inner(
				capability_id,
				params,
				status,
				max_input_tokens,
				max_output_tokens
			),
			provider: data_api_providers(
				api_provider_id,
				api_provider_name,
				link
			),
			model: data_models!data_api_provider_models_internal_model_id_fkey(
				model_id,
				name,
				release_date,
				retirement_date,
				status,
				input_types,
				output_types,
				hidden,
				organisation: data_organisations!data_models_organisation_id_fkey(
					organisation_id,
					name
				),
				details: data_model_details!data_model_details_model_id_fkey(
					detail_name,
					detail_value
				)
			)
		`)
		.neq("capabilities.status", "disabled");

	if (providerModelsError) {
		throw providerModelsError;
	}

	const ctxByModelId = new Map<
		string,
		{ context: number; maxOutput: number; quantization?: string }
	>();

	const gatewayModelsData: GatewayModel[] = [];
	const modelKeysSet = new Set<string>();
	const providerModelByKey = new Map<string, any>();

	for (const pm of providerModels ?? []) {
		const modelRow = Array.isArray(pm.model) ? pm.model[0] : pm.model;
		if (!includeHidden && modelRow?.hidden) continue;
		const modelId =
			modelRow?.model_id ?? pm.internal_model_id ?? pm.api_model_id ?? "";

		if (modelId && !ctxByModelId.has(modelId)) {
			const details = Array.isArray(modelRow?.details)
				? modelRow.details
				: [];
			let context = 0;
			let maxOutput = 0;
			let quantization: string | undefined;
			for (const d of details) {
				if (d.detail_name === "input_context_length") {
					context = Number(d.detail_value) || 0;
				}
				if (d.detail_name === "output_context_length") {
					maxOutput = Number(d.detail_value) || 0;
				}
				if (d.detail_name === "quantization") {
					quantization = String(d.detail_value);
				}
			}
			ctxByModelId.set(modelId, { context, maxOutput, quantization });
		}

		const providerRaw = Array.isArray(pm.provider)
			? pm.provider[0]
			: pm.provider;
		const providerInfo: GatewayProvider = providerRaw
			? {
				api_provider_name: providerRaw.api_provider_name ?? null,
				link: providerRaw.link ?? null,
			}
			: null;

		const providerModelKey = `${pm.provider_id}:${pm.api_model_id}`;
		if (pm.provider_id && pm.api_model_id) {
			providerModelByKey.set(providerModelKey, pm);
		}

		for (const cap of pm.capabilities ?? []) {
			if (!cap?.capability_id) continue;
			const key = `${pm.provider_id}:${pm.api_model_id}:${cap.capability_id}`;
			modelKeysSet.add(key);

			gatewayModelsData.push(
				normalizeGatewayModel({
					model_id: modelId,
					api_model_id: pm.api_model_id,
					api_provider_id: pm.provider_id,
					key,
					endpoint: cap.capability_id,
					is_active_gateway: pm.is_active_gateway,
					input_modalities: pm.input_modalities,
					output_modalities: pm.output_modalities,
					params: cap.params ?? {},
					provider: providerInfo,
				})
			);
		}
	}

	const modelKeys = Array.from(modelKeysSet);

	let pricingData:
		| Array<{
			model_key: string;
			meter: string;
			unit_size: number;
			price_per_unit: number;
			pricing_plan: string | null;
			effective_from: string | null;
			effective_to: string | null;
		}>
		| null = [];

	if (modelKeys.length) {
		const { data: pricingRows } = await supabase
			.from("data_api_pricing_rules")
			.select(`
        model_key,
        meter,
        unit_size,
        price_per_unit,
        pricing_plan,
        effective_from,
        effective_to
      `)
			.in("model_key", modelKeys)
			.or("effective_to.is.null,effective_to.gt." + new Date().toISOString())
			.order("effective_from", { ascending: false });

		pricingData = pricingRows ?? [];
	}

	const allTiers = [
		...new Set(
			(pricingData ?? [])
				.map((r) => r.pricing_plan)
				.filter((tier): tier is string => Boolean(tier))
		),
	].sort();

	const pricingByKey = new Map<
		string,
		{ inputPrice: number; outputPrice: number; tier: string }
	>();
	const freeByKey = new Map<string, boolean>();
	for (const p of pricingData ?? []) {
		if (p.model_key) {
			const plan = String(p.pricing_plan ?? "").toLowerCase();
			const price = Number(p.price_per_unit ?? 0);
			if (price === 0 || plan.includes("free")) {
				freeByKey.set(p.model_key, true);
			}
		}
		if (!pricingByKey.has(p.model_key)) {
			pricingByKey.set(p.model_key, {
				inputPrice: 0,
				outputPrice: 0,
				tier: "standard",
			});
		}
		const prices = pricingByKey.get(p.model_key)!;
		if (
			(p.meter === "input_text_tokens" || p.meter === "input_tokens") &&
			prices.inputPrice === 0
		) {
			const pricePerUnit = Number(p.price_per_unit ?? 0);
			const unitSize = Number(p.unit_size ?? 1);
			prices.inputPrice = pricePerUnit * unitSize * 1000000;
			prices.tier = p.pricing_plan || "standard";
		}
		if (
			(p.meter === "output_text_tokens" || p.meter === "output_tokens") &&
			prices.outputPrice === 0
		) {
			const pricePerUnit = Number(p.price_per_unit ?? 0);
			const unitSize = Number(p.unit_size ?? 1);
			prices.outputPrice = pricePerUnit * unitSize * 1000000;
			if (prices.tier === "standard") {
				prices.tier = p.pricing_plan || "standard";
			}
		}
	}

	const allModels: MonitorModelData[] = [];
	for (const gatewayModel of gatewayModelsData ?? []) {
		const pm = providerModelByKey.get(
			`${gatewayModel.api_provider_id}:${gatewayModel.api_model_id}`
		);
		const modelRow = Array.isArray(pm?.model) ? pm?.model[0] : pm?.model;
		const modelId =
			modelRow?.model_id ??
			pm?.internal_model_id ??
			gatewayModel.model_id ??
			pm?.api_model_id ??
			"";

		const { context, maxOutput, quantization } =
			ctxByModelId.get(modelId) ?? {
				context: 0,
				maxOutput: 0,
				quantization: undefined,
			};

		const baseInputModalities = parseModalities(modelRow?.input_types);
		const baseOutputModalities = parseModalities(modelRow?.output_types);
		const gatewayInputModalities = parseModalities(gatewayModel.input_modalities);
		const gatewayOutputModalities = parseModalities(gatewayModel.output_modalities);

		const prices =
			(gatewayModel?.key
				? pricingByKey.get(gatewayModel.key)
				: undefined) ?? {
				inputPrice: 0,
				outputPrice: 0,
				tier: "standard",
			};

		const extractedFeatures = extractFeatureKeys(gatewayModel?.params);
		const isFreeVariant =
			(gatewayModel?.key ? freeByKey.get(gatewayModel.key) : false) ||
			(Boolean(gatewayModel?.api_model_id) &&
				String(gatewayModel?.api_model_id).includes(":free"));
		const normalizedFeatures = new Set<string>(
			extractedFeatures.map((feature) => String(feature))
		);
		if (isFreeVariant) normalizedFeatures.add("free");

		const providerName =
			gatewayModel.provider?.api_provider_name ||
			gatewayModel.api_provider_id;

		const rawEndpoint = gatewayModel?.endpoint || gatewayModel?.key || "";
		const monitorModel: MonitorModelData = {
			id: `${modelId}-${gatewayModel.api_provider_id}-${gatewayModel.key}`,
			model: modelRow?.name || modelId || "",
			modelId,
			organisationId: Array.isArray(modelRow?.organisation)
				? (modelRow?.organisation[0] as any)?.organisation_id
				: (modelRow?.organisation as any)?.organisation_id || undefined,
			provider: {
				name: providerName ?? gatewayModel.api_provider_id,
				id: gatewayModel.api_provider_id,
				inputPrice: prices.inputPrice,
				outputPrice: prices.outputPrice,
				features: Array.from(normalizedFeatures),
			},
			endpoint: normalizeEndpoint(rawEndpoint),
			gatewayStatus: gatewayModel?.is_active_gateway ? "active" : "inactive",
			inputModalities:
				gatewayInputModalities.length > 0
					? gatewayInputModalities
					: baseInputModalities,
			outputModalities:
				gatewayOutputModalities.length > 0
					? gatewayOutputModalities
					: baseOutputModalities,
			context,
			maxOutput,
			quantization,
			tier: prices.tier || "standard",
			added: modelRow?.release_date || undefined,
			retired: modelRow?.retirement_date
				? new Date(modelRow.retirement_date).toISOString().split("T")[0]
				: undefined,
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
		statuses: filters.statuses ?? [],
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

