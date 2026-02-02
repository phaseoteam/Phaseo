// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import { getSupabaseAdmin } from "@/runtime/env";
import type { PriceCard, PriceRule } from "./types";

export async function loadPriceCard(provider: string, model: string, endpoint: string): Promise<PriceCard | null> {
    const nowIso = new Date().toISOString();
    const modelKey = `${provider}:${model}:${endpoint}`;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from("data_api_pricing_rules")
        .select("rule_id, model_key, capability_id, pricing_plan, meter, unit, unit_size, price_per_unit, currency, tiering_mode, note, match, priority, effective_from, effective_to, updated_at")
        .eq("model_key", modelKey)
        .eq("capability_id", endpoint)
        .or([
            "and(effective_from.is.null,effective_to.is.null)",
            `and(effective_from.is.null,effective_to.gt.${nowIso})`,
            `and(effective_from.lte.${nowIso},effective_to.is.null)`,
            `and(effective_from.lte.${nowIso},effective_to.gt.${nowIso})`,
        ].join(","))
        .order("priority", { ascending: false }) // higher wins
        .order("effective_from", { ascending: false });
    if (error || !data || data.length === 0) return null;

    const rules: PriceRule[] = (data as any[]).map((r) => ({
        id: String(r.rule_id),
        pricing_plan: r.pricing_plan ?? "standard",
        meter: r.meter,
        unit: r.unit,
        unit_size: Number(r.unit_size ?? 1),
        price_per_unit:
            r.price_per_unit === null || r.price_per_unit === undefined
                ? "0"
                : String(r.price_per_unit),
        currency: r.currency ?? "USD",
        tiering_mode: r.tiering_mode ?? null,
        match: Array.isArray(r.match) ? r.match : [],
        priority: Number(r.priority ?? 100),
    }));

    const version = new Date(
        Math.max(...data.map((r: any) => new Date(r.updated_at).getTime()))
    ).toISOString();
    const effectiveFromValues = data
        .map((r: any) => r.effective_from)
        .filter(Boolean)
        .map((value: string) => new Date(value).getTime())
        .filter((value: number) => Number.isFinite(value));
    const effective_from = effectiveFromValues.length
        ? new Date(Math.min(...effectiveFromValues)).toISOString()
        : null;
    const effToVals = data.map((r: any) => r.effective_to).filter(Boolean);
    const effective_to = effToVals.length
        ? new Date(
              Math.min(...effToVals.map((x: string) => new Date(x).getTime()))
          ).toISOString()
        : null;

    const card: PriceCard = {
        provider,
        model,
        endpoint,
        effective_from,
        effective_to,
        currency: "USD",
        version,
        rules,
    };
    return card;
}

