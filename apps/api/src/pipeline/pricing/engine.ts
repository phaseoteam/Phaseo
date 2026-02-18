// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import { parseUsdToNanos, formatUsdFromNanosExact, nanosToCentsCeil } from "./money";
import { matchesConditions, shallowMerge, evaluateConditions } from "./conditions";
import type { PriceCard, PriceRule, PricingBreakdownLine, PricingDimensionKey, PricingResult } from "./types";

const KNOWN_METERS = new Set<string>([
    "input_text_tokens", "input_image_tokens", "input_audio_tokens", "input_video_tokens",
    "output_text_tokens", "output_image_tokens", "output_audio_tokens", "output_video_tokens",
    "output_image", "output_video_seconds",
    "cached_write_text_tokens", "cached_write_image_tokens", "cached_write_audio_tokens", "cached_write_video_tokens",
    "cached_read_text_tokens", "cached_read_image_tokens", "cached_read_video_tokens", "cached_read_audio_tokens",
    "embedding_tokens", "requests",
]);

function isPricingDebugEnabled(): boolean {
    try {
        if (typeof globalThis !== "undefined" && (globalThis as any).__pricingDebug === true) return true;
    } catch {
        // ignore
    }
    try {
        if (typeof process !== "undefined" && process.env?.PRICING_SIMULATOR_DEBUG === "1") return true;
    } catch {
        // ignore
    }
    return false;
}

function logPricingDebug(message: string, payload: Record<string, unknown>) {
    if (!isPricingDebugEnabled()) return;
    try {
        console.log(`[PRICING-DEBUG] ${message}`, payload);
    } catch {
        // never throw while attempting to log
    }
}

type RuleScore = {
    rule: PriceRule;
    index: number;
    priority: number;
    matchedConditions: number;
    totalConditions: number;
    fullySatisfiedGroups: number;
    partiallySatisfiedGroups: number;
    hasConditions: boolean;
};

function buildRuleScores(candidates: PriceRule[], ctx: Record<string, any>): RuleScore[] {
    return candidates.map((rule, index) => {
        const summary = evaluateConditions(rule.match, ctx);
        const fullySatisfiedGroups = summary.groupSummaries.filter((group) => group.total > 0 && group.matched === group.total).length;
        const partiallySatisfiedGroups = summary.groupSummaries.filter((group) => group.matched > 0 && group.matched < group.total).length;

        return {
            rule,
            index,
            priority: rule.priority ?? 0,
            matchedConditions: summary.matchedConditions,
            totalConditions: summary.totalConditions,
            fullySatisfiedGroups,
            partiallySatisfiedGroups,
            hasConditions: summary.totalConditions > 0,
        };
    });
}

function compareRuleScores(a: RuleScore, b: RuleScore): number {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.fullySatisfiedGroups !== a.fullySatisfiedGroups) return b.fullySatisfiedGroups - a.fullySatisfiedGroups;
    if (b.matchedConditions !== a.matchedConditions) return b.matchedConditions - a.matchedConditions;
    if (b.totalConditions !== a.totalConditions) return b.totalConditions - a.totalConditions;
    if (a.partiallySatisfiedGroups !== b.partiallySatisfiedGroups) return a.partiallySatisfiedGroups - b.partiallySatisfiedGroups;
    if (a.hasConditions !== b.hasConditions) return b.hasConditions ? 1 : -1;
    return a.index - b.index;
}

type RuleSelection = {
    rule: PriceRule;
    scores: RuleScore[];
    rankByIndex: Map<number, number>;
};

function selectBestRule(candidates: PriceRule[], ctx: Record<string, any>): RuleSelection | undefined {
    if (!candidates.length) return undefined;
    const scores = buildRuleScores(candidates, ctx);
    const ranked = [...scores].sort(compareRuleScores);
    const rankByIndex = new Map<number, number>();
    ranked.forEach((score, idx) => {
        rankByIndex.set(score.index, idx + 1);
    });
    const selected = ranked[0];
    if (!selected) return undefined;
    return {
        rule: selected.rule,
        scores,
        rankByIndex,
    };
}

type CandidateSelectionRanking = {
    rule_id?: string;
    priority: number;
    matched_conditions: number;
    total_conditions: number;
    fully_satisfied_groups: number;
    partially_satisfied_groups: number;
    has_conditions: boolean;
    selection_rank?: number;
};

type RuleSelectionSummary = {
    selection?: RuleSelection;
    rankings: CandidateSelectionRanking[];
    selectedScore?: RuleScore;
    selectedRank?: number;
};

