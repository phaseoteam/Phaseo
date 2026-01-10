// lib/gateway/before/context.ts
import { getSupabaseAdmin } from "@/runtime/env";
import { contextSchema } from "./schemas";
import type { Endpoint } from "@core/types";
import type { GatewayContextData } from "./types";

export async function fetchGatewayContext(args: {
    teamId: string;
    model: string;
    endpoint: Endpoint;
    apiKeyId: string;
}): Promise<GatewayContextData> {
    // console.log(`[DEBUG] fetchGatewayContext called with model: ${args.model}, endpoint: ${args.endpoint}`);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("gateway_fetch_request_context", {
        team_id: args.teamId,
        model: args.model,
        endpoint: args.endpoint,
        api_key_id: args.apiKeyId,
    });

    if (error) throw new Error(`gateway_context_rpc_error:${error.message ?? "unknown"}`);

    const payload = Array.isArray(data) ? (data.length ? data[0] : null) : data;
    if (!payload) throw new Error("gateway_context_rpc_empty");

    // console.log("[DEBUG] Gateway context RPC payload:", JSON.stringify(payload, null, 2));

    let parsed: GatewayContextData;
    try {
        parsed = contextSchema.parse(payload);
    } catch (e) {
        console.error("[DEBUG] Zod parsing error:", e);
        console.error("[DEBUG] Payload that failed:", payload);
        throw e;
    }

    const totalByokMeta = parsed.providers.reduce((sum, p) => sum + p.byokMeta.length, 0);
    // console.log(`[DEBUG BYOK] Loaded context for team ${args.teamId}, model ${args.model}, endpoint ${args.endpoint}: providers count: ${parsed.providers.length}, total byokMeta count: ${totalByokMeta}`);
    if (totalByokMeta > 0) {
        const byokIds = parsed.providers.flatMap(p => p.byokMeta.map(m => m.id));
        // console.log(`[DEBUG BYOK] All byokMeta IDs: ${byokIds.join(', ')}`);
    }

    // console.log("[DEBUG] Parsed context:", {
    // teamId: parsed.teamId,
    //     resolvedModel: parsed.resolvedModel,
    //         providersCount: parsed.providers.length,
    //             pricingKeys: Object.keys(parsed.pricing),
    // });

    return parsed;
}
