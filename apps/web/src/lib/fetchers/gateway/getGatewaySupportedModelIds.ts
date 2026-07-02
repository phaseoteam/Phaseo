import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import type { ProviderOfferScope } from "@/lib/providers/providerOffers";
import { createAdminClient } from "@/utils/supabase/admin";

type ActiveGatewayModelRow = {
    api_model_id: string | null;
    api_provider_id: string | null;
    capability_ids?: string[] | null;
    is_active_gateway?: boolean | null;
    effective_from?: string | null;
    effective_to?: string | null;
    provider?: {
        api_provider_id: string;
        api_provider_name?: string | null;
        provider_family_id?: string | null;
        offer_label?: string | null;
        offer_scope?: ProviderOfferScope | null;
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

type GatewayProviderModelRow = {
    provider_api_model_id: string | null;
    provider_id: string | null;
    api_model_id: string | null;
    model_id: string | null;
    is_active_gateway: boolean | null;
    effective_from: string | null;
    effective_to: string | null;
};

type GatewayModelMetadata = NonNullable<ActiveGatewayModelRow["model"]> & {
    hidden?: boolean | null;
};

type GatewaySupportedModelOptions = {
    availableOnly?: boolean;
};

const CAPABILITY_QUERY_CHUNK_SIZE = 200;
const PROVIDER_MODEL_QUERY_PAGE_SIZE = 1000;
const METADATA_QUERY_CHUNK_SIZE = 200;

export type GatewaySupportedModel = {
    modelId: string;
    internalModelId: string | null;
    selectorModelId: string;
    providerId: string;
    capabilities: string[];
    effectiveFrom: string | null;
    effectiveTo: string | null;
    providerName: string | null;
    providerFamilyId: string | null;
    providerOfferLabel: string | null;
    providerOfferScope: ProviderOfferScope | null;
    providerPromptTrainingPolicy: string | null;
    modelName: string | null;
    modelStatus: string | null;
    organisationId: string | null;
    organisationName: string | null;
    previousModelId: string | null;
    releaseDate: string | null;
    announcementDate: string | null;
    isAvailable: boolean;
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

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

async function fetchGatewayProviderModels(
    client: SupabaseClient,
    options: GatewaySupportedModelOptions = {}
): Promise<GatewayProviderModelRow[]> {
    const rows: GatewayProviderModelRow[] = [];

    for (let offset = 0; ; offset += PROVIDER_MODEL_QUERY_PAGE_SIZE) {
        let query = client
            .from("data_api_provider_models")
            .select(
                "provider_api_model_id, provider_id, api_model_id, model_id, is_active_gateway, effective_from, effective_to"
            )
            .order("provider_api_model_id", { ascending: true });

        if (options.availableOnly) {
            query = query.eq("is_active_gateway", true);
        }

        const { data, error } = await query.range(
            offset,
            offset + PROVIDER_MODEL_QUERY_PAGE_SIZE - 1
        );

        if (error) {
            throw new Error(error.message ?? "Failed to load supported models");
        }

        const page = (data ?? []) as GatewayProviderModelRow[];
        rows.push(...page);
        if (page.length < PROVIDER_MODEL_QUERY_PAGE_SIZE) break;
    }

    return rows;
}

async function fetchActiveGatewayModels(
    client: SupabaseClient,
    includeHidden: boolean,
    options: GatewaySupportedModelOptions = {},
    _now = new Date()
): Promise<ActiveGatewayModelRow[]> {
    const providerModels = await fetchGatewayProviderModels(client, options);

    const providerModelIds = providerModels
        .map((row) => row.provider_api_model_id)
        .filter(isNonEmptyString);

    let capabilitySet: Set<string> | null = null;
    const capabilityMap = new Map<string, Set<string>>();
    if (providerModelIds.length > 0) {
        const capabilityChunks = chunkValues(providerModelIds, CAPABILITY_QUERY_CHUNK_SIZE);
        for (const providerModelIdChunk of capabilityChunks) {
            const { data: capabilities, error: capabilitiesError } = await client
                .from("data_api_provider_model_capabilities")
                .select("provider_api_model_id, capability_id, status")
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
                    !row.provider_api_model_id ||
                    !row.capability_id
                ) {
                    continue;
                }
                const set = capabilityMap.get(row.provider_api_model_id) ?? new Set<string>();
                set.add(row.capability_id);
                capabilityMap.set(row.provider_api_model_id, set);
            }
        }

        if (capabilityMap.size > 0) {
            capabilitySet = new Set(capabilityMap.keys());
        }
    }

    const providerIds = Array.from(
        new Set(providerModels.map((row) => row.provider_id).filter(isNonEmptyString))
    );
    const modelIds = Array.from(
        new Set(providerModels.map((row) => row.model_id).filter(isNonEmptyString))
    );

    const providerMap = new Map<string, ActiveGatewayModelRow["provider"]>();
    for (const providerIdChunk of chunkValues(providerIds, METADATA_QUERY_CHUNK_SIZE)) {
        const { data: providers, error: providersError } = await client
            .from("data_api_providers")
            .select("api_provider_id, api_provider_name, provider_family_id, offer_label, offer_scope, prompt_training_policy")
            .in("api_provider_id", providerIdChunk);

        if (providersError) {
            throw new Error(
                providersError.message ?? "Failed to load gateway providers"
            );
        }

        for (const provider of providers ?? []) {
            if (!provider.api_provider_id) continue;
            providerMap.set(provider.api_provider_id, provider);
        }
    }

    const modelMap = new Map<string, GatewayModelMetadata>();
    for (const modelIdChunk of chunkValues(modelIds, METADATA_QUERY_CHUNK_SIZE)) {
        const { data: models, error: modelsError } = await client
            .from("data_models")
            .select(
                "model_id, name, status, organisation_id, previous_model_id, release_date, announcement_date, hidden, organisation:data_organisations!data_models_organisation_id_fkey(name)"
            )
            .in("model_id", modelIdChunk);

        if (modelsError) {
            throw new Error(modelsError.message ?? "Failed to load gateway models");
        }

        for (const model of models ?? []) {
            if (!model.model_id) continue;
            if (!includeHidden && model.hidden) continue;
            const organisation = Array.isArray(model.organisation)
                ? model.organisation[0] ?? null
                : model.organisation ?? null;
            modelMap.set(model.model_id, { ...model, organisation });
        }
    }

    const rows: ActiveGatewayModelRow[] = [];
    for (const row of providerModels) {
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
        providerModelCount: providerModels.length,
        capabilityRowsCount: capabilityMap.size,
        returnedRowCount: rows.length,
        hailuoRows,
    });

    return rows;
}

export async function getGatewaySupportedModels(
    includeHidden: boolean,
    options: GatewaySupportedModelOptions = {}
): Promise<GatewaySupportedModel[]> {
    "use cache";

    cacheLife("days");
    cacheTag("gateway-supported-models");

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
        rows = await fetchActiveGatewayModels(
            client,
            includeHidden,
            options,
            new Date()
        );
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
        if (options.availableOnly && !isAvailable) continue;
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
            effectiveFrom: row.effective_from ?? null,
            effectiveTo: row.effective_to ?? null,
            providerName: row.provider?.api_provider_name ?? null,
            providerFamilyId: row.provider?.provider_family_id ?? null,
            providerOfferLabel: row.provider?.offer_label ?? null,
            providerOfferScope: row.provider?.offer_scope ?? null,
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
        modelCount: models.length,
        hailuoCount: hailuoModels.length,
        hailuoModels,
    });

    return models;
}
