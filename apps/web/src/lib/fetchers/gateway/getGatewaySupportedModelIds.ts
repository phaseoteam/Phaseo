import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
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
    } | null;
    model?: {
        model_id: string;
        name?: string | null;
        status?: string | null;
        organisation_id?: string | null;
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

export type GatewaySupportedModel = {
    modelId: string;
    providerId: string;
    capabilities: string[];
    effectiveFrom: string | null;
    effectiveTo: string | null;
    providerName: string | null;
    modelName: string | null;
    modelStatus: string | null;
    organisationId: string | null;
    organisationName: string | null;
    releaseDate: string | null;
    announcementDate: string | null;
    isAvailable: boolean;
};

async function fetchActiveGatewayModels(
    client: SupabaseClient,
    includeHidden: boolean,
    _now = new Date()
): Promise<ActiveGatewayModelRow[]> {
    const { data: providerModels, error } = await client
        .from("data_api_provider_models")
        .select(
            "provider_api_model_id, provider_id, api_model_id, internal_model_id, is_active_gateway, effective_from, effective_to"
        );

    if (error) {
        throw new Error(error.message ?? "Failed to load supported models");
    }

    const providerModelIds = (providerModels ?? [])
        .map((row) => row.provider_api_model_id)
        .filter((id): id is string => Boolean(id));

    let capabilitySet: Set<string> | null = null;
    const capabilityMap = new Map<string, Set<string>>();
    if (providerModelIds.length > 0) {
        const { data: capabilities, error: capabilitiesError } = await client
            .from("data_api_provider_model_capabilities")
            .select("provider_api_model_id, capability_id, status")
            .in("provider_api_model_id", providerModelIds);

        if (!capabilitiesError && (capabilities ?? []).length > 0) {
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
            capabilitySet = new Set(capabilityMap.keys());
        }
    }

    const providerIds = Array.from(
        new Set((providerModels ?? []).map((row) => row.provider_id).filter(Boolean))
    );
    const modelIds = Array.from(
        new Set((providerModels ?? []).map((row) => row.internal_model_id).filter(Boolean))
    );

    const { data: providers } = await client
        .from("data_api_providers")
        .select("api_provider_id, api_provider_name")
        .in("api_provider_id", providerIds);
    const { data: models } = await client
        .from("data_models")
        .select(
            "model_id, name, status, organisation_id, release_date, announcement_date, hidden, organisation:data_organisations!data_models_organisation_id_fkey(name)"
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
            is_active_gateway: row.is_active_gateway ?? null,
            effective_from: row.effective_from ?? null,
            effective_to: row.effective_to ?? null,
            provider: row.provider_id ? providerMap.get(row.provider_id) ?? null : null,
            model: row.internal_model_id ? modelMap.get(row.internal_model_id) ?? null : null,
        });
    }

    return rows;
}

export async function getGatewaySupportedModels(
    includeHidden: boolean
): Promise<GatewaySupportedModel[]> {
    "use cache";

    cacheLife("days");
    cacheTag("gateway-supported-models");

    const client = createAdminClient();
    const rows = await fetchActiveGatewayModels(client, includeHidden, new Date());
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
            providerId: row.api_provider_id,
            capabilities: Array.from(new Set(row.capability_ids ?? [])),
            effectiveFrom: row.effective_from ?? null,
            effectiveTo: row.effective_to ?? null,
            providerName: row.provider?.api_provider_name ?? null,
            modelName: row.model?.name ?? null,
            modelStatus: status,
            organisationId: row.model?.organisation_id ?? null,
            organisationName: row.model?.organisation?.name ?? null,
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

    return models;
}