function analyzeRuleSelection(candidates: PriceRule[], ctx: Record<string, any>): RuleSelectionSummary {
    if (!candidates.length) return { selection: undefined, rankings: [] };
    const selection = selectBestRule(candidates, ctx);
    if (!selection) return { selection: undefined, rankings: [] };

    const rankByIndex = selection.rankByIndex;
    const rankings = selection.scores.map((score) => ({
        rule_id: score.rule.id,
        priority: score.priority,
        matched_conditions: score.matchedConditions,
        total_conditions: score.totalConditions,
        fully_satisfied_groups: score.fullySatisfiedGroups,
        partially_satisfied_groups: score.partiallySatisfiedGroups,
        has_conditions: score.hasConditions,
        selection_rank: rankByIndex.get(score.index) ?? undefined,
    }));

    const selectedScore = selection.scores.find((score) => score.rule === selection.rule);
    const selectedRank = selectedScore ? rankByIndex.get(selectedScore.index) ?? undefined : undefined;

    return {
        selection,
        rankings,
        selectedScore,
        selectedRank,
    };
}

/** Split raw usage into numeric meters and a context object */
function splitUsage(usageRaw: any, card: PriceCard): { meters: Record<string, number>; context: Record<string, any> } {
    const meters: Record<string, number> = {};
    const context: Record<string, any> = {};
    const allowedMeters = new Set<string>([...KNOWN_METERS, ...card.rules.map((rule) => rule.meter)]);

    logPricingDebug("splitUsage_input", { usageRaw });

    if (usageRaw && typeof usageRaw === "object") {
        for (const [k, v] of Object.entries(usageRaw)) {
            if (allowedMeters.has(k) && typeof v === "number" && isFinite(v)) meters[k] = v as number;
        }
        shallowMerge(context, usageRaw);
        if (context.context && typeof context.context === "object") shallowMerge(context, context.context);
        for (const k of Object.keys(meters)) delete context[k];
        delete context.context;
    }

    // Anthropic 1M pricing thresholds are based on input + cache read + cache write tokens.
    context.long_context_input_tokens =
        (meters.input_text_tokens ?? 0) +
        (meters.cached_read_text_tokens ?? 0) +
        (meters.cached_write_text_tokens ?? 0);

    logPricingDebug("splitUsage_output", {
        meters,
        context,
    });

    return { meters, context };
}

/** price qty at rule's price/unit_size using nanos math */
function priceWithRule(qty: number, rule: PriceRule) {
    const unitSize = rule.unit_size;
    const billableUnits = Math.ceil(qty / unitSize);
    const unitPriceNanos = parseUsdToNanos(rule.price_per_unit);
    const lineNanos = billableUnits * unitPriceNanos;

    logPricingDebug("priceWithRule", {
        quantity: qty,
        unitSize,
        billableUnits,
        price_per_unit: rule.price_per_unit,
        unitPriceNanos,
        lineNanos,
    });

    return {
        billableUnits,
        unitPriceNanos,
        unitPriceUsd: formatUsdFromNanosExact(unitPriceNanos),
        lineCostUsd: formatUsdFromNanosExact(lineNanos),
        lineNanos,
    };
}

