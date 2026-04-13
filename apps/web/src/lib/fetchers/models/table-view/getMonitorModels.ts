import { createAdminClient } from "@/utils/supabase/admin";
import { cacheLife, cacheTag } from "next/cache";
import { featureOrder } from "@/lib/config/featureLabels";
import type { MonitorModelData, MonitorModelFilters, GatewayProvider, GatewayModel } from "./types";
import {
	parseModalities,
	extractFeatureKeys,
	extractSupportedParameters,
	normalizeGatewayModel,
	normalizeCapabilityStatus,
	normalizeEndpoint,
	resolveGatewayStatus,
	toUsdPerMillion,
} from "./helpers";

export type { MonitorModelData } from "./types";

function normalizePricingDisplayUnit(
	meterRaw: unknown,
	unitRaw: unknown,
): string | null {
	const meter = String(meterRaw ?? "")
		.trim()
		.toLowerCase();
	const unit = String(unitRaw ?? "")
		.trim()
		.toLowerCase();

	if (
		meter.includes("token") ||
		unit === "token" ||
		unit === "tokens"
	) {
		return "1M tokens";
	}
	if (["second", "seconds", "sec", "secs", "s"].includes(unit)) {
		return "second";
	}
	if (["minute", "minutes", "min", "mins", "m"].includes(unit)) {
		return "minute";
	}
	if (["hour", "hours", "hr", "hrs", "h"].includes(unit)) {
		return "hour";
	}
	if (["image", "images"].includes(unit)) {
		return "image";
	}
	if (["video", "videos"].includes(unit)) {
		return "video";
	}
	if (["character", "characters", "char", "chars"].includes(unit)) {
		return "character";
	}

	return unit || null;
}

function toDisplayPrice(
	pricePerUnitRaw: unknown,
	unitSizeRaw: unknown,
	meterRaw: unknown,
	unitRaw: unknown,
): { value: number; unit: string } | null {
	const pricePerUnit = Number(pricePerUnitRaw ?? Number.NaN);
	const unitSize = Number(unitSizeRaw ?? Number.NaN);
	if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) return null;
	if (!Number.isFinite(unitSize) || unitSize <= 0) return null;

	const normalizedUnit = normalizePricingDisplayUnit(meterRaw, unitRaw);
	if (!normalizedUnit) return null;

	if (normalizedUnit === "1M tokens") {
		return {
			value: toUsdPerMillion(pricePerUnit, unitSize),
			unit: normalizedUnit,
		};
	}

	// Normalize all time-based pricing to per-second so comparisons are valid.
	if (normalizedUnit === "minute") {
		return {
			value: pricePerUnit / unitSize / 60,
			unit: "second",
		};
	}
	if (normalizedUnit === "hour") {
		return {
			value: pricePerUnit / unitSize / 3600,
			unit: "second",
		};
	}

	return {
		value: pricePerUnit / unitSize,
		unit: normalizedUnit,
	};
}

async function fetchProviderModelsPaginated({
	supabase,
	selectClause,
	pageSize = 1000,
}: {
	supabase: ReturnType<typeof createAdminClient>;
	selectClause: string;
	pageSize?: number;
}): Promise<{ data: any[] | null; error: any | null }> {
	const rows: any[] = [];

	for (let from = 0; ; from += pageSize) {
		const to = from + pageSize - 1;
		const { data, error } = await supabase
			.from("data_api_provider_models")
			.select(selectClause)
			.not("api_model_id", "is", null)
			.order("provider_api_model_id", { ascending: true })
			.range(from, to);

		if (error) {
			return { data: null, error };
		}
		if (!Array.isArray(data) || data.length === 0) {
			break;
		}

		rows.push(...data);
		if (data.length < pageSize) {
			break;
		}
	}

	return { data: rows, error: null };
}

async function fetchPricingRulesByModelKeysInBatches({
	supabase,
	modelKeys,
	batchSize = 120,
}: {
	supabase: ReturnType<typeof createAdminClient>;
	modelKeys: string[];
	batchSize?: number;
}): Promise<
	Array<{
		model_key: string;
		meter: string;
		unit: string | null;
		unit_size: number;
		price_per_unit: number;
		pricing_plan: string | null;
		effective_from: string | null;
		effective_to: string | null;
	}>
