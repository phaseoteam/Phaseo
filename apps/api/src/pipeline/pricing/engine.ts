// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import { parseUsdToNanos, formatUsdFromNanosExact, nanosToCentsCeil } from "./money";
import { matchesConditions, shallowMerge, evaluateConditions } from "./conditions";
import type { PriceCard, PriceRule, PricingBreakdownLine, PricingDimensionKey, PricingResult, PricingTimestampBasis } from "./types";
import { pickFirstFiniteNumber, resolveCanonicalTokenUsage, resolveRequestCountUsage } from "@core/usage-normalization";

const KNOWN_METERS = new Set<string>([
    "input_tokens",
    "input_characters", "input_pages",
    "input_text_tokens", "input_image_tokens", "input_audio_minutes", "input_audio_tokens", "input_video_tokens",
    "output_tokens",
    "output_text_tokens", "output_reasoning_tokens", "output_image_tokens", "output_audio_tokens", "output_video_tokens",
    "output_image", "output_video", "output_video_seconds",
    "implicit_cached_input_text_tokens",
    "cached_write_text_tokens", "cached_write_text_tokens_5m", "cached_write_text_tokens_1h",
    "cached_write_image_tokens", "cached_write_audio_tokens", "cached_write_video_tokens",
    "cached_read_text_tokens", "cached_read_image_tokens", "cached_read_video_tokens", "cached_read_audio_tokens",
    "embedding_tokens", "bfl_credits",
    "server_tool_web_search_requests", "server_tool_web_search_extra_results", "server_tool_web_fetch_requests", "server_tool_advisor_requests",
    "server_tool_image_generation_requests", "server_tool_apply_patch_requests",
    "native_web_search_requests", "native_web_fetch_requests",
    "requests",
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

    const canonicalTokens = resolveCanonicalTokenUsage(usageRaw);
    const canonicalInputTokens = canonicalTokens.inputTokens;
    const canonicalOutputTokens = canonicalTokens.outputTokens;
    const canonicalTotalTokens = canonicalTokens.totalTokens;
    if (meters.input_tokens == null) meters.input_tokens = canonicalInputTokens;
    if (meters.output_tokens == null) meters.output_tokens = canonicalOutputTokens;
    if (meters.total_tokens == null) meters.total_tokens = canonicalTotalTokens;

    const cachedReadTokens = pickFirstFiniteNumber(usageRaw, [
        "cached_read_text_tokens",
        "cache_read_input_tokens",
        "cached_tokens",
        "prompt_cache_hit_tokens",
        "cachedInputTokens",
        "cachedContentTokenCount",
        "input_tokens_details.cached_tokens",
        "input_details.cached_tokens",
        "prompt_tokens_details.cached_tokens",
    ]);
    const cachedWriteTokens = pickFirstFiniteNumber(usageRaw, [
        "cached_write_text_tokens",
        "cache_creation_input_tokens",
        "input_tokens_details.cache_creation_input_tokens",
        "prompt_tokens_details.cache_creation_input_tokens",
        "input_tokens_details.cache_creation_tokens",
        "prompt_tokens_details.cache_creation_tokens",
        "_ext.cachedWriteTokens",
        "output_tokens_details.cached_tokens",
        "completion_tokens_details.cached_tokens",
    ]);
    const cachedWrite5mTokens = pickFirstFiniteNumber(usageRaw, [
        "cached_write_text_tokens_5m",
        "_ext.cachedWriteTokens5m",
        "cache_creation.ephemeral_5m_input_tokens",
        "cache_creation_5m_input_tokens",
        "cache_creation_ephemeral_5m_input_tokens",
    ]);
    const cachedWrite1hTokens = pickFirstFiniteNumber(usageRaw, [
        "cached_write_text_tokens_1h",
        "_ext.cachedWriteTokens1h",
        "cache_creation.ephemeral_1h_input_tokens",
        "cache_creation_1h_input_tokens",
        "cache_creation_ephemeral_1h_input_tokens",
    ]);
    const reasoningTokens = pickFirstFiniteNumber(usageRaw, [
        "output_reasoning_tokens",
        "reasoning_tokens",
        "output_tokens_details.reasoning_tokens",
        "completion_tokens_details.reasoning_tokens",
    ]);
    const requests = resolveRequestCountUsage(usageRaw);
    if (typeof cachedReadTokens === "number" && meters.cached_read_text_tokens == null) {
        meters.cached_read_text_tokens = cachedReadTokens;
    }
    if (
        typeof cachedReadTokens === "number" &&
        card.rules.some((rule) => rule.meter === "implicit_cached_input_text_tokens") &&
        meters.implicit_cached_input_text_tokens == null
    ) {
        meters.implicit_cached_input_text_tokens = cachedReadTokens;
    }
    if (typeof cachedWriteTokens === "number" && meters.cached_write_text_tokens == null) {
        meters.cached_write_text_tokens = cachedWriteTokens;
    }
    if (typeof cachedWrite5mTokens === "number" && meters.cached_write_text_tokens_5m == null) {
        meters.cached_write_text_tokens_5m = cachedWrite5mTokens;
    }
    if (typeof cachedWrite1hTokens === "number" && meters.cached_write_text_tokens_1h == null) {
        meters.cached_write_text_tokens_1h = cachedWrite1hTokens;
    }
    if (
        meters.cached_write_text_tokens == null &&
        (typeof cachedWrite5mTokens === "number" || typeof cachedWrite1hTokens === "number")
    ) {
        meters.cached_write_text_tokens = (cachedWrite5mTokens ?? 0) + (cachedWrite1hTokens ?? 0);
    }
    const hasSplitCachedWriteRules = card.rules.some((rule) =>
        rule.meter === "cached_write_text_tokens_5m" ||
        rule.meter === "cached_write_text_tokens_1h"
    );
    if (
        hasSplitCachedWriteRules &&
        typeof cachedWriteTokens === "number" &&
        typeof cachedWrite5mTokens !== "number" &&
        typeof cachedWrite1hTokens !== "number"
    ) {
        const ttlHint = String(
            usageRaw?.cache_ttl ??
            usageRaw?.cache_ttl_seconds ??
            usageRaw?.context?.cache_ttl ??
            "5m",
        ).trim().toLowerCase();
        if (ttlHint === "1h" || ttlHint === "60m" || ttlHint === "3600") {
            meters.cached_write_text_tokens_1h = cachedWriteTokens;
        } else {
            meters.cached_write_text_tokens_5m = cachedWriteTokens;
        }
    }
    if (
        hasSplitCachedWriteRules &&
        (
            (meters.cached_write_text_tokens_5m ?? 0) > 0 ||
            (meters.cached_write_text_tokens_1h ?? 0) > 0
        )
    ) {
        delete meters.cached_write_text_tokens;
    }
    if (typeof reasoningTokens === "number" && meters.output_reasoning_tokens == null) {
        meters.output_reasoning_tokens = reasoningTokens;
    }
    if (typeof requests === "number" && meters.requests == null) {
        meters.requests = requests;
    }
    const webSearchRequests = pickFirstFiniteNumber(usageRaw, [
        "server_tool_web_search_requests",
    ]);
    const webSearchExtraResults = pickFirstFiniteNumber(usageRaw, [
        "server_tool_web_search_extra_results",
    ]);
    const webFetchRequests = pickFirstFiniteNumber(usageRaw, [
        "server_tool_web_fetch_requests",
    ]);
    const advisorRequests = pickFirstFiniteNumber(usageRaw, [
        "server_tool_advisor_requests",
        "server_tool_use.advisor_requests",
        "serverToolUse.advisor_requests",
    ]);
    const imageGenerationRequests = pickFirstFiniteNumber(usageRaw, [
        "server_tool_image_generation_requests",
        "server_tool_use.image_generation_requests",
        "serverToolUse.image_generation_requests",
    ]);
    const applyPatchRequests = pickFirstFiniteNumber(usageRaw, [
        "server_tool_apply_patch_requests",
        "server_tool_use.apply_patch_requests",
        "serverToolUse.apply_patch_requests",
    ]);
    const nativeWebSearchRequests = pickFirstFiniteNumber(usageRaw, [
        "native_web_search_requests",
        "native_web_searches",
        "server_tool_use.web_search_requests",
        "serverToolUse.web_search_requests",
    ]);
    const nativeWebFetchRequests = pickFirstFiniteNumber(usageRaw, [
        "native_web_fetch_requests",
        "native_web_fetches",
        "server_tool_use.web_fetch_requests",
        "serverToolUse.web_fetch_requests",
    ]);
    if (typeof webSearchRequests === "number" && meters.server_tool_web_search_requests == null) {
        meters.server_tool_web_search_requests = webSearchRequests;
    }
    if (typeof webSearchExtraResults === "number" && meters.server_tool_web_search_extra_results == null) {
        meters.server_tool_web_search_extra_results = webSearchExtraResults;
    }
    if (typeof webFetchRequests === "number" && meters.server_tool_web_fetch_requests == null) {
        meters.server_tool_web_fetch_requests = webFetchRequests;
    }
    if (typeof advisorRequests === "number" && meters.server_tool_advisor_requests == null) {
        meters.server_tool_advisor_requests = advisorRequests;
    }
    if (typeof imageGenerationRequests === "number" && meters.server_tool_image_generation_requests == null) {
        meters.server_tool_image_generation_requests = imageGenerationRequests;
    }
    if (typeof applyPatchRequests === "number" && meters.server_tool_apply_patch_requests == null) {
        meters.server_tool_apply_patch_requests = applyPatchRequests;
    }
    const hasManagedWebSearchMeter =
        typeof pickFirstFiniteNumber(usageRaw, ["server_tool_web_search_requests"]) === "number";
    const hasManagedWebFetchMeter =
        typeof pickFirstFiniteNumber(usageRaw, ["server_tool_web_fetch_requests"]) === "number";
    if (
        !hasManagedWebSearchMeter &&
        typeof nativeWebSearchRequests === "number" &&
        meters.native_web_search_requests == null
    ) {
        meters.native_web_search_requests = nativeWebSearchRequests;
    }
    if (
        !hasManagedWebFetchMeter &&
        typeof nativeWebFetchRequests === "number" &&
        meters.native_web_fetch_requests == null
    ) {
        meters.native_web_fetch_requests = nativeWebFetchRequests;
    }

    const inputTextTokens = meters.input_text_tokens;
    const cachedReadIsSubsetHint = usageRaw?.cached_read_tokens_are_subset_of_input;
    const shouldTreatCachedReadAsSubset =
        cachedReadIsSubsetHint === true ||
        (
            cachedReadIsSubsetHint !== false &&
            typeof usageRaw?.input_tokens_details?.cached_tokens === "number"
        );
    const inputTextMirrorsCanonical =
        typeof inputTextTokens === "number" &&
        typeof canonicalInputTokens === "number" &&
        inputTextTokens === canonicalInputTokens;

    if (meters.input_text_tokens == null) {
        meters.input_text_tokens =
            shouldTreatCachedReadAsSubset && typeof cachedReadTokens === "number"
                ? Math.max(0, canonicalInputTokens - cachedReadTokens)
                : canonicalInputTokens;
    }
    if (meters.output_text_tokens == null) {
        meters.output_text_tokens =
            card.rules.some((rule) => rule.meter === "output_reasoning_tokens") &&
            typeof reasoningTokens === "number"
                ? Math.max(0, canonicalOutputTokens - reasoningTokens)
                : canonicalOutputTokens;
    }
    if (
        card.rules.some((rule) => rule.meter === "output_reasoning_tokens") &&
        typeof meters.output_text_tokens === "number" &&
        typeof reasoningTokens === "number" &&
        meters.output_text_tokens === canonicalOutputTokens
    ) {
        meters.output_text_tokens = Math.max(0, meters.output_text_tokens - reasoningTokens);
    }
    if (
        shouldTreatCachedReadAsSubset &&
        inputTextMirrorsCanonical &&
        typeof cachedReadTokens === "number" &&
        cachedReadTokens > 0
    ) {
        meters.input_text_tokens = Math.max(0, inputTextTokens - cachedReadTokens);
    }

    // Anthropic 1M pricing thresholds are based on input + cache read + cache write tokens.
    context.long_context_input_tokens =
        (meters.input_text_tokens ?? 0) +
        (meters.implicit_cached_input_text_tokens ?? 0) +
        (meters.cached_read_text_tokens ?? 0) +
        (meters.cached_write_text_tokens ?? 0) +
        (meters.cached_write_text_tokens_5m ?? 0) +
        (meters.cached_write_text_tokens_1h ?? 0);

    logPricingDebug("splitUsage_output", {
        meters,
        context,
    });

    return { meters, context };
}

/** price qty at rule's price/unit_size using nanos math */
function normalizeTimestampMs(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        const ms = new Date(value).getTime();
        return Number.isFinite(ms) ? ms : null;
    }
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : null;
    }
    if (typeof value === "string" && value.trim()) {
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : null;
    }
    return null;
}

