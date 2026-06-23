import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import {
	GATEWAY_MODEL_LIST_TAGS,
	PUBLIC_MODEL_CATALOGUE_CACHE_LIFE,
} from "@/lib/cache/publicModelCatalogueTags";
import type { ModelPageNotice } from "@/lib/fetchers/models/getModelPageNotice";
import { createAdminClient } from "@/utils/supabase/admin";

type ActiveGatewayModelRow = {
    api_model_id: string | null;
    api_provider_id: string | null;
    capability_ids?: string[] | null;
    input_modalities?: string[] | null;
    output_modalities?: string[] | null;
    supported_reasoning_efforts?: SupportedReasoningEffort[] | null;
    is_active_gateway?: boolean | null;
    effective_from?: string | null;
    effective_to?: string | null;
    provider?: {
        api_provider_id: string;
        api_provider_name?: string | null;
        prompt_training_policy?: string | null;
    } | null;
    model?: {
        model_id: string;
        name?: string | null;
        status?: string | null;
        organisation_id?: string | null;
        previous_model_id?: string | null;
        release_date?: string | null;
        announcement_date?: string | null;
        organisation?: {
            name?: string | null;
        } | null;
    } | null;
};

type ActiveGatewayModelRowRaw = Omit<ActiveGatewayModelRow, "provider" | "model"> & {
    provider?: ActiveGatewayModelRow["provider"] | ActiveGatewayModelRow["provider"][];
    model?: (Omit<NonNullable<ActiveGatewayModelRow["model"]>, "organisation"> & {
        organisation?: NonNullable<ActiveGatewayModelRow["model"]>["organisation"] | NonNullable<ActiveGatewayModelRow["model"]>["organisation"][];
    })[] | (Omit<NonNullable<ActiveGatewayModelRow["model"]>, "organisation"> & {
        organisation?: NonNullable<ActiveGatewayModelRow["model"]>["organisation"] | NonNullable<ActiveGatewayModelRow["model"]>["organisation"][];
    }) | null;
};

const CAPABILITY_QUERY_CHUNK_SIZE = 200;

export type SupportedReasoningEffort =
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";

const ALL_REASONING_EFFORTS: SupportedReasoningEffort[] = [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
];

const BOOLEAN_REASONING_EFFORTS: SupportedReasoningEffort[] = [
    "none",
    "medium",
];

