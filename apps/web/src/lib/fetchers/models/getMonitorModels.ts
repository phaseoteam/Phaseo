import { createClient } from "@/utils/supabase/client";
import { cacheLife, cacheTag } from "next/cache";

// Helper function to parse modalities from database
const parseModalities = (value: unknown): string[] => {
	if (Array.isArray(value)) {
		return value
			.map((item) => (typeof item === "string" ? item.trim() : String(item)))
			.filter((item) => item.length > 0);
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return [];
		if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
			const inner = trimmed.slice(1, -1);
			if (!inner) return [];
			return inner
				.split(",")
				.map((part) => part.trim().replace(/^"|"$/g, ""))
				.filter((part) => part.length > 0);
		}
		return trimmed
			.split(/[\,\s]+/)
			.map((part) => part.trim())
			.filter((part) => part.length > 0);
	}
	return [];
};

type GatewayProvider =
	| {
			api_provider_name?: string | null;
			link?: string | null;
	  }
	| null;

type GatewayModel = {
	model_id: string;
	api_provider_id: string;
	key: string;
	endpoint?: string | null;
	is_active_gateway?: boolean | null;
	input_modalities?: unknown;
	output_modalities?: unknown;
	params?: unknown;
	provider?: GatewayProvider;
};

const normalizeGatewayModel = (raw: any): GatewayModel => {
	const providerRaw = Array.isArray(raw?.provider)
		? raw.provider[0]
		: raw?.provider;

	return {
		model_id: raw?.model_id,
		api_provider_id: raw?.api_provider_id,
		key: raw?.key,
		endpoint: raw?.endpoint,
		is_active_gateway: raw?.is_active_gateway,
		input_modalities: raw?.input_modalities,
		output_modalities: raw?.output_modalities,
		params: raw?.params,
		provider: providerRaw ?? null,
	};
};

export interface MonitorModelData {
	id: string; // Will be model_id + provider_id + key
	model: string;
	modelId: string; // Add model ID for logo lookup
	organisationId?: string; // Add organisation ID for logo lookup
	provider: {
		name: string;
		id: string; // Add provider ID for logo lookup
		inputPrice: number;
		outputPrice: number;
		features: string[];
	};
	endpoint: string; // The specific endpoint/key
	gatewayStatus: "active" | "inactive"; // Whether this endpoint is active on the gateway
	inputModalities: string[];
	outputModalities: string[];
	context: number;
	maxOutput: number;
	quantization?: string;
	tier?: string; // pricing tier
	added?: string;
	retired?: string; // When this model is retired
}

export interface MonitorModelFilters {
	search?: string;
	inputModalities?: string[];
	outputModalities?: string[];
	features?: string[];
	endpoints?: string[];
	statuses?: Array<MonitorModelData["gatewayStatus"]>;
	tiers?: string[];
	year?: number;
	sortField?: string;
	sortDirection?: "asc" | "desc";
}

const normalizeEndpoint = (endpoint?: string | null) => {
	const trimmed = endpoint?.replace(/\uFFFD/g, "").trim();
	return trimmed || "";
};