/** Main public API -- build a full pricing summary from raw usage. */
export function computeBillSummary(
    usageRaw: Record<string, any>,
    card: PriceCard,
    requestOptions?: Record<string, any>,
    pricingPlan: string = "standard"
): PricingResult {
    const { meters, context: usageContext } = splitUsage(usageRaw, card);
    const ctx = { ...(requestOptions ?? {}), ...(usageContext ?? {}) };

    logPricingDebug("usage_received", {
        meters,
        pricingPlan,
        contextKeys: Object.keys(usageContext ?? {}),
        ruleCount: card.rules.length,
    });

    // candidate meters: any present in usage
    const dims = Object.keys(meters) as PricingDimensionKey[];

    logPricingDebug("computeBillSummary_dims", {
        dimensions: dims,
    });

    const lines: PricingBreakdownLine[] = [];
    const matchContext = { ...ctx, ...meters };

    for (const dim of dims) {
        const qty = meters[dim];
        if (!qty || qty <= 0) continue;

        // choose the highest priority rule for this meter that matches plan + conditions
        const candidates = card.rules
            .filter((r) => r.pricing_plan === pricingPlan && r.meter === dim)
            .filter((r) => matchesConditions(r.match, matchContext))
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

        const selectionSummary = analyzeRuleSelection(candidates, matchContext);

        logPricingDebug("meter_candidates", {
            meter: dim,
            quantity: qty,
            pricingPlan,
            candidateRuleIds: candidates.map((r) => r.id),
            candidateCount: candidates.length,
            candidates: candidates.slice(0, 10).map((r) => ({
                id: r.id,
                price_per_unit: r.price_per_unit,
                unit_size: r.unit_size,
                priority: r.priority,
                match: r.match,
            })),
            selection_rankings: selectionSummary.rankings.slice(0, 10),
        });

        if (!candidates.length) {
            logPricingDebug("meter_no_rule", {
                meter: dim,
                quantity: qty,
                pricingPlan,
            });
            continue;
        }

        // Bill all quantity using the selected rule
        const rule = selectionSummary.selection?.rule ?? candidates[0];
        const priced = priceWithRule(qty, rule);

        const selectionLog = selectionSummary.selectedScore
            ? {
                selection_rank: selectionSummary.selectedRank,
                selection_metrics: {
                    priority: selectionSummary.selectedScore.priority,
                    matched_conditions: selectionSummary.selectedScore.matchedConditions,
                    total_conditions: selectionSummary.selectedScore.totalConditions,
                    fully_satisfied_groups: selectionSummary.selectedScore.fullySatisfiedGroups,
                    partially_satisfied_groups: selectionSummary.selectedScore.partiallySatisfiedGroups,
                    has_conditions: selectionSummary.selectedScore.hasConditions,
                },
            }
            : undefined;

        logPricingDebug("meter_priced", {
            meter: dim,
            quantity: qty,
            rule: {
                id: rule.id,
                unit_size: rule.unit_size,
                price_per_unit: rule.price_per_unit,
                priority: rule.priority,
                pricing_plan: rule.pricing_plan,
            },
            result: {
                billable_units: priced.billableUnits,
                unit_price_usd: priced.unitPriceUsd,
                unit_price_nanos: priced.unitPriceNanos,
                line_cost_usd: priced.lineCostUsd,
                line_nanos: priced.lineNanos,
            },
            ...(selectionLog ?? {}),
        });

        lines.push({
            dimension: dim,
            quantity: qty,
            billable_units: priced.billableUnits,
            unit_size: rule.unit_size,
            unit_price_usd: priced.unitPriceUsd,
            line_cost_usd: priced.lineCostUsd,
            line_nanos: priced.lineNanos,
            bill_mode: "all",
            rule_priority: rule.priority,
            rule_id: rule.id,
        });
    }

    const totalNanos = lines.reduce((sum, line: any) => sum + (line.line_nanos ?? parseUsdToNanos(line.line_cost_usd)), 0);
    const centsCeil = nanosToCentsCeil(totalNanos);

    logPricingDebug("summary_totals", {
        lineCount: lines.length,
        totalNanos,
        totalCentsCeil: centsCeil,
        lines,
    });

    return {
        cost_usd: totalNanos / 1_000_000_000,
        cost_usd_str: formatUsdFromNanosExact(totalNanos),
        cost_cents: centsCeil,
        currency: "USD",
        lines,
    };
}

/** Attach a `pricing` section onto the original usage object. */
export function computeBill(
    usageRaw: Record<string, any>,
    card: PriceCard,
    requestOptions?: Record<string, any>,
    pricingPlan?: string
): Record<string, any> {
    const summary = computeBillSummary(
        usageRaw,
        card,
        requestOptions,
        pricingPlan ?? (requestOptions as any)?.pricing_plan ?? "standard"
    );

    // reconstruct exact nanos from lines, using the same arithmetic we used to compute each line
    const totalNanos = summary.lines.reduce((sum, line) => {
        const unitNanos = parseUsdToNanos(line.unit_price_usd);
        return sum + line.billable_units * unitNanos;
    }, 0);

    logPricingDebug("summary_lines", {
        lines: summary.lines,
        totalNanos,
    });

    const total_usd_str = String(Number((totalNanos / 1_000_000_000).toFixed(9)));
    const total_cents_floor = Math.trunc(totalNanos / 10_000_000);

    const slimLines = summary.lines.map((line) => ({
        dimension: line.dimension,
        quantity: line.quantity,
        billable_units: line.billable_units,
        unit_size: line.unit_size,
        unit_price_usd: line.unit_price_usd,
        line_cost_usd: line.line_cost_usd,
        line_nanos: line.line_nanos ?? parseUsdToNanos(line.line_cost_usd),
    }));

    return {
        ...usageRaw,
        pricing: {
            total_nanos: totalNanos,
            total_usd_str,
            total_cents: total_cents_floor,
            currency: "USD",
            lines: slimLines,
        },
    };
}