> {
	const rows: Array<{
		model_key: string;
		meter: string;
		unit: string | null;
		unit_size: number;
		price_per_unit: number;
		pricing_plan: string | null;
		effective_from: string | null;
		effective_to: string | null;
	}> = [];
	const nowIso = new Date().toISOString();
	const activePricingWindowClause = [
		"and(effective_from.is.null,effective_to.is.null)",
		`and(effective_from.is.null,effective_to.gt.${nowIso})`,
		`and(effective_from.lte.${nowIso},effective_to.is.null)`,
		`and(effective_from.lte.${nowIso},effective_to.gt.${nowIso})`,
	].join(",");

	for (let i = 0; i < modelKeys.length; i += batchSize) {
		const batch = modelKeys.slice(i, i + batchSize);
		if (!batch.length) continue;

		const { data, error } = await supabase
			.from("data_api_pricing_rules")
			.select(`
        model_key,
        meter,
        unit,
        unit_size,
        price_per_unit,
        pricing_plan,
        effective_from,
        effective_to
      `)
			.in("model_key", batch)
			.or(activePricingWindowClause)
			.order("effective_from", { ascending: false });

		if (error) {
			throw new Error(
				`Fetching pricing batch failed at index ${i}: ${error.message ?? String(error)}`,
			);
		}

		if (Array.isArray(data) && data.length > 0) {
			rows.push(...data);
		}
	}

	return rows;
}

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
	cacheTag("data:data_api_provider_models");
	cacheTag("data:data_api_pricing_rules");
	cacheTag("data:models");
	cacheTag("data:api_providers");

	const supabase = createAdminClient();
	const baseSelect = `
		provider_api_model_id,
		provider_id,
		model_id,
		api_model_id,
		provider_model_slug,
		is_active_gateway,
		input_modalities,
		output_modalities,
		quantization_scheme,
		context_length,
		max_output_tokens,
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
		)
	`;
	const legacySelect = `
		provider_api_model_id,
		provider_id,
		api_model_id,
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
		)
	`;

	let providerModels: any[] | null = null;
	let providerModelsError: any = null;
	{
		const res = await fetchProviderModelsPaginated({
			supabase,
			selectClause: baseSelect,
			pageSize: 1000,
		});
		providerModels = res.data ?? null;
		providerModelsError = res.error;
	}

	const providerModelLegacySchemaMissing =
		/(model_id|context_length|max_output_tokens|quantization_scheme)/i.test(
			String(providerModelsError?.message ?? ""),
		);
	if (providerModelsError && providerModelLegacySchemaMissing) {
		const res = await fetchProviderModelsPaginated({
			supabase,
			selectClause: legacySelect,
			pageSize: 1000,
		});
		providerModels = res.data ?? null;
		providerModelsError = res.error;
	}

	if (providerModelsError) {
		throw providerModelsError;
	}

	const modelIds = Array.from(
		new Set(
			(providerModels ?? [])
				.map((pm: any) => {
					const modelId = String(pm?.model_id ?? pm?.api_model_id ?? "").trim();
					return modelId.length > 0 ? modelId : null;
				})
				.filter((modelId): modelId is string => Boolean(modelId)),
		),
	);

	const { data: modelRows, error: modelRowsError } = modelIds.length
		? await supabase
				.from("data_models")
				.select(
					`
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
					)
					`,
				)
				.in("model_id", modelIds)
		: { data: [] as any[], error: null as any };

	if (modelRowsError) {
		throw modelRowsError;
	}

	const modelById = new Map<string, any>();
	for (const row of modelRows ?? []) {
		const modelId = String((row as any)?.model_id ?? "").trim();
		if (!modelId) continue;
		modelById.set(modelId, row);
	}

	const ctxByModelId = new Map<
		string,
		{ context: number; maxOutput: number; quantization?: string }
	>();

	const gatewayModelsData: GatewayModel[] = [];
	const modelKeysSet = new Set<string>();
	const providerModelByKey = new Map<string, any>();

	for (const pm of providerModels ?? []) {
		const modelId =
			pm.model_id ??
			pm.api_model_id ??
			"";
		const modelRow = modelById.get(modelId) ?? null;
		if (!includeHidden && modelRow?.hidden) continue;
		const capabilities: any[] = Array.isArray(pm.capabilities)
			? pm.capabilities
			: [];

		if (modelId && !ctxByModelId.has(modelId)) {
			const providerContext = Number(pm.context_length);
			const providerMaxOutput = Number(pm.max_output_tokens);
			const capMaxInput = capabilities.reduce((max: number, capability: any) => {
				const value = Number((capability as any)?.max_input_tokens);
				return Number.isFinite(value) && value > max ? value : max;
			}, 0);
			const capMaxOutput = capabilities.reduce((max: number, capability: any) => {
				const value = Number((capability as any)?.max_output_tokens);
				return Number.isFinite(value) && value > max ? value : max;
			}, 0);
			const context = Number.isFinite(providerContext) && providerContext > 0
				? providerContext
				: capMaxInput;
			const maxOutput = Number.isFinite(providerMaxOutput) && providerMaxOutput > 0
				? providerMaxOutput
				: capMaxOutput;
			const quantizationRaw = pm.quantization_scheme;
			const quantization =
				typeof quantizationRaw === "string" && quantizationRaw.trim()
					? quantizationRaw
					: undefined;
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

		for (const cap of capabilities) {
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
					capability_status: cap.status ?? null,
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
			unit: string | null;
			unit_size: number;
			price_per_unit: number;
			pricing_plan: string | null;
			effective_from: string | null;
			effective_to: string | null;
		}>
		| null = [];

	if (modelKeys.length) {
		pricingData = await fetchPricingRulesByModelKeysInBatches({
			supabase,
			modelKeys,
			batchSize: 120,
		});
	}

	const pricingByKey = new Map<
		string,
		{
			inputPrice: number;
			outputPrice: number;
			tier: string;
			fromPrice: number | null;
			fromPriceUnit: string | null;
		}
	>();
	const freeByKey = new Map<string, boolean>();
	for (const p of pricingData ?? []) {
		if (p.model_key) {
			if (String(p.model_key).toLowerCase().includes(":free:")) {
				freeByKey.set(p.model_key, true);
			}
		}
		if (!pricingByKey.has(p.model_key)) {
			pricingByKey.set(p.model_key, {
				inputPrice: 0,
				outputPrice: 0,
				tier: "standard",
				fromPrice: null,
				fromPriceUnit: null,
			});
		}
		const prices = pricingByKey.get(p.model_key)!;
		if (
			(p.meter === "input_text_tokens" || p.meter === "input_tokens") &&
			prices.inputPrice === 0
		) {
			prices.inputPrice = toUsdPerMillion(p.price_per_unit, p.unit_size);
			prices.tier = p.pricing_plan || "standard";
		}
		if (
			(p.meter === "output_text_tokens" || p.meter === "output_tokens") &&
			prices.outputPrice === 0
		) {
			prices.outputPrice = toUsdPerMillion(p.price_per_unit, p.unit_size);
			if (prices.tier === "standard") {
				prices.tier = p.pricing_plan || "standard";
			}
		}

		const displayPrice = toDisplayPrice(
			p.price_per_unit,
			p.unit_size,
			p.meter,
			p.unit,
		);
		if (!displayPrice) continue;
		if (prices.fromPrice === null || !prices.fromPriceUnit) {
			prices.fromPrice = displayPrice.value;
			prices.fromPriceUnit = displayPrice.unit;
			continue;
		}
		// Only compare numeric values within the same display unit.
		if (
			prices.fromPriceUnit === displayPrice.unit &&
			displayPrice.value < prices.fromPrice
		) {
			prices.fromPrice = displayPrice.value;
			prices.fromPriceUnit = displayPrice.unit;
		}
	}

	const allModels: MonitorModelData[] = [];
	for (const gatewayModel of gatewayModelsData ?? []) {
		const pm = providerModelByKey.get(
			`${gatewayModel.api_provider_id}:${gatewayModel.api_model_id}`
		);
		const modelId =
			pm?.model_id ??
			pm?.api_model_id ??
			gatewayModel.model_id ??
			"";
		const modelRow = modelById.get(modelId) ?? null;

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
				fromPrice: null,
				fromPriceUnit: null,
			};

		const extractedFeatures = extractFeatureKeys(gatewayModel?.params);
		const supportedParameters = extractSupportedParameters(gatewayModel?.params);
		const isFreeVariant =
			(gatewayModel?.key ? freeByKey.get(gatewayModel.key) : false) ||
			(Boolean(gatewayModel?.api_model_id) &&
				String(gatewayModel?.api_model_id).includes(":free"));
		const normalizedFeatures = new Set<string>(
			extractedFeatures.map((feature) => String(feature))
		);
		if (isFreeVariant) normalizedFeatures.add("free");
		const featureOrderIndexForRow = new Map(
			featureOrder.map((feature, index) => [feature, index])
		);
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
			gatewayModel.provider?.api_provider_name ||
			gatewayModel.api_provider_id;
		const organisationRecord = Array.isArray(modelRow?.organisation)
			? (modelRow?.organisation[0] as any)
			: (modelRow?.organisation as any);

		const rawEndpoint = gatewayModel?.endpoint || gatewayModel?.key || "";
		const monitorModel: MonitorModelData = {
			id: `${modelId}-${gatewayModel.api_provider_id}-${gatewayModel.key}`,
			model: modelRow?.name || modelId || "",
			modelId,
			apiModelId: pm?.api_model_id ?? gatewayModel.api_model_id ?? undefined,
			organisationId: organisationRecord?.organisation_id || undefined,
			organisationName: organisationRecord?.name || undefined,
			provider: {
				name: providerName ?? gatewayModel.api_provider_id,
				id: gatewayModel.api_provider_id,
				inputPrice: prices.inputPrice,
				outputPrice: prices.outputPrice,
				fromPrice: prices.fromPrice,
				fromPriceUnit: prices.fromPriceUnit,
				features: sortedFeatures,
			},
			endpoint: normalizeEndpoint(rawEndpoint),
			gatewayStatus: resolveGatewayStatus(
				gatewayModel?.is_active_gateway,
				gatewayModel?.capability_status,
			),
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
			supportedParameters,
			effectiveFrom: pm?.effective_from ?? undefined,
			tier: isFreeVariant ? "free" : prices.tier || "standard",
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