type ResolvedPricingTimestamp = {
    timestampMs: number | null;
    basis: PricingTimestampBasis;
};

function resolvePricingTimestamp(
    basis: PricingTimestampBasis | undefined,
    requestOptions?: Record<string, any>,
): ResolvedPricingTimestamp {
    const configuredBasis = basis ?? "request_start";
    const options = requestOptions ?? {};
    const candidates =
        configuredBasis === "request_start"
            ? [
                options.request_started_at,
                options.requestStartedAt,
                options.started_at,
                options.startedAt,
                options.startedAtMs,
            ]
            : configuredBasis === "provider_accept"
            ? [
                options.provider_accepted_at,
                options.providerAcceptedAt,
                options.upstream_started_at,
                options.upstreamStartedAt,
                options.upstreamStartMs,
            ]
            : configuredBasis === "completion"
                ? [
                    options.completed_at,
                    options.completedAt,
                    options.completion_at,
                    options.completionAt,
                    options.completedAtMs,
                ]
                : [];

    for (const value of candidates) {
        const ms = normalizeTimestampMs(value);
        if (ms !== null) return { timestampMs: ms, basis: configuredBasis };
    }

    return { timestampMs: null, basis: configuredBasis };
}

function parseUtcMinute(value: unknown): number | null {
    if (typeof value !== "string") return null;
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
}

