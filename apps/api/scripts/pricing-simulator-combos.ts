import type { CLIOptions, Combo } from "./pricing-simulator-types";
import { getSupabaseAdmin } from "../src/runtime/env";

export async function loadCombos(options: CLIOptions): Promise<Combo[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase
        .from("data_api_provider_models")
        .select("provider_api_model_id, provider_id, api_model_id, is_active_gateway, effective_from, effective_to");

    if (options.provider?.length) query = query.in("provider_id", options.provider);
    if (options.model?.length) query = query.in("api_model_id", options.model);

    const { data: providerModels, error } = await query;
    if (error) {
        throw new Error(`Failed to load provider models: ${error.message}`);
    }

    const providerModelIds = (providerModels ?? [])
        .map((row) => row.provider_api_model_id)
        .filter((id): id is string => Boolean(id));

    let capQuery = supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id, capability_id")
        .in("provider_api_model_id", providerModelIds);
    if (options.endpoint) capQuery = capQuery.eq("capability_id", options.endpoint);

    const { data: capabilities, error: capError } = await capQuery;
    if (capError) {
        throw new Error(`Failed to load provider capabilities: ${capError.message}`);
    }

    const providerById = new Map<string, any>();
    for (const row of providerModels ?? []) {
        if (row.provider_api_model_id) providerById.set(row.provider_api_model_id, row);
    }

    const uniqueKeys = new Set<string>();
    const combos: Combo[] = [];

    for (const cap of capabilities ?? []) {
        const pm = providerById.get(cap.provider_api_model_id);
        if (!pm || !cap.capability_id) continue;
        if (!options.includeInactive) {
            if (pm.is_active_gateway !== true) continue;
        }

        const key = `${pm.provider_id}:${pm.api_model_id}:${cap.capability_id}`;
        if (uniqueKeys.has(key)) continue;
        uniqueKeys.add(key);
        combos.push({
            provider: pm.provider_id,
            model: pm.api_model_id,
            endpoint: cap.capability_id,
        });
    }

    return combos;
}
