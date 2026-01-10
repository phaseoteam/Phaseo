import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";

type ActiveGatewayModelRow = {
    api_model_id: string | null;
    api_provider_id: string | null;
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
    _now = new Date()
): Promise<ActiveGatewayModelRow[]> {
    const { data, error } = await client
        .from("data_api_provider_models")
        .select(`
            api_model_id,
            api_provider_id,
            is_active_gateway,
            effective_from,
            effective_to,
            provider:data_api_providers!data_api_provider_models_api_provider_id_fkey(
                api_provider_id,
                api_provider_name
            ),
            model:data_models!data_api_provider_models_internal_model_id_fkey(
                model_id,
                name,
                status,
                organisation_id,
                release_date,
                announcement_date,
                organisation:data_organisations!data_models_organisation_id_fkey(
                    name
                )
            )
        `);

    if (error) {
        throw new Error(error.message ?? "Failed to load supported models");
    }

    const rows = (data ?? []) as ActiveGatewayModelRowRaw[];
    return rows.map((row) => {
        const provider = Array.isArray(row.provider)
            ? row.provider[0] ?? null
            : row.provider ?? null;
        const model = Array.isArray(row.model)
            ? row.model[0] ?? null
            : row.model ?? null;
        const organisation = Array.isArray(model?.organisation)
            ? model.organisation[0] ?? null
            : model?.organisation ?? null;

        return {
            api_model_id: row.api_model_id ?? null,
            api_provider_id: row.api_provider_id ?? null,
            is_active_gateway: row.is_active_gateway ?? null,
            effective_from: row.effective_from ?? null,
            effective_to: row.effective_to ?? null,
            provider,
            model: model ? { ...model, organisation } : null,
        };
    });
}

export async function getGatewaySupportedModels(): Promise<GatewaySupportedModel[]> {
    "use cache";

    cacheLife("days");
    cacheTag("gateway-supported-models");

    const client = await createClient();
    const rows = await fetchActiveGatewayModels(client, new Date());
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