function isMinuteInsideWindow(minute: number, startMinute: number, endMinute: number): boolean {
    if (startMinute === endMinute) return false;
    if (startMinute < endMinute) return minute >= startMinute && minute < endMinute;
    return minute >= startMinute || minute < endMinute;
}

type ResolvedRulePrice = {
    price_per_unit: string;
    billing_timestamp_basis: PricingTimestampBasis;
    billing_timestamp_basis_configured: PricingTimestampBasis;
    billing_timestamp_ms: number | null;
    pricing_time_window: PricingBreakdownLine["pricing_time_window"];
};

function resolveRulePrice(rule: PriceRule, requestOptions?: Record<string, any>): ResolvedRulePrice {
    const basis = rule.billing_timestamp_basis ?? "request_start";
    const resolvedTimestamp = resolvePricingTimestamp(basis, requestOptions);
    const timestampMs = resolvedTimestamp.timestampMs;
    const windows = Array.isArray(rule.time_windows) ? rule.time_windows : [];

    if (timestampMs !== null && windows.length > 0) {
        const date = new Date(timestampMs);
        const utcMinute = date.getUTCHours() * 60 + date.getUTCMinutes();
        const matches = windows
            .map((window, index) => ({ window, index }))
            .filter(({ window }) => {
                if (!window || window.timezone !== "UTC") return false;
                const startMinute = parseUtcMinute(window.start_time);
                const endMinute = parseUtcMinute(window.end_time);
                if (startMinute === null || endMinute === null) return false;
                return isMinuteInsideWindow(utcMinute, startMinute, endMinute);
            })
            .sort((a, b) =>
                Number(b.window.priority ?? 0) - Number(a.window.priority ?? 0) ||
                a.index - b.index
            );
        const matched = matches[0]?.window;
        if (matched && matched.price_per_unit !== undefined && matched.price_per_unit !== null) {
            return {
                price_per_unit: String(matched.price_per_unit),
                billing_timestamp_basis: resolvedTimestamp.basis,
                billing_timestamp_basis_configured: basis,
                billing_timestamp_ms: timestampMs,
                pricing_time_window: {
                    label: matched.label,
                    timezone: "UTC",
                    start_time: matched.start_time,
                    end_time: matched.end_time,
                },
            };
        }
    }

    return {
        price_per_unit: rule.price_per_unit,
        billing_timestamp_basis: resolvedTimestamp.basis,
        billing_timestamp_basis_configured: basis,
        billing_timestamp_ms: timestampMs,
        pricing_time_window: null,
    };
}

