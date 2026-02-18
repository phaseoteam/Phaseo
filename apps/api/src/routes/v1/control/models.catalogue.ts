// Purpose: Catalogue loader for model listings.
// Why: Keeps /models route handler slim and reusable.
// How: Pulls model metadata, providers, capabilities, and pricing summaries.

import { getSupabaseAdmin } from "@/runtime/env";
import type { Endpoint } from "@core/types";

type ProviderModelRow = {
    provider_api_model_id: string | null;
    provider_id: string | null;
    api_model_id: string | null;
    internal_model_id: string | null;
    provider_model_slug?: string | null;
    is_active_gateway: boolean | null;
    input_modalities?: unknown;
    output_modalities?: unknown;
    effective_from?: string | null;
    effective_to?: string | null;
};

type CapabilityRow = {
    provider_api_model_id: string | null;
    capability_id: string | null;
    params?: unknown;
    effective_from?: string | null;
    effective_to?: string | null;
};

type PricingRuleRow = {
    model_key: string | null;
    capability_id: string | null;
    pricing_plan?: string | null;
    meter: string | null;
    unit: string | null;
    unit_size: number | string | null;
    price_per_unit: number | string | null;
    currency: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
};

type ProviderDetails = {
    api_provider_id: string;
    api_provider_name: string | null;
    link: string | null;
    country_code: string | null;
};

type OrganisationDetails = {
    organisation_id: string | null;
    name: string | null;
    country_code: string | null;
    colour: string | null;
};

type CatalogueProvider = {
    api_provider_id: string;
    api_provider_name: string | null;
    link: string | null;
    country_code: string | null;
    endpoint: Endpoint;
    provider_model_slug: string | null;
    is_active_gateway: boolean;
    input_modalities: string[];
    output_modalities: string[];
    effective_from: string | null;
    effective_to: string | null;
    params: string[];
};

type ProviderInfo = {
    api_provider_id: string;
    params: string[];
};

export type PricingMeterSummary = {
    provider_id: string;
    unit: string;
    unit_size: number;
    price_per_unit: string;
    currency: string | null;
};

export type PricingSummary = {
    pricing_plan: "standard";
    meters: Record<string, PricingMeterSummary | null>;
};

export type CatalogueModel = {
    model_id: string;
    name: string | null;
    release_date: string | null;
    deprecation_date: string | null;
    retirement_date: string | null;
    status: string | null;
    organisation_id: string | null;
    organisation_name: string | null;
    organisation_colour: string | null;
    aliases: string[];
    endpoints: Endpoint[];
    input_types: string[];
    output_types: string[];
    providers: ProviderInfo[];
    supported_params: string[];
    top_provider: string | null;
    pricing: PricingSummary;
};

export type CatalogueFilters = {
    endpoints?: string[];
    organisationIds?: string[];
    inputTypes?: string[];
    outputTypes?: string[];
    params?: string[];
};

const PRICING_METERS = [
    "input_text_tokens",
    "input_image_tokens",
    "input_image",
    "input_video_tokens",
    "input_audio_tokens",
    "input_audio_seconds",
    "output_text_tokens",
    "output_image_tokens",
    "output_image",
    "output_audio_tokens",
    "output_audio_seconds",
    "web_search",
    "cached_read_text_tokens",
    "cached_write_text_tokens",
];

const TOP_PROVIDER_METERS = ["input_text_tokens", "output_text_tokens"];

function toStringArray(value: unknown): string[] {
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
            .split(/[,\s]+/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    }
    return [];
}

function withinEffectiveWindow(
    effectiveFrom: string | null | undefined,
    effectiveTo: string | null | undefined,
    now: Date
): boolean {
    const from = effectiveFrom ? new Date(effectiveFrom) : null;
    const to = effectiveTo ? new Date(effectiveTo) : null;
    if (from && Number.isFinite(from.getTime()) && now < from) return false;
    if (to && Number.isFinite(to.getTime()) && now >= to) return false;
    return true;
}

function toParamsList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === "string" ? item.trim() : String(item)))
            .filter((item) => item.length > 0);
    }
    if (value && typeof value === "object") {
        return Object.keys(value as Record<string, unknown>);
    }
    return toStringArray(value);
}

function parseDate(value: string | null): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

