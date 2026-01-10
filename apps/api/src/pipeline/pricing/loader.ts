import { getSupabaseAdmin } from "@/runtime/env";
import type { PriceCard, PriceRule } from "./types";

/** Parse "provider:model:endpoint" */
function parseKey(key: string): { provider: string; model: string; endpoint: string } {
    const [provider, model, endpoint] = key.split(":");
    return { provider: provider ?? "", model: model ?? "", endpoint: endpoint ?? "" };
}

export async function loadPriceCard(provider: string, model: string, endpoint: string): Promise<PriceCard | null> {
    const key = `${provider}:${model}:${endpoint}`;
    const nowIso = new Date().toISOString();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from("data_api_pricing_rules")
        .select("id, model_key, pricing_plan, meter, unit, unit_size, price_per_unit, currency, tiering_mode, note, match, priority, effective_from, effective_to, updated_at")
        .eq("model_key", key)
        .lte("effective_from", nowIso)
        .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
        .order("priority", { ascending: false }) // higher wins
        .order("effective_from", { ascending: false });

    if (error || !data || data.length === 0) return null;

    const rules: PriceRule[] = (data as any[]).map(r => ({
        id: r.id,
        pricing_plan: r.pricing_plan ?? "standard",
        meter: r.meter,
        unit: r.unit,
        unit_size: Number(r.unit_size ?? 1),
        price_per_unit: r.price_per_unit === null || r.price_per_unit === undefined ? "0" : String(r.price_per_unit),
        currency: r.currency ?? "USD",
        tiering_mode: r.tiering_mode ?? null,
        match: Array.isArray(r.match) ? r.match : [],
        priority: Number(r.priority ?? 100),
    }));

    const version = new Date(Math.max(...data.map((r: any) => new Date(r.updated_at).getTime()))).toISOString();
    const effective_from = new Date(Math.min(...data.map((r: any) => new Date(r.effective_from).getTime()))).toISOString();
    const effToVals = data.map((r: any) => r.effective_to).filter(Boolean);
    const effective_to = effToVals.length ? new Date(Math.min(...effToVals.map((x: string) => new Date(x).getTime()))).toISOString() : null;

    const meta = parseKey(key);
    const card: PriceCard = {
        provider: meta.provider,
        model: meta.model,
        endpoint: meta.endpoint,
        effective_from,
        effective_to,
        currency: "USD",
        version,
        rules,
    };
    return card;
}