function priceWithRule(qty: number, rule: PriceRule, requestOptions?: Record<string, any>) {
    const unitSize = rule.unit_size > 0 ? rule.unit_size : 1;
    const resolvedPrice = resolveRulePrice(rule, requestOptions);
    // Pro-rate by unit size (e.g. 8 tokens at a per-1M-token rate).
    const billableUnits = qty / unitSize;
    const unitPriceNanos = parseUsdToNanos(resolvedPrice.price_per_unit);
    // Keep nanos integral to avoid floating precision drift downstream.
    const lineNanos = Math.round(billableUnits * unitPriceNanos);

    logPricingDebug("priceWithRule", {
        quantity: qty,
        unitSize,
        billableUnits,
        price_per_unit: resolvedPrice.price_per_unit,
        billing_timestamp_basis: resolvedPrice.billing_timestamp_basis,
        billing_timestamp_basis_configured: resolvedPrice.billing_timestamp_basis_configured,
        pricing_time_window: resolvedPrice.pricing_time_window,
        unitPriceNanos,
        lineNanos,
    });

    return {
        billableUnits,
        unitPriceNanos,
        unitPriceUsd: formatUsdFromNanosExact(unitPriceNanos),
        lineCostUsd: formatUsdFromNanosExact(lineNanos),
        lineNanos,
        billingTimestampBasis: resolvedPrice.billing_timestamp_basis,
        billingTimestampBasisConfigured: resolvedPrice.billing_timestamp_basis_configured,
        billingTimestampMs: resolvedPrice.billing_timestamp_ms,
        pricingTimeWindow: resolvedPrice.pricing_time_window,
    };
}

