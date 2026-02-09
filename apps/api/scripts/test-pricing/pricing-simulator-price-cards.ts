import { getSupabaseAdmin } from "../../src/runtime/env";
import type { PriceCard, PriceRule } from "../../src/pipeline/pricing/types";
import type { Combo } from "./pricing-simulator-types";

type RawPricingRow = {
    rule_id: number;
    provider_id: string;
    api_model_id: string;
    capability_id: string;
    pricing_plan?: string | null;
    meter: string;
    unit?: string | null;
    unit_size?: number | null;
    price_per_unit?: string | number | null;
    currency?: string | null;
    tiering_mode?: string | null;
    priority?: number | null;
    effective_from: string;
    effective_to?: string | null;
    updated_at: string;
};

const KEY_SEPARATOR = ":";

export function makeComboKey(combo: Combo): string {
    return [combo.provider, combo.model, combo.endpoint].join(KEY_SEPARATOR);
}

function parseComboKey(key: string): { provider: string; model: string; endpoint: string } {
    const [provider = "", model = "", endpoint = ""] = key.split(KEY_SEPARATOR);
    return { provider, model, endpoint };
}

function rowsToPriceCard(
    key: string,
    rows: RawPricingRow[],
    conditionMap: Map<number, any[]>
): PriceCard | null {
    if (!rows.length) return null;

    const rules: PriceRule[] = rows.map((row) => ({
        id: String(row.rule_id),
        pricing_plan: row.pricing_plan ?? "standard",
        meter: row.meter,
        unit: row.unit ?? "unit",
        unit_size: Number(row.unit_size ?? 1),
        price_per_unit: row.price_per_unit === null || row.price_per_unit === undefined ? "0" : String(row.price_per_unit),
        currency: row.currency ?? "USD",
        tiering_mode: row.tiering_mode ?? null,
        match: conditionMap.get(row.rule_id) ?? [],
        priority: Number(row.priority ?? 100),
    }));

    const version = new Date(Math.max(...rows.map((row) => new Date(row.updated_at).getTime()))).toISOString();
    const effectiveFrom = new Date(Math.min(...rows.map((row) => new Date(row.effective_from).getTime()))).toISOString();
    const effToCandidates = rows.map((row) => row.effective_to).filter(Boolean) as string[];
    const effectiveTo = effToCandidates.length
        ? new Date(Math.min(...effToCandidates.map((value) => new Date(value).getTime()))).toISOString()
        : null;

    const meta = parseComboKey(key);
    return {
        provider: meta.provider,
        model: meta.model,
        endpoint: meta.endpoint,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        currency: "USD",
        version,
        rules,
    };
}

export async function loadPriceCardsForCombos(combos: Combo[]): Promise<Map<string, PriceCard>> {
    const keys = Array.from(new Set(combos.map(makeComboKey)));
    const cards = new Map<string, PriceCard>();
    if (!keys.length) return cards;

    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const providers = Array.from(new Set(combos.map((combo) => combo.provider)));
    const models = Array.from(new Set(combos.map((combo) => combo.model)));
    const endpoints = Array.from(new Set(combos.map((combo) => combo.endpoint)));

    const { data, error } = await supabase
        .from("data_api_pricing_rules")
        .select(
            "rule_id, provider_id, api_model_id, capability_id, pricing_plan, meter, unit, unit_size, price_per_unit, currency, tiering_mode, note, priority, effective_from, effective_to, updated_at",
        )
        .in("provider_id", providers)
        .in("api_model_id", models)
        .in("capability_id", endpoints)
        .lte("effective_from", nowIso)
        .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
        .order("priority", { ascending: false })
        .order("effective_from", { ascending: false });

    if (error) {
        throw new Error(`Failed to load price cards: ${error.message}`);
    }

    const ruleIds = (data ?? [])
        .map((row: any) => row.rule_id)
        .filter((id: any): id is number => Number.isFinite(id));
    const conditionMap = new Map<number, any[]>();
    if (ruleIds.length) {
        const { data: conditions } = await supabase
            .from("data_api_pricing_conditions")
            .select("rule_id, path, op, or_group, and_index, value_text, value_number, value_list")
            .in("rule_id", ruleIds);
        for (const row of conditions ?? []) {
            const rid = row.rule_id as number;
            const arr = conditionMap.get(rid) ?? [];
            const value = row.value_list ?? row.value_number ?? row.value_text ?? null;
            arr.push({
                path: row.path,
                op: row.op,
                or_group: row.or_group ?? 0,
                and_index: row.and_index ?? 0,
                value,
            });
            conditionMap.set(rid, arr);
        }
    }

    const grouped = new Map<string, RawPricingRow[]>();
    for (const row of (data ?? []) as RawPricingRow[]) {
        if (!row?.provider_id || !row?.api_model_id || !row?.capability_id) continue;
        const groupKey = `${row.provider_id}:${row.api_model_id}:${row.capability_id}`;
        if (!grouped.has(groupKey)) grouped.set(groupKey, []);
        grouped.get(groupKey)!.push(row);
    }

    for (const key of keys) {
        const rows = grouped.get(key);
        if (!rows?.length) continue;
        const card = rowsToPriceCard(key, rows, conditionMap);
        if (card) cards.set(key, card);
    }

    return cards;
}