export async function getMonitorModels(
	filters: MonitorModelFilters = {}
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

	const supabase = await createClient();

	const { data: modelsData, error: modelsError } = await supabase
		.from("data_models")
		.select(`
        model_id,
        name,
        release_date,
        retirement_date,
        status,
        input_types,
        output_types,
        organisation: data_organisations!data_models_organisation_id_fkey(
          organisation_id,
          name
        ),
        details: data_model_details!data_model_details_model_id_fkey(
          detail_name,
          detail_value
        )
      `);

	if (modelsError) {
		throw modelsError;
	}

	const ctxByModelId = new Map<
		string,
		{ context: number; maxOutput: number; quantization?: string }
	>();
	for (const model of modelsData ?? []) {
		const details = Array.isArray(model.details) ? model.details : [];
		let context = 0;
		let maxOutput = 0;
		let quantization: string | undefined;
		for (const d of details) {
			if (d.detail_name === "input_context_length")
				context = Number(d.detail_value) || 0;
			if (d.detail_name === "output_context_length")
				maxOutput = Number(d.detail_value) || 0;
			if (d.detail_name === "quantization")
				quantization = String(d.detail_value);
		}
		ctxByModelId.set(model.model_id, { context, maxOutput, quantization });
	}

	let gatewayModelsData: GatewayModel[] = [];

	const { data: providerModels, error: providerModelsError } = await supabase
		.from("data_api_provider_models")
		.select(
			"provider_api_model_id, provider_id, api_model_id, internal_model_id, provider_model_slug, is_active_gateway, input_modalities, output_modalities, effective_from, effective_to"
		);

	if (providerModelsError) {
		throw providerModelsError;
	}

	const providerModelIds = (providerModels ?? [])
		.map((row) => row.provider_api_model_id)
		.filter((id): id is string => Boolean(id));

        const { data: capabilities, error: capsError } = await supabase
                .from("data_api_provider_model_capabilities")
                .select("provider_api_model_id, capability_id, params, status")
                .in("provider_api_model_id", providerModelIds);

	if (capsError) {
		throw capsError;
	}

	const providerIds = Array.from(new Set((providerModels ?? []).map((row) => row.provider_id).filter(Boolean)));
	const providerMap = new Map<string, GatewayProvider>();
	if (providerIds.length) {
		const { data: providers } = await supabase
			.from("data_api_providers")
			.select("api_provider_id, api_provider_name, link")
			.in("api_provider_id", providerIds);

		for (const provider of providers ?? []) {
			if (provider?.api_provider_id) {
				providerMap.set(provider.api_provider_id, {
					api_provider_name: provider.api_provider_name ?? null,
					link: provider.link ?? null,
				});
			}
		}
	}

	const providerById = new Map<string, any>();
	for (const row of providerModels ?? []) {
		if (row.provider_api_model_id) {
			providerById.set(row.provider_api_model_id, row);
		}
	}

        for (const cap of capabilities ?? []) {
                if (cap.status === "disabled") continue;
                if (!cap.provider_api_model_id || !cap.capability_id) continue;
                const pm = providerById.get(cap.provider_api_model_id);
                if (!pm) continue;
		const model_id = pm.internal_model_id ?? pm.api_model_id;
		const key = `${pm.provider_id}:${pm.api_model_id}:${cap.capability_id}`;
		gatewayModelsData.push(
			normalizeGatewayModel({
				model_id,
				api_provider_id: pm.provider_id,
				key,
				endpoint: cap.capability_id,
				is_active_gateway: pm.is_active_gateway,
				input_modalities: pm.input_modalities,
				output_modalities: pm.output_modalities,
				params: cap.params ?? [],
				provider: providerMap.get(pm.provider_id) ?? null,
			})
		);
	}

	const modelKeys =
		gatewayModelsData?.map((pm) => pm.key).filter(Boolean) || [];

        const { data: pricingData } = await supabase
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

        const { data: allTiersData } = await supabase
                .from("data_api_pricing_rules")
                .select("pricing_plan")
                .not("pricing_plan", "is", null);

	const allTiers = [...new Set(allTiersData?.map((r) => r.pricing_plan) || [])]
		.filter((tier): tier is string => Boolean(tier))
		.sort();

	const pricingByKey = new Map<
		string,
		{ inputPrice: number; outputPrice: number; tier: string }
	>();
        for (const p of pricingData ?? []) {
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
			prices.inputPrice = p.price_per_unit * p.unit_size * 1000000;
			prices.tier = p.pricing_plan || "standard";
		}
		if (
			(p.meter === "output_text_tokens" || p.meter === "output_tokens") &&
			prices.outputPrice === 0
		) {
			prices.outputPrice = p.price_per_unit * p.unit_size * 1000000;
			if (prices.tier === "standard") {
				prices.tier = p.pricing_plan || "standard";
			}
		}
	}

	const gatewayModelsByModelId = new Map<string, GatewayModel[]>();
	for (const gm of gatewayModelsData ?? []) {
		if (!gatewayModelsByModelId.has(gm.model_id)) {
			gatewayModelsByModelId.set(gm.model_id, []);
		}
		gatewayModelsByModelId.get(gm.model_id)!.push(gm);
	}

	const modelMap = new Map<string, MonitorModelData>();

	for (const model of modelsData ?? []) {
		const { context, maxOutput, quantization } =
			ctxByModelId.get(model.model_id) ?? {
				context: 0,
				maxOutput: 0,
				quantization: undefined,
			};

		const baseInputModalities = parseModalities(model.input_types);
		const baseOutputModalities = parseModalities(model.output_types);

		const gateways = gatewayModelsByModelId.get(model.model_id) ?? [];
		const gatewayRows = gateways.length > 0 ? gateways : [null];

		for (const gatewayModel of gatewayRows) {
			const prices =
				(gatewayModel?.key
					? pricingByKey.get(gatewayModel.key)
					: undefined) ?? {
					inputPrice: 0,
					outputPrice: 0,
					tier: "standard",
				};

			const providerFeatures = Array.isArray(gatewayModel?.params)
				? gatewayModel.params
				: [];

			const providerName = gatewayModel
				? gatewayModel.provider?.api_provider_name ||
				  gatewayModel.api_provider_id
				: "Unlinked";

			const rawEndpoint = gatewayModel?.endpoint || gatewayModel?.key || "";
			const monitorModel: MonitorModelData = {
				id: gatewayModel
					? `${model.model_id}-${gatewayModel.api_provider_id}-${gatewayModel.key}`
					: `${model.model_id}-unlinked`,
				model: model.name || "",
				modelId: model.model_id,
				organisationId: Array.isArray(model.organisation)
					? (model.organisation[0] as any)?.organisation_id
					: (model.organisation as any)?.organisation_id || undefined,
				provider: {
					name: providerName ?? "Unlinked",
					id: gatewayModel?.api_provider_id || "unlinked",
					inputPrice: prices.inputPrice,
					outputPrice: prices.outputPrice,
					features: Array.isArray(providerFeatures)
						? providerFeatures
						: [],
				},
				endpoint: normalizeEndpoint(rawEndpoint),
				gatewayStatus: gatewayModel?.is_active_gateway ? "active" : "inactive",
				inputModalities: gatewayModel
					? parseModalities(gatewayModel.input_modalities)
					: baseInputModalities,
				outputModalities: gatewayModel
					? parseModalities(gatewayModel.output_modalities)
					: baseOutputModalities,
				context,
				maxOutput,
				quantization,
				tier: prices.tier || "standard",
				added: model.release_date || undefined,
				retired: model.retirement_date
					? new Date(model.retirement_date).toISOString().split("T")[0]
					: undefined,
			};

			modelMap.set(monitorModel.id, monitorModel);
		}

	}

	const allModels = Array.from(modelMap.values());

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
	const allFeatures = Array.from(featuresSet).sort();
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