function compareModels(a: CatalogueModel, b: CatalogueModel): number {
    const aPrimary = parseDate(a.release_date) ?? Number.NEGATIVE_INFINITY;
    const bPrimary = parseDate(b.release_date) ?? Number.NEGATIVE_INFINITY;
    if (aPrimary !== bPrimary) {
        return bPrimary - aPrimary;
    }
    const aName = (a.name ?? "").toLocaleLowerCase();
    const bName = (b.name ?? "").toLocaleLowerCase();
    if (aName !== bName) {
        return aName.localeCompare(bName);
    }
    return a.model_id.localeCompare(b.model_id);
}

function normalizeStringSet(values?: string[]): string[] | undefined {
    if (!values || !values.length) return undefined;
    const normalized = Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
    return normalized.length ? normalized : undefined;
}

function parseModelKey(value?: string | null): { providerId: string; apiModelId: string; capabilityId: string } | null {
    if (!value) return null;
    const parts = value.split(":");
    if (parts.length < 3) return null;
    const capabilityId = parts.pop() ?? "";
    const providerId = parts.shift() ?? "";
    const apiModelId = parts.join(":");
    if (!providerId || !apiModelId || !capabilityId) return null;
    return { providerId, apiModelId, capabilityId };
}

function parseNumeric(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
}

function comparePerUnit(candidate: PricingRuleRow, current?: PricingMeterSummary | null): PricingMeterSummary | null {
    const unitSize = parseNumeric(candidate.unit_size) ?? 1;
    const price = parseNumeric(candidate.price_per_unit);
    if (price === null || unitSize <= 0) return current ?? null;
    const perUnit = price / unitSize;
    const currentPerUnit = current ? parseNumeric(current.price_per_unit) ?? 0 / (current.unit_size || 1) : null;
    if (current && currentPerUnit !== null && currentPerUnit <= perUnit) {
        return current;
    }
    return {
        provider_id: "",
        unit: candidate.unit ?? "token",
        unit_size: unitSize,
        price_per_unit: String(price),
        currency: candidate.currency ?? "USD",
    };
}

function initPricingSummary(): PricingSummary {
    const meters = PRICING_METERS.reduce<Record<string, PricingMeterSummary | null>>((acc, meter) => {
        acc[meter] = null;
        return acc;
    }, {});
    return { pricing_plan: "standard", meters };
}

function getTopProvider(providerMeters: Map<string, Map<string, number>>): string | null {
    let best: { provider: string; cost: number } | null = null;
    for (const [providerId, meters] of providerMeters) {
        let total = 0;
        let hasAny = false;
        for (const meter of TOP_PROVIDER_METERS) {
            const price = meters.get(meter);
            if (price === undefined) continue;
            total += price;
            hasAny = true;
        }
        if (!hasAny) continue;
        if (!best || total < best.cost) {
            best = { provider: providerId, cost: total };
        }
    }
    return best?.provider ?? null;
}

