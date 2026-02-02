// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import type { Endpoint } from "@core/types";
import { guardAuth, type GuardErr } from "@pipeline/before/guards";
import { json, withRuntime, cacheHeaders, cacheResponse } from "@/routes/utils";

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

type CatalogueModel = {
    model_id: string;
    name: string | null;
    release_date: string | null;
    status: string | null;
    organisation_id: string | null;
    organisation_name: string | null;
    organisation_colour: string | null;
    aliases: string[];
    endpoints: Endpoint[];
    input_types: string[];
    output_types: string[];
    providers: ProviderInfo[];
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

function parsePaginationParam(raw: string | null, fallback: number, max: number): number {
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    const normalized = Math.floor(parsed);
    if (normalized <= 0) return fallback;
    if (normalized > max) return max;
    return normalized;
}

function parseOffsetParam(raw: string | null): number {
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
}

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

type CatalogueFilters = {
    endpoints?: string[];
    organisationIds?: string[];
    inputTypes?: string[];
    outputTypes?: string[];
    params?: string[];
};

function normalizeStringSet(values?: string[]): string[] | undefined {
    if (!values || !values.length) return undefined;
    const normalized = Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
    return normalized.length ? normalized : undefined;
}

async function fetchCatalogue(filter: CatalogueFilters): Promise<CatalogueModel[]> {
    const supabase = getSupabaseAdmin();
    const modelQuery = supabase
        .from("data_models")
        .select(
            "model_id, name, release_date, status, input_types, output_types, organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name, country_code, colour)"
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
            status: string | null;
            organisation: OrganisationDetails | null;
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
            status: model.status ?? null,
            organisation: organisation
                ? {
                    organisation_id: organisation.organisation_id ?? null,
                    name: organisation.name ?? null,
                    country_code: organisation.country_code ?? null,
                    colour: organisation.colour ?? null,
                }
                : null,
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
    const { data: capabilityRows, error: capabilityError } = await supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id, capability_id, params, effective_from, effective_to")
        .eq("status", "active")
        .in("provider_api_model_id", providerModelIds);
    if (capabilityError) {
        throw new Error(capabilityError.message || "Failed to load provider capabilities");
    }

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
    for (const cap of capabilityRows ?? []) {
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

    const endpointsFilter = normalizeStringSet(filter.endpoints)?.map((value) => value as Endpoint);
    const organisationIds = normalizeStringSet(filter.organisationIds);
    const inputTypesFilter = normalizeStringSet(filter.inputTypes)?.map((value) => value.toLowerCase());
    const outputTypesFilter = normalizeStringSet(filter.outputTypes)?.map((value) => value.toLowerCase());
    const paramsFilter = normalizeStringSet(filter.params);

    const models: CatalogueModel[] = [];
    for (const [modelId, info] of baseModels) {
        if (organisationIds?.length) {
            const organisationId = info.organisation?.organisation_id ?? null;
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

        const model: CatalogueModel = {
            model_id: info.model_id,
            name: info.name,
            release_date: info.release_date,
            status: info.status ?? null,
            organisation_id: info.organisation?.organisation_id ?? null,
            organisation_name: info.organisation?.name ?? null,
            organisation_colour: info.organisation?.colour ?? null,
            aliases,
            endpoints,
            input_types: [...info.input_types],
            output_types: [...info.output_types],
            providers: providerInfos,
        };

        models.push(model);
    }

    return models.sort(compareModels);
}

function parseMultiValue(params: URLSearchParams, name: string): string[] {
    const values = params.getAll(name);
    if (!values.length) return [];
    return values.flatMap((value) => toStringArray(value));
}

async function handleModels(req: Request) {
    const auth = await guardAuth(req);
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }

    const url = new URL(req.url);
    const endpoints = parseMultiValue(url.searchParams, "endpoints");
    const organisationIds = parseMultiValue(url.searchParams, "organisation");
    const inputTypes = parseMultiValue(url.searchParams, "input_types");
    const outputTypes = parseMultiValue(url.searchParams, "output_types");
    const params = parseMultiValue(url.searchParams, "params");
    const limit = parsePaginationParam(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
    const offset = parseOffsetParam(url.searchParams.get("offset"));
    try {
        const models = await fetchCatalogue({
            endpoints,
            organisationIds,
            inputTypes,
            outputTypes,
            params,
        });
        const paged = models.slice(offset, offset + limit);
        const cacheOptions = {
            scope: `models:${auth.value.teamId}`,
            ttlSeconds: 300,
            staleSeconds: 600,
        };
        const response = json(
            { ok: true, limit, offset, total: models.length, models: paged },
            200,
            cacheHeaders(cacheOptions)
        );
        return cacheResponse(req, response, cacheOptions);
    } catch (error: any) {
        return json(
            { ok: false, error: "failed", message: String(error?.message ?? error) },
            500,
            { "Cache-Control": "no-store" }
        );
    }
}

export const modelsRoutes = new Hono<Env>();

modelsRoutes.get("/", withRuntime(handleModels));

