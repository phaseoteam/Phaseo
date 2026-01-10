import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import type { Endpoint } from "@core/types";
import { guardAuth, type GuardErr } from "@pipeline/before/guards";
import { json, withRuntime } from "@/routes/utils";

type ProviderModelRow = {
    model_id: string | null;
    api_provider_id: string | null;
    provider_model_slug?: string | null;
    endpoint: string | null;
    is_active_gateway: boolean | null;
    input_modalities?: unknown;
    output_modalities?: unknown;
    effective_from?: string | null;
    effective_to?: string | null;
    params?: unknown;
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

function withinEffectiveWindow(row: ProviderModelRow, now: Date): boolean {
    if (!row.is_active_gateway) return false;
    const from = row.effective_from ? new Date(row.effective_from) : null;
    const to = row.effective_to ? new Date(row.effective_to) : null;
    if (from && Number.isFinite(from.getTime()) && now < from) return false;
    if (to && Number.isFinite(to.getTime()) && now >= to) return false;
    return true;
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
    const { data: modelRows, error: modelError } = await supabase
        .from("data_models")
        .select(
            "model_id, name, release_date, status, input_types, output_types, organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name, country_code)"
        );
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

    const aliasMap = new Map<string, string[]>();
    const { data: aliases, error: aliasError } = await supabase
        .from("data_aliases")
        .select("alias_slug, resolved_model_id")
        .eq("is_enabled", true)
        .in("resolved_model_id", modelIds);
    if (aliasError) {
        throw new Error(aliasError.message || "Failed to load model aliases");
    }
    for (const alias of aliases ?? []) {
        const resolved = alias?.resolved_model_id;
        if (!resolved || !alias?.alias_slug) continue;
        const existing = aliasMap.get(resolved) ?? [];
        existing.push(alias.alias_slug);
        aliasMap.set(resolved, existing);
    }
    for (const [key, list] of aliasMap) {
        aliasMap.set(
            key,
            list.slice().sort((a, b) => a.localeCompare(b))
        );
    }

    let providerQuery = supabase
        .from("data_api_provider_models")
        .select(
            "model_id, api_provider_id, provider_model_slug, endpoint, is_active_gateway, input_modalities, output_modalities, effective_from, effective_to, params"
        )
        .in("model_id", modelIds);

    const { data: providerRows, error: providerError } = await providerQuery;
    if (providerError) {
        throw new Error(providerError.message || "Failed to load provider models");
    }

    const now = new Date();
    const providersByModel = new Map<string, ProviderModelRow[]>();
    const providerIdSet = new Set<string>();
    for (const row of providerRows ?? []) {
        if (!row?.model_id || !row?.api_provider_id || !row?.endpoint) continue;
        providerIdSet.add(row.api_provider_id);
        if (!withinEffectiveWindow(row as ProviderModelRow, now)) continue;
        const existing = providersByModel.get(row.model_id) ?? [];
        existing.push(row as ProviderModelRow);
        providersByModel.set(row.model_id, existing);
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
        const providerEntries: CatalogueProvider[] = providers.map((row) => {
            const providerDetails = providerMap.get(row.api_provider_id!);
            return {
                api_provider_id: row.api_provider_id!,
                api_provider_name: providerDetails?.api_provider_name ?? null,
                link: providerDetails?.link ?? null,
                country_code: providerDetails?.country_code ?? null,
                endpoint: String(row.endpoint) as Endpoint,
                provider_model_slug: row.provider_model_slug ?? null,
                is_active_gateway: true,
                input_modalities: toStringArray(row.input_modalities),
                output_modalities: toStringArray(row.output_modalities),
                effective_from: row.effective_from ?? null,
                effective_to: row.effective_to ?? null,
                params: toStringArray(row.params),
            };
        });

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
        return json(
            { ok: true, limit, offset, total: models.length, models: paged },
            200,
            { "Cache-Control": "no-store" }
        );
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
