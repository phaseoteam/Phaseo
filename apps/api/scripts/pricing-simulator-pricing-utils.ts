import type { RuleSummary, EstimationResult, EstimationLine, Condition } from "./pricing-simulator-types";
import type { PriceCard } from "../src/pipeline/pricing/types";
import { parseUsdToNanos, formatUsdFromNanosExact } from "../src/pipeline/pricing/money";
import { matchesConditions } from "../src/pipeline/pricing/conditions";
import type { RandomSource } from "./pricing-simulator-random";
import type { CLIOptions } from "./pricing-simulator-types";

export function ensureNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function toNumber(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

export function parseArrayLiteral(value: string): string[] | null {
    const trimmed = value.trim();
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner
        .split(",")
        .map((part) => part.trim().replace(/^['"\[]+|['"\]]+$/g, ""))
        .filter(Boolean);
}

export function normalizeConditionValue(value: unknown): unknown {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        const parsed = parseArrayLiteral(value);
        if (parsed) return parsed;
        return value.trim();
    }
    return value;
}

export function setNestedValue(target: Record<string, any>, path: string, value: unknown): void {
    if (!path) return;
    const parts = path.split(".");
    let current = target;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (typeof current[key] !== "object" || current[key] === null) {
            current[key] = {};
        }
        current = current[key];
    }
    current[parts[parts.length - 1]] = value;
}

export function unsetNestedValue(target: Record<string, any>, path: string): void {
    if (!path) return;
    const parts = path.split(".");
    let current = target;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (typeof current[key] !== "object" || current[key] === null) {
            return;
        }
        current = current[key];
    }
    delete current[parts[parts.length - 1]];
}

export function applyConditionToContext(
    target: Record<string, any>,
    condition: Condition,
    random: RandomSource
): void {
    if (!condition?.path) return;
    const valueNormalized = normalizeConditionValue(condition.value);

    switch (condition.op) {
        case "not_exists":
            unsetNestedValue(target, condition.path);
            return;
        case "exists":
            setNestedValue(target, condition.path, true);
            return;
        case "in": {
            const options = Array.isArray(valueNormalized) ? valueNormalized : [];
            if (!options.length) return;
            const index = options.length === 1 ? 0 : random.int(0, options.length - 1);
            setNestedValue(target, condition.path, options[index]);
            return;
        }
        case "eq": {
            if (valueNormalized === undefined) return;
            if (Array.isArray(valueNormalized) && valueNormalized.length) {
                const index = valueNormalized.length === 1 ? 0 : random.int(0, valueNormalized.length - 1);
                setNestedValue(target, condition.path, valueNormalized[index]);
                return;
            }
            setNestedValue(target, condition.path, valueNormalized);
            return;
        }
        case "lt":
        case "lte":
        case "gt":
        case "gte": {
            const numeric = toNumber(valueNormalized);
            if (numeric === null) return;
            const adjusted =
                condition.op === "lt"
                    ? numeric - 1
                    : condition.op === "lte"
                        ? numeric
                        : condition.op === "gt"
                            ? numeric + 1
                            : numeric;
            setNestedValue(target, condition.path, adjusted);
            return;
        }
        default:
            if (valueNormalized !== undefined) {
                setNestedValue(target, condition.path, valueNormalized);
            }
    }
}

export function pickQuantityForMeter(conditions: Condition[], opts: CLIOptions, random: RandomSource): number {
    const baseMin = Math.max(1, opts.min);
    const baseMax = Math.max(baseMin, opts.max);

    const eqCondition = conditions.find((cond) => cond.op === "eq" && cond.value !== undefined);
    if (eqCondition) {
        const numeric = toNumber(eqCondition.value);
        if (numeric !== null) {
            return Math.max(1, numeric);
        }
    }

    const inCondition = conditions.find((cond) => cond.op === "in" && cond.value !== undefined);
    if (inCondition) {
        const normalized = normalizeConditionValue(inCondition.value);
        const numericOptions = (Array.isArray(normalized) ? normalized : [])
            .map((val) => toNumber(val))
            .filter((val): val is number => val !== null);
        if (numericOptions.length) {
            const index = numericOptions.length === 1 ? 0 : random.int(0, numericOptions.length - 1);
            return Math.max(1, numericOptions[index]);
        }
    }

    let min = baseMin;
    let max = baseMax;

    for (const condition of conditions) {
        const numeric = toNumber(condition.value);
        if (numeric === null) continue;
        switch (condition.op) {
            case "gt":
                min = Math.max(min, numeric + 1);
                break;
            case "gte":
                min = Math.max(min, numeric);
                break;
            case "lt":
                max = Math.min(max, numeric - 1);
                break;
            case "lte":
                max = Math.min(max, numeric);
                break;
            default:
                break;
        }
    }

    if (min > max) {
        return baseMin;
    }

    return Math.max(1, random.int(min, max));
}

// helper: does this single condition accept this quantity?
function conditionAcceptsQuantity(cond: Condition, qty: number): boolean {
    const v = Number(cond.value);
    switch (cond.op) {
        case "eq": return qty === v;
        case "ne": return qty !== v;
        case "lt": return qty < v;
        case "lte": return qty <= v;
        case "gt": return qty > v;
        case "gte": return qty >= v;
        case "in": {
            const norm = normalizeConditionValue(cond.value);
            const arr = Array.isArray(norm) ? norm : [];
            return arr.map(Number).some((n) => n === qty);
        }
        // for exists/not_exists etc. we treat as not constraining qty
        default:
            return true;
    }
}

// given a quantity and a list of rules for this meter, find the ones whose
// meter-path conditions are satisfied by that quantity
function filterRulesByQuantity(
    qty: number,
    meter: string,
    variants: RuleSummary[]
): RuleSummary[] {
    return variants.filter((rule) => {
        const conds = rule.conditions ?? [];
        // only look at conditions that talk about THIS meter
        const meterConds = conds.filter((c) => c.path === meter);
        if (!meterConds.length) return true; // rule doesn't constrain meter, so it's ok
        return meterConds.every((c) => conditionAcceptsQuantity(c, qty));
    });
}

export function generateUsageAndContext(
    summaries: RuleSummary[],
    opts: CLIOptions,
    random: RandomSource
): { usage: Record<string, number>; context: Record<string, any> } {
    const usage: Record<string, number> = {};
    const context: Record<string, any> = {};
    const byMeter = new Map<string, RuleSummary[]>();

    // group the rules by meter
    for (const summary of summaries) {
        const existing = byMeter.get(summary.meter);
        if (existing) existing.push(summary);
        else byMeter.set(summary.meter, [summary]);
    }

    for (const [meter, variants] of byMeter.entries()) {
        if (!variants.length) continue;

        // 1) generate a number first (independent)
        const min = Math.max(1, opts.min);
        const max = Math.max(min, opts.max);
        const qty = random.int(min, max);
        usage[meter] = qty;

        // 2) now see which rules actually work with this qty
        const compatible = filterRulesByQuantity(qty, meter, variants);

        // 3) pick a rule from the compatible ones, or fallback to any
        const picked = (compatible.length
            ? compatible
            : variants)[random.int(0, (compatible.length ? compatible : variants).length - 1)]!;

        // 4) apply non-meter conditions from that picked rule to context
        const conds = picked.conditions ?? [];
        for (const cond of conds) {
            if (cond.path === meter) continue; // meter-related -> we already generated qty
            applyConditionToContext(context, cond, random);
        }
    }

    // fallback if card has no meters at all
    if (!Object.keys(usage).length) {
        usage.requests = random.int(Math.max(1, opts.min), Math.max(opts.min + 1, opts.max));
    }

    return { usage, context };
}

export function estimateCostFromRules(
    usage: Record<string, number>,
    context: Record<string, any>,
    card: PriceCard,
    plan: string
): EstimationResult {
    const rules = card.rules
        .filter((r) => r.pricing_plan === plan)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const subject: Record<string, any> = { ...context };
    for (const [meter, quantity] of Object.entries(usage)) {
        subject[meter] = quantity;
    }

    const summaries: RuleSummary[] = [];
    for (const meter of Object.keys(usage)) {
        const meterRules = rules.filter((r) => r.meter === meter);
        if (!meterRules.length) continue;
        const matchingRules = meterRules.filter((rule) => matchesConditions(rule.match, subject));
        const selected = matchingRules[0] ?? meterRules[0];
        if (!selected) continue;
        summaries.push({
            meter: selected.meter,
            pricePerUnit: String(selected.price_per_unit),
            unitSize: Math.max(1, Number(selected.unit_size ?? 1)),
            ruleId: selected.id,
            conditions: Array.isArray(selected.match) ? selected.match : [],
        });
    }
    const lines: EstimationLine[] = [];
    let totalNanos = 0;

    for (const summary of summaries) {
        const quantity = ensureNumber(usage[summary.meter], 0);
        const unitSize = Math.max(1, ensureNumber(summary.unitSize, 1));
        if (quantity <= 0) continue;
        const billableUnits = Math.ceil(quantity / unitSize);
        const priceNanos = parseUsdToNanos(summary.pricePerUnit);
        const lineNanos = billableUnits * priceNanos;
        totalNanos += lineNanos;
        lines.push({
            meter: summary.meter,
            quantity,
            unitSize,
            billableUnits,
            pricePerUnit: summary.pricePerUnit,
            lineCostUsd: formatUsdFromNanosExact(lineNanos),
            lineCostNanos: lineNanos,
            ruleId: summary.ruleId,
        });
    }

    return {
        totalUsd: totalNanos / 1_000_000_000,
        totalUsdStr: formatUsdFromNanosExact(totalNanos),
        totalNanos,
        lines,
        ruleSummaries: summaries,
    };
}

export function computeRuleSummaries(card: PriceCard, plan: string): RuleSummary[] {
    return card.rules
        .filter((r) => r.pricing_plan === plan)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .map((rule) => ({
            meter: rule.meter,
            pricePerUnit: String(rule.price_per_unit),
            unitSize: Math.max(1, Number(rule.unit_size ?? 1)),
            ruleId: rule.id,
            conditions: Array.isArray(rule.match) ? rule.match : [],
        }));
}