function nativeToolFallbackRule(card: PriceCard, meter: PricingDimensionKey): PriceRule | null {
    const provider = String(card.provider ?? "").toLowerCase();
    if (meter === "native_web_search_requests" && (provider === "openai" || provider === "anthropic")) {
        return {
            pricing_plan: "standard",
            meter,
            unit: "request",
            unit_size: 1,
            price_per_unit: "0.01",
            currency: "USD",
            match: [],
            priority: -1000,
            id: `${provider}_native_web_search_default`,
        };
    }
    if (meter === "native_web_fetch_requests" && provider === "anthropic") {
        return {
            pricing_plan: "standard",
            meter,
            unit: "request",
            unit_size: 1,
            price_per_unit: "0",
            currency: "USD",
            match: [],
            priority: -1000,
            id: "anthropic_native_web_fetch_default",
        };
    }
    return null;
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

    const findCandidatesForPlanAndMeter = (plan: string, meter: PricingDimensionKey): PriceRule[] =>
        card.rules
            .filter((r) => r.pricing_plan === plan && r.meter === meter)
            .filter((r) => matchesConditions(r.match, matchContext))
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const dim of dims) {
        const qty = meters[dim];
        if (!qty || qty <= 0) continue;

        // choose the highest priority rule for this meter that matches plan + conditions
        let candidates = findCandidatesForPlanAndMeter(pricingPlan, dim);
        let resolvedPlan = pricingPlan;
        if (!candidates.length && pricingPlan !== "standard") {
            const fallbackCandidates = findCandidatesForPlanAndMeter("standard", dim);
            if (fallbackCandidates.length) {
                candidates = fallbackCandidates;
                resolvedPlan = "standard";
                logPricingDebug("meter_plan_fallback", {
                    meter: dim,
                    quantity: qty,
                    requestedPricingPlan: pricingPlan,
                    fallbackPricingPlan: "standard",
                    candidateRuleIds: candidates.map((r) => r.id),
                });
            }
        }
        if (!candidates.length) {
            const nativeFallback = nativeToolFallbackRule(card, dim);
            if (nativeFallback) {
                candidates = [nativeFallback];
                resolvedPlan = nativeFallback.pricing_plan;
                logPricingDebug("meter_native_tool_default_pricing", {
                    meter: dim,
                    provider: card.provider,
                    model: card.model,
                    price_per_unit: nativeFallback.price_per_unit,
                });
            }
        }

        const selectionSummary = analyzeRuleSelection(candidates, matchContext);

        logPricingDebug("meter_candidates", {
            meter: dim,
            quantity: qty,
            pricingPlan: resolvedPlan,
            requestedPricingPlan: pricingPlan,
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
                pricingPlan: resolvedPlan,
                requestedPricingPlan: pricingPlan,
            });
            continue;
        }

        // Bill all quantity using the selected rule
        const rule = selectionSummary.selection?.rule ?? candidates[0];
        const priced = priceWithRule(qty, rule, requestOptions);

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
                price_per_unit: priced.unitPriceUsd,
                priority: rule.priority,
                pricing_plan: rule.pricing_plan,
                billing_timestamp_basis: priced.billingTimestampBasis,
                billing_timestamp_basis_configured: priced.billingTimestampBasisConfigured,
                billing_timestamp_ms: priced.billingTimestampMs,
                pricing_time_window: priced.pricingTimeWindow,
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
            billing_timestamp_basis: priced.billingTimestampBasis,
            billing_timestamp_basis_configured: priced.billingTimestampBasisConfigured,
            billing_timestamp_ms: priced.billingTimestampMs,
            billing_timestamp_iso: priced.billingTimestampMs === null
                ? null
                : new Date(priced.billingTimestampMs).toISOString(),
            pricing_time_window: priced.pricingTimeWindow,
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

    // Use precomputed line_nanos to preserve exact totals when billable_units is fractional.
    const totalNanos = summary.lines.reduce((sum, line) => {
        return sum + (line.line_nanos ?? parseUsdToNanos(line.line_cost_usd));
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
        billing_timestamp_basis: line.billing_timestamp_basis,
        billing_timestamp_basis_configured: line.billing_timestamp_basis_configured,
        billing_timestamp_ms: line.billing_timestamp_ms ?? null,
        billing_timestamp_iso: line.billing_timestamp_iso ?? null,
        pricing_time_window: line.pricing_time_window ?? null,
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