function normalizeCapabilityStatus(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function isInternalTestingCapability(value: unknown): boolean {
    return normalizeCapabilityStatus(value) === "internal_testing";
}

function normalizeModalities(value: unknown): string[] {
    const values = Array.isArray(value)
        ? value
        : typeof value === "string"
            ? value.split(/[,|]/)
            : [];
    return Array.from(
        new Set(
            values
                .map((item) =>
                    String(item ?? "")
                        .trim()
                        .toLowerCase()
                        .replace(/[\s.-]+/g, "_"),
                )
                .filter(Boolean),
        ),
    );
}

type CapabilityParam = {
    param_id?: string | null;
    values?: unknown;
    enum?: unknown;
    options?: unknown;
    supported_values?: unknown;
};

export type GatewaySupportedModel = {
    modelId: string;
    internalModelId: string | null;
    selectorModelId: string;
    providerId: string;
    capabilities: string[];
    inputModalities: string[];
    outputModalities: string[];
    effectiveFrom: string | null;
    effectiveTo: string | null;
    providerName: string | null;
    providerPromptTrainingPolicy: string | null;
    modelName: string | null;
    modelStatus: string | null;
    organisationId: string | null;
    organisationName: string | null;
    previousModelId: string | null;
    releaseDate: string | null;
    announcementDate: string | null;
    modelPageNotice?: ModelPageNotice | null;
    isAvailable: boolean;
    supportedReasoningEfforts: SupportedReasoningEffort[];
};

const GATEWAY_MODEL_DEBUG_ENABLED =
    process.env.NODE_ENV !== "production" ||
    process.env.DEBUG_GATEWAY_SUPPORTED_MODELS === "1";

function getCanonicalGatewaySelectorModelId(row: {
    api_model_id: string | null;
    model?: { model_id?: string | null } | null;
}): string | null {
    const apiModelId = row.api_model_id?.trim() ?? null;
    if (!apiModelId) return null;
    const internalModelId = row.model?.model_id?.trim() ?? null;
    const baseModelId = internalModelId || apiModelId;
    if (apiModelId.endsWith(":free") && !baseModelId.endsWith(":free")) {
        return `${baseModelId}:free`;
    }
    return baseModelId;
}

function isHailuoModelId(modelId: string | null | undefined): boolean {
    return String(modelId ?? "").trim().toLowerCase().startsWith("minimax/hailuo");
}

function logGatewayModelDebug(stage: string, payload: Record<string, unknown>): void {
    if (!GATEWAY_MODEL_DEBUG_ENABLED) return;
    console.log(`[gateway-supported-models] ${stage}`, payload);
}

function chunkValues<T>(values: T[], size: number): T[][] {
    if (size <= 0) return [values];
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

function normalizeReasoningEffort(
    value: unknown
): SupportedReasoningEffort | null {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (
        normalized === "extra_high" ||
        normalized === "extra-high"
    ) {
        return "xhigh";
    }
    return ALL_REASONING_EFFORTS.includes(
        normalized as SupportedReasoningEffort
    )
        ? (normalized as SupportedReasoningEffort)
        : null;
}

function readEffortsFromValue(value: unknown): SupportedReasoningEffort[] {
    const sourceValues = Array.isArray(value)
        ? value
        : value && typeof value === "object"
            ? Object.values(value as Record<string, unknown>)
            : [];
    return sourceValues
        .map(normalizeReasoningEffort)
        .filter((effort): effort is SupportedReasoningEffort => Boolean(effort));
}

function getCapabilityParams(params: unknown): CapabilityParam[] {
    if (Array.isArray(params)) {
        return params.filter(
            (param): param is CapabilityParam =>
                Boolean(param) && typeof param === "object",
        );
    }
    if (!params || typeof params !== "object") return [];
    return Object.entries(params as Record<string, unknown>).map(
        ([paramId, value]) => {
            if (value && typeof value === "object" && !Array.isArray(value)) {
                return {
                    ...(value as Record<string, unknown>),
                    param_id:
                        typeof (value as CapabilityParam).param_id === "string"
                            ? (value as CapabilityParam).param_id
                            : paramId,
                } satisfies CapabilityParam;
            }
            return { param_id: paramId, values: value };
        },
    );
}

function deriveSupportedReasoningEfforts(
    params: unknown
): SupportedReasoningEffort[] {
    const efforts = new Set<SupportedReasoningEffort>();
    let hasReasoningParam = false;
    let hasBooleanReasoningParam = false;

    for (const param of getCapabilityParams(params)) {
        const paramId = String(param.param_id ?? "").trim().toLowerCase();
        if (!paramId || paramId === "include_reasoning") continue;
        const isReasoningParam =
            paramId === "reasoning" || paramId === "reasoning_effort";
        const isBooleanReasoningParam =
            paramId === "reasoning.enabled" || paramId === "reasoning_enabled";
        if (!isReasoningParam && !isBooleanReasoningParam) continue;

        hasReasoningParam = hasReasoningParam || isReasoningParam;
        hasBooleanReasoningParam =
            hasBooleanReasoningParam || isBooleanReasoningParam;

        for (const source of [
            param.values,
            param.enum,
            param.options,
            param.supported_values,
        ]) {
            for (const effort of readEffortsFromValue(source)) {
                efforts.add(effort);
            }
        }
    }

    if (efforts.size > 0) {
        return ALL_REASONING_EFFORTS.filter((effort) => efforts.has(effort));
    }
    if (hasReasoningParam) return ALL_REASONING_EFFORTS;
    if (hasBooleanReasoningParam) return BOOLEAN_REASONING_EFFORTS;
    return [];
}

async function fetchActiveGatewayModels(
    client: SupabaseClient,
    includeHidden: boolean,
    includeInternal = false,
    _now = new Date()
): Promise<ActiveGatewayModelRow[]> {
    const { data: providerModels, error } = await client
        .from("data_api_provider_models")
        .select(
            "provider_api_model_id, provider_id, api_model_id, model_id, input_modalities, output_modalities, is_active_gateway, effective_from, effective_to"
        );

    if (error) {
        throw new Error(error.message ?? "Failed to load supported models");
    }

    const providerModelIds = (providerModels ?? [])
        .map((row) => row.provider_api_model_id)
        .filter((id): id is string => Boolean(id));

    let capabilitySet: Set<string> | null = null;
    const capabilityMap = new Map<string, Set<string>>();
    const supportedReasoningEffortsMap = new Map<
        string,
        Set<SupportedReasoningEffort>
    >();
    if (providerModelIds.length > 0) {
        const capabilityChunks = chunkValues(providerModelIds, CAPABILITY_QUERY_CHUNK_SIZE);
        for (const providerModelIdChunk of capabilityChunks) {
            const { data: capabilities, error: capabilitiesError } = await client
                .from("data_api_provider_model_capabilities")
                .select("provider_api_model_id, capability_id, params, status")
                .in("provider_api_model_id", providerModelIdChunk);

            if (capabilitiesError) {
                logGatewayModelDebug("capabilities_query_error", {
                    message: capabilitiesError.message,
                    details: capabilitiesError.details ?? null,
                    hint: capabilitiesError.hint ?? null,
                    code: capabilitiesError.code ?? null,
                    providerModelCount: providerModelIds.length,
                    chunkSize: providerModelIdChunk.length,
                });
                continue;
            }

            for (const row of capabilities ?? []) {
                if (
                    row.status === "disabled" ||
                    (!includeInternal && isInternalTestingCapability(row.status)) ||
                    !row.provider_api_model_id ||
                    !row.capability_id
                ) {
                    continue;
                }
                const set = capabilityMap.get(row.provider_api_model_id) ?? new Set<string>();
                set.add(row.capability_id);
                capabilityMap.set(row.provider_api_model_id, set);
                const reasoningEfforts = deriveSupportedReasoningEfforts(
                    (row as { params?: unknown }).params,
                );
                if (reasoningEfforts.length > 0) {
                    const effortSet =
                        supportedReasoningEffortsMap.get(row.provider_api_model_id) ??
                        new Set<SupportedReasoningEffort>();
                    for (const effort of reasoningEfforts) {
                        effortSet.add(effort);
                    }
                    supportedReasoningEffortsMap.set(
                        row.provider_api_model_id,
                        effortSet,
                    );
                }
            }
        }

        if (capabilityMap.size > 0) {
            capabilitySet = new Set(capabilityMap.keys());
        }
    }

    const providerIds = Array.from(
        new Set((providerModels ?? []).map((row) => row.provider_id).filter(Boolean))
    );
    const modelIds = Array.from(
        new Set((providerModels ?? []).map((row) => row.model_id).filter(Boolean))
    );

    const { data: providers } = await client
        .from("data_api_providers")
        .select("api_provider_id, api_provider_name, prompt_training_policy")
        .in("api_provider_id", providerIds);
    const { data: models } = await client
        .from("data_models")
        .select(
            "model_id, name, status, organisation_id, previous_model_id, release_date, announcement_date, hidden, organisation:data_organisations!data_models_organisation_id_fkey(name)"
        )
        .in("model_id", modelIds);

    const providerMap = new Map<string, ActiveGatewayModelRow["provider"]>();
    for (const provider of providers ?? []) {
        if (!provider.api_provider_id) continue;
        providerMap.set(provider.api_provider_id, provider);
    }

    const modelMap = new Map<string, NonNullable<ActiveGatewayModelRow["model"]>>();
    for (const model of models ?? []) {
        if (!model.model_id) continue;
        if (!includeHidden && model.hidden) continue;
        const organisation = Array.isArray(model.organisation)
            ? model.organisation[0] ?? null
            : model.organisation ?? null;
        modelMap.set(model.model_id, { ...model, organisation });
    }

    const rows: ActiveGatewayModelRow[] = [];
    for (const row of providerModels ?? []) {
        if (
            !row.provider_api_model_id ||
            (capabilitySet && !capabilitySet.has(row.provider_api_model_id))
        ) {
            continue;
        }
        rows.push({
            api_model_id: row.api_model_id ?? null,
            api_provider_id: row.provider_id ?? null,
            capability_ids: Array.from(
                capabilityMap.get(row.provider_api_model_id) ?? []
            ),
            input_modalities: normalizeModalities(
                (row as { input_modalities?: unknown }).input_modalities,
            ),
            output_modalities: normalizeModalities(
                (row as { output_modalities?: unknown }).output_modalities,
            ),
            supported_reasoning_efforts: Array.from(
                supportedReasoningEffortsMap.get(row.provider_api_model_id) ?? []
            ),
            is_active_gateway: row.is_active_gateway ?? null,
            effective_from: row.effective_from ?? null,
            effective_to: row.effective_to ?? null,
            provider: row.provider_id ? providerMap.get(row.provider_id) ?? null : null,
            model: row.model_id ? modelMap.get(row.model_id) ?? null : null,
        });
    }

    const hailuoRows = rows
        .filter((row) => isHailuoModelId(row.api_model_id))
        .map((row) => ({
            apiModelId: row.api_model_id,
            providerId: row.api_provider_id,
            capabilities: row.capability_ids ?? [],
            isActiveGateway: row.is_active_gateway ?? null,
            effectiveFrom: row.effective_from ?? null,
            effectiveTo: row.effective_to ?? null,
            canonicalModelId: row.model?.model_id ?? null,
            modelName: row.model?.name ?? null,
            modelStatus: row.model?.status ?? null,
            hidden: (row.model as { hidden?: boolean | null } | null)?.hidden ?? null,
        }));
    logGatewayModelDebug("fetchActiveGatewayModels", {
        includeHidden,
        providerModelCount: providerModels?.length ?? 0,
        capabilityRowsCount: capabilityMap.size,
        returnedRowCount: rows.length,
        hailuoRows,
    });

    return rows;
}

export async function getGatewaySupportedModels(
    includeHidden: boolean,
    includeInternal = false
): Promise<GatewaySupportedModel[]> {
    "use cache";

    cacheLife(PUBLIC_MODEL_CATALOGUE_CACHE_LIFE);
    for (const tag of GATEWAY_MODEL_LIST_TAGS) {
        cacheTag(tag);
    }

    let client: ReturnType<typeof createAdminClient> | null = null;
    try {
        client = createAdminClient();
    } catch (error) {
        console.warn(
            "[getGatewaySupportedModels] admin client unavailable; returning no models.",
            error instanceof Error ? error.message : String(error),
        );
        return [];
    }

    let rows: ActiveGatewayModelRow[] = [];
    try {
        rows = await fetchActiveGatewayModels(client, includeHidden, includeInternal, new Date());
    } catch (error) {
        console.warn(
            "[getGatewaySupportedModels] failed to fetch supported models; returning empty list.",
            error instanceof Error ? error.message : String(error),
        );
        return [];
    }
    const seen = new Set<string>();
    const models: GatewaySupportedModel[] = [];
    const nowIso = new Date().toISOString();

    for (const row of rows) {
        if (!row.api_model_id || !row.api_provider_id) continue;
        const status = row.model?.status ?? null;
        const statusUnavailable =
            status &&
            ["deprecated", "retired"].includes(status);
        const effectiveFromOk =
            !row.effective_from || row.effective_from <= nowIso;
        const effectiveToOk =
            !row.effective_to || row.effective_to > nowIso;
        const isAvailable =
            Boolean(row.is_active_gateway) &&
            effectiveFromOk &&
            effectiveToOk &&
            !statusUnavailable;
        const key = `${row.api_provider_id}:${row.api_model_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        models.push({
            modelId: row.api_model_id,
            internalModelId: row.model?.model_id ?? null,
            selectorModelId:
                getCanonicalGatewaySelectorModelId(row) ?? row.api_model_id,
            providerId: row.api_provider_id,
            capabilities: Array.from(new Set(row.capability_ids ?? [])),
            inputModalities: Array.from(new Set(row.input_modalities ?? [])),
            outputModalities: Array.from(new Set(row.output_modalities ?? [])),
            supportedReasoningEfforts: ALL_REASONING_EFFORTS.filter((effort) =>
                (row.supported_reasoning_efforts ?? []).includes(effort),
            ),
            effectiveFrom: row.effective_from ?? null,
            effectiveTo: row.effective_to ?? null,
            providerName: row.provider?.api_provider_name ?? null,
            providerPromptTrainingPolicy: row.provider?.prompt_training_policy ?? null,
            modelName: row.model?.name ?? null,
            modelStatus: status,
            organisationId: row.model?.organisation_id ?? null,
            organisationName: row.model?.organisation?.name ?? null,
            previousModelId: row.model?.previous_model_id ?? null,
            releaseDate: row.model?.release_date ?? null,
            announcementDate: row.model?.announcement_date ?? null,
            isAvailable,
        });
    }

    models.sort((a, b) => {
        if (a.providerId === b.providerId) {
            return a.modelId.localeCompare(b.modelId);
        }
        return a.providerId.localeCompare(b.providerId);
    });

    const hailuoModels = models
        .filter((model) => isHailuoModelId(model.modelId))
        .map((model) => ({
            modelId: model.modelId,
            providerId: model.providerId,
            capabilities: model.capabilities,
            effectiveFrom: model.effectiveFrom,
            effectiveTo: model.effectiveTo,
            modelStatus: model.modelStatus,
            isAvailable: model.isAvailable,
        }));
    logGatewayModelDebug("getGatewaySupportedModels", {
        includeHidden,
        includeInternal,
        modelCount: models.length,
        hailuoCount: hailuoModels.length,
        hailuoModels,
    });

    return models;
}
