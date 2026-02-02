import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";

export interface GatewayProviderDetails {
    api_provider_id: string;
    api_provider_name: string;
    link?: string | null;
    country_code?: string | null;
}

export interface GatewayProviderModel {
    id: string;
    api_provider_id: string;
    provider_model_slug?: string | null;
    model_id: string;
    endpoint: string;
    is_active_gateway: boolean;
    input_modalities: string;
    output_modalities: string;
    effective_from?: string | null;
    effective_to?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    provider?: GatewayProviderDetails | null;
}

export interface ModelGatewayMetadata {
    modelId: string;
    aliases: string[];
    providers: GatewayProviderModel[];
    activeProviders: GatewayProviderModel[];
    inactiveProviders: GatewayProviderModel[];
}

function isWithinEffectiveWindow(
    effectiveFrom?: string | null,
    effectiveTo?: string | null,
    now: Date = new Date()
): boolean {
    const from = effectiveFrom ? new Date(effectiveFrom) : null;
    const to = effectiveTo ? new Date(effectiveTo) : null;

    if (from && Number.isFinite(from.getTime()) && now < from) {
        return false;
    }

    if (to && Number.isFinite(to.getTime()) && now >= to) {
        return false;
    }

    return true;
}

export default async function getModelGatewayMetadata(
    modelId: string,
    includeHidden: boolean
): Promise<ModelGatewayMetadata> {
    const supabase = await createClient();

    const { data: modelRow, error: modelError } = await supabase
        .from("data_models")
        .select("hidden")
        .eq("model_id", modelId)
        .maybeSingle();

    if (modelError) {
        throw new Error(modelError.message ?? "Failed to load model metadata");
    }
    if (!modelRow || (!includeHidden && modelRow.hidden)) {
        throw new Error("Model not found");
    }

    const { data: providerModels, error: providerError } = await supabase
        .from("data_api_provider_models")
        .select(
            "provider_api_model_id, provider_id, api_model_id, provider_model_slug, internal_model_id, is_active_gateway, input_modalities, output_modalities, effective_from, effective_to, created_at, updated_at"
        )
        .eq("internal_model_id", modelId);

    if (providerError) {
        throw new Error(providerError.message ?? "Failed to load gateway providers");
    }

    const providerModelIds = (providerModels ?? [])
        .map((row) => row.provider_api_model_id)
        .filter((id): id is string => Boolean(id));

    const { data: caps, error: capsError } = await supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id, capability_id, params, status")
        .in("provider_api_model_id", providerModelIds);

    if (capsError) {
        throw new Error(capsError.message ?? "Failed to load gateway capabilities");
    }

    const providerIds = Array.from(
        new Set((providerModels ?? []).map((row) => row.provider_id).filter(Boolean))
    );
    const { data: providersData } = await supabase
        .from("data_api_providers")
        .select("api_provider_id, api_provider_name, link, country_code")
        .in("api_provider_id", providerIds);

    const providerMap = new Map<string, GatewayProviderDetails>();
    for (const provider of providersData ?? []) {
        if (!provider.api_provider_id) continue;
        providerMap.set(provider.api_provider_id, {
            api_provider_id: provider.api_provider_id,
            api_provider_name: provider.api_provider_name ?? provider.api_provider_id,
            link: provider.link ?? null,
            country_code: provider.country_code ?? null,
        });
    }

    const providers: GatewayProviderModel[] = [];
    for (const cap of caps ?? []) {
        if (cap.status === "disabled") continue;
        const pm = (providerModels ?? []).find(
            (row) => row.provider_api_model_id === cap.provider_api_model_id
        );
        if (!pm || !cap.capability_id) continue;
        providers.push({
            id: pm.provider_api_model_id,
            api_provider_id: pm.provider_id,
            provider_model_slug: pm.provider_model_slug,
            model_id: pm.api_model_id,
            endpoint: cap.capability_id,
            is_active_gateway: pm.is_active_gateway,
            input_modalities: Array.isArray(pm.input_modalities)
                ? pm.input_modalities.join(",")
                : pm.input_modalities ?? "",
            output_modalities: Array.isArray(pm.output_modalities)
                ? pm.output_modalities.join(",")
                : pm.output_modalities ?? "",
            effective_from: pm.effective_from,
            effective_to: pm.effective_to,
            created_at: pm.created_at,
            updated_at: pm.updated_at,
            provider: providerMap.get(pm.provider_id) ?? null,
        });
    }

    // console.log("[fetch] Fetching aliases for model", modelId);

    const { data: aliasesResponse, error: aliasesError } = await supabase
        .from("data_api_model_aliases")
        .select("alias_slug")
        .eq("api_model_id", modelId)
        .eq("is_enabled", true)
        .order("alias_slug", { ascending: true });

    // console.log("[fetch] aliasesResponse:", JSON.stringify(aliasesResponse, null, 2));

    if (aliasesError) {
        throw new Error(aliasesError.message ?? "Failed to load model aliases");
    }

    const aliasRows = (aliasesResponse ?? []) as { alias_slug: string }[];
    const aliases = aliasRows.map((alias) => alias.alias_slug);

    // console.log("[fetch] Aliases for model", modelId, ":", aliases);

    const now = new Date();

    const activeProviders = providers.filter(
        (provider) =>
            provider.is_active_gateway &&
            isWithinEffectiveWindow(
                provider.effective_from,
                provider.effective_to,
                now
            )
    );

    const inactiveProviders = providers.filter(
        (provider) =>
            !provider.is_active_gateway ||
            !isWithinEffectiveWindow(
                provider.effective_from,
                provider.effective_to,
                now
            )
    );

    return {
        modelId,
        aliases,
        providers,
        activeProviders,
        inactiveProviders,
    };
}

/**
 * Cached version of getModelGatewayMetadata.
 *
 * Usage: await getModelGatewayMetadataCached(modelId)
 *
 * This wraps the fetcher with `unstable_cache` for at least 1 week of caching.
 */
export async function getModelGatewayMetadataCached(
    modelId: string,
    includeHidden: boolean
): Promise<ModelGatewayMetadata> {
    "use cache";

    cacheLife("days");
    cacheTag("data:models");
    cacheTag(`data:models:${modelId}`);
    cacheTag("data:data_api_provider_models");
    cacheTag("data:model_aliases");

    console.log("[fetch] HIT DB for model gateway metadata", modelId);
    return getModelGatewayMetadata(modelId, includeHidden);
}