export async function fetchCatalogue(filter: CatalogueFilters): Promise<CatalogueModel[]> {
    const supabase = getSupabaseAdmin();
    const modelQuery = supabase
        .from("data_models")
        .select(
            "model_id, name, release_date, deprecation_date, retirement_date, status, organisation_id, input_types, output_types, organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name, country_code, colour)"
        )
        .eq("hidden", false);
    const { data: modelRows, error: modelError } = await modelQuery;
    if (modelError) {
        throw new Error(modelError.message || "Failed to load model metadata");
    }

    const baseModels = new Map<
        string,
        {
            model_id: string;
            name: string | null;
            release_date: string | null;
            deprecation_date: string | null;
            retirement_date: string | null;
            status: string | null;
            organisation: OrganisationDetails | null;
            organisation_id: string | null;
            input_types: string[];
            output_types: string[];
        }
    >();

    for (const model of modelRows ?? []) {
        if (!model?.model_id) continue;
        const organisation = Array.isArray(model.organisation) ? model.organisation[0] : model.organisation;
        baseModels.set(model.model_id, {
            model_id: model.model_id,
            name: model.name ?? null,
            release_date: model.release_date ?? null,
            deprecation_date: model.deprecation_date ?? null,
            retirement_date: model.retirement_date ?? null,
            status: model.status ?? null,
            organisation: organisation
                ? {
                    organisation_id: organisation.organisation_id ?? null,
                    name: organisation.name ?? null,
                    country_code: organisation.country_code ?? null,
                    colour: organisation.colour ?? null,
                }
                : null,
            organisation_id: model.organisation_id ?? null,
            input_types: toStringArray(model.input_types),
            output_types: toStringArray(model.output_types),
        });
    }

    const modelIds = Array.from(baseModels.keys());
    if (!modelIds.length) {
        return [];
    }

    const { data: providerRows, error: providerError } = await supabase
        .from("data_api_provider_models")
        .select(
            "provider_api_model_id, provider_id, api_model_id, internal_model_id, provider_model_slug, is_active_gateway, input_modalities, output_modalities, effective_from, effective_to"
        )
        .in("internal_model_id", modelIds);

    if (providerError) {
        throw new Error(providerError.message || "Failed to load provider models");
    }

    const providerModelIds = (providerRows ?? [])
        .map((row) => row.provider_api_model_id)
        .filter((id): id is string => Boolean(id));
    const { data: capabilityRowsRaw, error: capabilityError } = await supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id, capability_id, params")
        .eq("status", "active")
        .in("provider_api_model_id", providerModelIds);
    if (capabilityError) {
        throw new Error(capabilityError.message || "Failed to load provider capabilities");
    }
    const capabilityRows = (capabilityRowsRaw ?? []) as CapabilityRow[];

    const aliasMap = new Map<string, string[]>();
    const apiModelIds = Array.from(
        new Set((providerRows ?? []).map((row) => row.api_model_id).filter(Boolean))
    );
    if (apiModelIds.length) {
        const { data: aliases, error: aliasError } = await supabase
            .from("data_api_model_aliases")
            .select("alias_slug, api_model_id")
            .eq("is_enabled", true)
            .in("api_model_id", apiModelIds);
        if (aliasError) {
            throw new Error(aliasError.message || "Failed to load model aliases");
        }
        const aliasByApiModel = new Map<string, string[]>();
        for (const alias of aliases ?? []) {
            if (!alias?.api_model_id || !alias?.alias_slug) continue;
            const existing = aliasByApiModel.get(alias.api_model_id) ?? [];
            existing.push(alias.alias_slug);
            aliasByApiModel.set(alias.api_model_id, existing);
        }
        for (const row of providerRows ?? []) {
            if (!row.internal_model_id || !row.api_model_id) continue;
            const aliasesForApi = aliasByApiModel.get(row.api_model_id) ?? [];
            if (!aliasesForApi.length) continue;
            const existing = aliasMap.get(row.internal_model_id) ?? [];
            for (const alias of aliasesForApi) {
                if (!existing.includes(alias)) existing.push(alias);
            }
            aliasMap.set(row.internal_model_id, existing);
        }
        for (const [key, list] of aliasMap) {
            aliasMap.set(key, list.slice().sort((a, b) => a.localeCompare(b)));
        }
    }

    const now = new Date();
    const providersByModel = new Map<string, ProviderModelRow[]>();
    const providerIdSet = new Set<string>();
    for (const row of providerRows ?? []) {
        if (!row?.internal_model_id || !row?.provider_id) continue;
        providerIdSet.add(row.provider_id);
        if (!row.is_active_gateway) continue;
        if (!withinEffectiveWindow(row.effective_from, row.effective_to, now)) continue;
        const existing = providersByModel.get(row.internal_model_id) ?? [];
        existing.push(row as ProviderModelRow);
        providersByModel.set(row.internal_model_id, existing);
    }

    const capabilitiesByProviderModel = new Map<string, CapabilityRow[]>();
    for (const cap of capabilityRows) {
        if (!cap?.provider_api_model_id || !cap?.capability_id) continue;
        if (!withinEffectiveWindow(cap.effective_from, cap.effective_to, now)) continue;
        const existing = capabilitiesByProviderModel.get(cap.provider_api_model_id) ?? [];
        existing.push(cap as CapabilityRow);
        capabilitiesByProviderModel.set(cap.provider_api_model_id, existing);
    }

    const providerMap = new Map<string, ProviderDetails>();
    if (providerIdSet.size) {
        const { data: providerDetails, error: providerDetailsError } = await supabase
            .from("data_api_providers")
            .select("api_provider_id, api_provider_name, link, country_code")
            .in("api_provider_id", Array.from(providerIdSet));
        if (providerDetailsError) {
            throw new Error(providerDetailsError.message || "Failed to load provider metadata");
        }
        for (const provider of providerDetails ?? []) {
            if (!provider?.api_provider_id) continue;
            providerMap.set(provider.api_provider_id, {
                api_provider_id: provider.api_provider_id,
                api_provider_name: provider.api_provider_name ?? null,
                link: provider.link ?? null,
                country_code: provider.country_code ?? null,
            });
        }
    }

    const nowIso = new Date().toISOString();
    const { data: pricingRows, error: pricingError } = await supabase
        .from("data_api_pricing_rules")
        .select("model_key, capability_id, pricing_plan, meter, unit, unit_size, price_per_unit, currency, effective_from, effective_to")
        .eq("pricing_plan", "standard")
        .or([
            "and(effective_from.is.null,effective_to.is.null)",
            `and(effective_from.is.null,effective_to.gt.${nowIso})`,
            `and(effective_from.lte.${nowIso},effective_to.is.null)`,
            `and(effective_from.lte.${nowIso},effective_to.gt.${nowIso})`,
        ].join(","));

    if (pricingError) {
        throw new Error(pricingError.message || "Failed to load pricing rules");
    }

    const comboMap = new Map<string, { model_id: string | null; provider_id: string }>();
    for (const cap of capabilityRows) {
        if (!cap?.provider_api_model_id || !cap?.capability_id) continue;
        const providerModel = (providerRows ?? []).find(
            (row) => row.provider_api_model_id === cap.provider_api_model_id
        );
        if (!providerModel?.provider_id || !providerModel.api_model_id) continue;
        const comboKey = `${providerModel.provider_id}:${providerModel.api_model_id}:${cap.capability_id}`;
        comboMap.set(comboKey, {
            model_id: providerModel.internal_model_id ?? null,
            provider_id: providerModel.provider_id,
        });
    }

    const pricingByModel = new Map<string, PricingSummary>();
    const providerMeterByModel = new Map<string, Map<string, Map<string, number>>>();

    for (const rule of pricingRows ?? []) {
        const parsed = parseModelKey(rule.model_key);
        if (!parsed) continue;
        const capabilityId = parsed.capabilityId || rule.capability_id;
        if (!capabilityId) continue;
        const comboKey = `${parsed.providerId}:${parsed.apiModelId}:${capabilityId}`;
        const combo = comboMap.get(comboKey);
        if (!combo?.model_id) continue;
        const meter = rule.meter ?? "";
        if (!PRICING_METERS.includes(meter)) continue;

        const perUnitPrice = parseNumeric(rule.price_per_unit);
        const unitSize = parseNumeric(rule.unit_size) ?? 1;
        if (perUnitPrice === null || unitSize <= 0) continue;

        const perUnit = perUnitPrice / unitSize;
        const modelPricing = pricingByModel.get(combo.model_id) ?? initPricingSummary();
        const current = modelPricing.meters[meter];
        const candidate = comparePerUnit(rule, current);
        if (candidate) {
            candidate.provider_id = combo.provider_id;
            modelPricing.meters[meter] = candidate;
        }
        pricingByModel.set(combo.model_id, modelPricing);

        const providerMeters = providerMeterByModel.get(combo.model_id) ?? new Map<string, Map<string, number>>();
        const meterMap = providerMeters.get(combo.provider_id) ?? new Map<string, number>();
        const existing = meterMap.get(meter);
        if (existing === undefined || perUnit < existing) {
            meterMap.set(meter, perUnit);
        }
        providerMeters.set(combo.provider_id, meterMap);
        providerMeterByModel.set(combo.model_id, providerMeters);
    }

    const endpointsFilter = normalizeStringSet(filter.endpoints)?.map((value) => value as Endpoint);
    const organisationIds = normalizeStringSet(filter.organisationIds);
    const inputTypesFilter = normalizeStringSet(filter.inputTypes)?.map((value) => value.toLowerCase());
    const outputTypesFilter = normalizeStringSet(filter.outputTypes)?.map((value) => value.toLowerCase());
    const paramsFilter = normalizeStringSet(filter.params);

    const models: CatalogueModel[] = [];
    for (const [modelId, info] of baseModels) {
        if (organisationIds?.length) {
            const organisationId = info.organisation?.organisation_id ?? info.organisation_id ?? null;
            if (!organisationId || !organisationIds.includes(organisationId)) continue;
        }

        const providers = providersByModel.get(modelId) ?? [];
        const providerEntries: CatalogueProvider[] = [];
        for (const row of providers) {
            if (!row.provider_api_model_id) continue;
            const caps = capabilitiesByProviderModel.get(row.provider_api_model_id) ?? [];
            const providerDetails = row.provider_id ? providerMap.get(row.provider_id) : null;
            for (const cap of caps) {
                if (!cap.capability_id) continue;
                providerEntries.push({
                    api_provider_id: row.provider_id!,
                    api_provider_name: providerDetails?.api_provider_name ?? null,
                    link: providerDetails?.link ?? null,
                    country_code: providerDetails?.country_code ?? null,
                    endpoint: String(cap.capability_id) as Endpoint,
                    provider_model_slug: row.provider_model_slug ?? null,
                    is_active_gateway: true,
                    input_modalities: toStringArray(row.input_modalities),
                    output_modalities: toStringArray(row.output_modalities),
                    effective_from: cap.effective_from ?? row.effective_from ?? null,
                    effective_to: cap.effective_to ?? row.effective_to ?? null,
                    params: toParamsList(cap.params),
                });
            }
        }

        providerEntries.sort((a, b) => {
            const aName = (a.api_provider_name ?? a.api_provider_id).toLowerCase();
            const bName = (b.api_provider_name ?? b.api_provider_id).toLowerCase();
            if (aName !== bName) return aName.localeCompare(bName);
            if (a.endpoint !== b.endpoint) return a.endpoint.localeCompare(b.endpoint);
            return (a.provider_model_slug ?? "").localeCompare(b.provider_model_slug ?? "");
        });

        const endpoints = Array.from(
            new Set(providerEntries.map((entry) => entry.endpoint))
        ).sort();

        if (endpointsFilter?.length) {
            const hasIncluded = endpointsFilter.some((endpoint) => endpoints.includes(endpoint));
            if (!hasIncluded) continue;
        }

        if (inputTypesFilter?.length) {
            const modelInputs = info.input_types.map((type) => type.toLowerCase());
            const hasInput = inputTypesFilter.some((type) => modelInputs.includes(type));
            if (!hasInput) continue;
        }

        if (outputTypesFilter?.length) {
            const modelOutputs = info.output_types.map((type) => type.toLowerCase());
            const hasOutput = outputTypesFilter.some((type) => modelOutputs.includes(type));
            if (!hasOutput) continue;
        }

        if (paramsFilter?.length) {
            const modelParams = providerEntries.flatMap((entry) => entry.params);
            const hasParam = paramsFilter.some((param) => modelParams.includes(param));
            if (!hasParam) continue;
        }

        const aliases = aliasMap.get(modelId) ?? [];

        const providerMapForModel = new Map<string, string[]>();
        for (const entry of providerEntries) {
            const existing = providerMapForModel.get(entry.api_provider_id) ?? [];
            for (const param of entry.params) {
                if (!existing.includes(param)) existing.push(param);
            }
            providerMapForModel.set(entry.api_provider_id, existing);
        }
        const providerInfos: ProviderInfo[] = Array.from(providerMapForModel.entries())
            .map(([api_provider_id, params]) => ({ api_provider_id, params: params.sort() }))
            .sort((a, b) => a.api_provider_id.localeCompare(b.api_provider_id));

        const supportedParams = Array.from(
            new Set(providerEntries.flatMap((entry) => entry.params))
        ).sort((a, b) => a.localeCompare(b));

        const pricing = pricingByModel.get(modelId) ?? initPricingSummary();
        const topProvider = getTopProvider(providerMeterByModel.get(modelId) ?? new Map());

        const model: CatalogueModel = {
            model_id: info.model_id,
            name: info.name,
            release_date: info.release_date,
            deprecation_date: info.deprecation_date,
            retirement_date: info.retirement_date,
            status: info.status ?? null,
            organisation_id: info.organisation?.organisation_id ?? info.organisation_id ?? null,
            organisation_name: info.organisation?.name ?? null,
            organisation_colour: info.organisation?.colour ?? null,
            aliases,
            endpoints,
            input_types: [...info.input_types],
            output_types: [...info.output_types],
            providers: providerInfos,
            supported_params: supportedParams,
            top_provider: topProvider,
            pricing,
        };

        models.push(model);
    }

    return models.sort(compareModels);
}
