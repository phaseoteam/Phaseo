// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import { parseUsdToNanos, formatUsdFromNanosExact, formatUsdPriceExact, nanosToCentsCeil, priceLineNanosExact } from "./money";
import { canonicalPricingPlan, normalizePriceCardPlans, requiresExplicitServiceTier, resolveBasePricingPlan } from "./service-tiers";
import { assignImplicitCacheRead, cacheCountsReportedOutsideInput, cacheHitIsExplicit, nativeToolFallbackRule, thinkingModeBillsAnswer } from "./meter-semantics";
import { matchesConditions, shallowMerge, evaluateConditions } from "./conditions";
import type { PriceCard, PriceRule, PricingBreakdownLine, PricingDimensionKey, PricingResult, PricingTimestampBasis } from "./types";
import { pickFirstFiniteNumber, resolveCanonicalTokenUsage, resolveRequestCountUsage } from "@core/usage-normalization";
import { CACHED_WRITE_TOKEN_PATHS, resolveCacheTokenUsage } from "@core/cache-usage";
import { cacheTtlUnsupported } from "@pipeline/execute/cacheTtl";
import { applyOpenAICacheWriteTtlSplit, OPENAI_CACHE_WRITE_12H_INPUT_MULTIPLIER, OPENAI_CACHE_WRITE_12H_METER, OPENAI_CACHE_WRITE_TTL_METERS } from "./openai-cache-ttl";

const KNOWN_METERS = new Set<string>([
    "input_tokens",
    "input_characters", "input_text_bytes", "input_pages",
    "input_text_tokens", "input_text_messages", "input_image", "input_image_tokens", "input_audio_minutes", "input_audio_seconds", "input_audio_tokens", "input_video_seconds", "input_video_tokens",
    "output_tokens",
    "output_text_tokens", "output_reasoning_tokens", "output_image_tokens", "output_audio_minutes", "output_audio_seconds", "output_audio_tokens", "output_video_tokens",
    "output_image", "output_video", "output_video_seconds", "output_video_frames",
    "audio_minutes", "audio_seconds",
    "implicit_cached_input_text_tokens",
    "cached_write_text_tokens", "cached_write_text_tokens_5m", "cached_write_text_tokens_1h",
    "cached_write_image_tokens", "cached_write_audio_tokens", "cached_write_video_tokens",
    "cached_read_text_tokens", "cached_read_image_tokens", "cached_read_video_tokens", "cached_read_audio_tokens",
    "embedding_tokens", "bfl_credits", "deepinfra_cost_usd",
    "server_tool_web_search_requests", "server_tool_web_search_extra_results", "server_tool_web_fetch_requests", "server_tool_advisor_requests",
    "server_tool_image_generation_requests", "server_tool_apply_patch_requests",
    "native_web_search_requests", "native_web_fetch_requests",
    "requests",
    ...OPENAI_CACHE_WRITE_TTL_METERS,
]);

const CACHE_METERS = new Set<string>([
    "implicit_cached_input_text_tokens",
    "cached_write_text_tokens", "cached_write_text_tokens_5m", "cached_write_text_tokens_1h",
    "cached_write_image_tokens", "cached_write_audio_tokens", "cached_write_video_tokens",
    "cached_read_text_tokens", "cached_read_image_tokens", "cached_read_video_tokens", "cached_read_audio_tokens",
    ...OPENAI_CACHE_WRITE_TTL_METERS,
]);

function cacheMeterCanUseAggregate(meter: string, usage: Record<string, unknown>): boolean {
	const aggregate = Number(usage.cached_write_text_tokens ?? 0);
	const splitTotal = Number(usage.cached_write_text_tokens_5m ?? 0) + Number(usage.cached_write_text_tokens_1h ?? 0);
    return (meter === "cached_write_text_tokens_5m" || meter === "cached_write_text_tokens_1h") &&
		aggregate > 0 && aggregate >= splitTotal;
}

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

function effectiveRulePriority(rule: PriceRule): number {
	if (Number.isFinite(rule.priority)) return Number(rule.priority);
	return Array.isArray(rule.match) && rule.match.length > 0 ? 300 : 100;
}

function buildRuleScores(candidates: PriceRule[], ctx: Record<string, any>): RuleScore[] {
    return candidates.map((rule, index) => {
        const summary = evaluateConditions(rule.match, ctx);
        const fullySatisfiedGroups = summary.groupSummaries.filter((group) => group.total > 0 && group.matched === group.total).length;
        const partiallySatisfiedGroups = summary.groupSummaries.filter((group) => group.matched > 0 && group.matched < group.total).length;

        return {
            rule,
            index,
			priority: effectiveRulePriority(rule),
            matchedConditions: summary.matchedConditions,
            totalConditions: summary.totalConditions,
            fullySatisfiedGroups,
            partiallySatisfiedGroups,
            hasConditions: summary.totalConditions > 0,
        };
    });
}

function compareRuleScores(a: RuleScore, b: RuleScore): number {
    if (b.fullySatisfiedGroups !== a.fullySatisfiedGroups) return b.fullySatisfiedGroups - a.fullySatisfiedGroups;
    if (b.matchedConditions !== a.matchedConditions) return b.matchedConditions - a.matchedConditions;
    if (b.totalConditions !== a.totalConditions) return b.totalConditions - a.totalConditions;
    // A matching conditional tier is more specific than an unconditional base
    // tier. This keeps legacy/catalog rules safe when their optional priority
    // metadata was omitted and otherwise defaulted below the base rate.
    if (a.hasConditions !== b.hasConditions) return b.hasConditions ? 1 : -1;
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.partiallySatisfiedGroups !== b.partiallySatisfiedGroups) return a.partiallySatisfiedGroups - b.partiallySatisfiedGroups;
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

const REPORTED_INPUT_TOTAL_PATHS = [
    "input_tokens",
    "prompt_tokens",
    "promptTokens",
    "prompt_token_count",
    "total_input_tokens",
    "totalInputTokens",
    "inputTokens",
    "promptTokenCount",
] as const;

/** Split raw usage into numeric meters and a context object */
function splitUsage(
    usageRaw: any,
    card: PriceCard,
    requestOptions?: Record<string, any>,
): {
    meters: Record<string, number>;
    context: Record<string, any>;
    /** input_text_tokens is the whole uncached prompt, so it still contains any image, audio or video tokens. */
    inputTextCoversPrompt: boolean;
} {
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

    const cache = resolveCacheTokenUsage(usageRaw, canonicalInputTokens);
    const cachedReadTokens = cache.readTokens;
    const cachedWriteTokens = pickFirstFiniteNumber(usageRaw, [...CACHED_WRITE_TOKEN_PATHS]);
    const cachedWrite5mTokens = cache.write5mTokens;
    const cachedWrite1hTokens = cache.write1hTokens;
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
        assignImplicitCacheRead(meters, card, cachedReadTokens, cacheHitIsExplicit(requestOptions, [cachedWriteTokens, cachedWrite5mTokens, cachedWrite1hTokens]));
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
    // Writes with no TTL detail were made with the TTL the request asked for
    // (cache_control.ttl, prompt_cache_retention); 5 minutes otherwise.
    const undividedWriteMeter = (): "cached_write_text_tokens_5m" | "cached_write_text_tokens_1h" => {
        const ttlHint = String(
            usageRaw?.cache_ttl ??
            usageRaw?.cache_ttl_seconds ??
            usageRaw?.context?.cache_ttl ??
            requestOptions?.cache_ttl ??
            "5m",
        ).trim().toLowerCase();
        return ttlHint === "1h" || ttlHint === "60m" || ttlHint === "3600"
            ? "cached_write_text_tokens_1h"
            : "cached_write_text_tokens_5m";
    };
    if (
        hasSplitCachedWriteRules &&
        typeof cachedWriteTokens === "number" &&
        typeof cachedWrite5mTokens !== "number" &&
        typeof cachedWrite1hTokens !== "number"
    ) {
        meters[undividedWriteMeter()] = cachedWriteTokens;
    }
    if (
        hasSplitCachedWriteRules &&
        (
            (meters.cached_write_text_tokens_5m ?? 0) > 0 ||
            (meters.cached_write_text_tokens_1h ?? 0) > 0
        )
    ) {
        // A write total above its TTL split still counts: a Claude stream's final message_delta
        // carries the cumulative cache_creation_input_tokens without the cache_creation split
        // (https://platform.claude.com/docs/en/build-with-claude/streaming), so writes made after
        // message_start are only in the total. They are billed at the 5-minute rate, not the
        // request TTL: server-tool writes can use 5 minutes even when the request asks for 1 hour
        // (https://platform.claude.com/docs/en/build-with-claude/prompt-caching).
        const unsplitWrites = (meters.cached_write_text_tokens ?? 0) -
            (meters.cached_write_text_tokens_5m ?? 0) -
            (meters.cached_write_text_tokens_1h ?? 0);
        if (unsplitWrites > 0) {
            meters.cached_write_text_tokens_5m = (meters.cached_write_text_tokens_5m ?? 0) + unsplitWrites;
        }
        delete meters.cached_write_text_tokens;
    }
    // OpenAI 30-minute / 12-hour writes (GPT-5.6+): see ./openai-cache-ttl.ts.
    applyOpenAICacheWriteTtlSplit(meters, card, cache);
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
    // Reads and writes that the provider counted inside input are billed on their own
    // meters, so they come out of the uncached input meter (OpenAI, Kimi, Alibaba). Anthropic
    // reports both on top of input, so nothing is subtracted there.
    const cachedTokensInsideInput =
        (cache.readSubset ? Math.max(0, cachedReadTokens ?? 0) : 0) +
        (cache.writeSubset ? Math.max(0, cache.writeTokens ?? 0) : 0);
    const inputTextMirrorsCanonical =
        typeof inputTextTokens === "number" &&
        typeof canonicalInputTokens === "number" &&
        inputTextTokens === canonicalInputTokens;

    const uncachedCanonicalInput = Math.max(0, canonicalInputTokens - cachedTokensInsideInput);
    // A reported input_text_tokens is the whole prompt only when it matches a separately
    // reported input total (with or without the cache taken out). Without such a total it
    // is taken as text alone.
    const reportedInputTotal = pickFirstFiniteNumber(usageRaw, [...REPORTED_INPUT_TOTAL_PATHS]);
    const inputTextCoversPrompt =
        meters.input_text_tokens == null ||
        (typeof reportedInputTotal === "number" &&
            (meters.input_text_tokens === reportedInputTotal ||
                meters.input_text_tokens === Math.max(0, reportedInputTotal - cachedTokensInsideInput)));
    if (meters.input_text_tokens == null) {
        meters.input_text_tokens = uncachedCanonicalInput;
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
    if (inputTextMirrorsCanonical && cachedTokensInsideInput > 0) {
        meters.input_text_tokens = Math.max(0, inputTextTokens - cachedTokensInsideInput);
    }

    // Anthropic 1M pricing thresholds are based on input + cache read + cache write tokens.
    context.long_context_input_tokens =
        (meters.input_text_tokens ?? 0) +
        (meters.implicit_cached_input_text_tokens ?? 0) +
        (meters.cached_read_text_tokens ?? 0) +
        (meters.cached_write_text_tokens ?? 0) +
        (meters.cached_write_text_tokens_5m ?? 0) +
        (meters.cached_write_text_tokens_1h ?? 0) +
        (meters.cached_write_text_tokens_30m ?? 0) +
        (meters.cached_write_text_tokens_12h ?? 0);
    // Prompt length for `input_tokens` tier conditions (Claude and Gemini long-context rates,
    // OpenAI's 272k tier): the reported input plus cache reads and writes the usage states
    // are reported outside it (Anthropic: "A request's prompt length counts all of its input
    // tokens, including cache reads and cache writes"). Counts with no stated relation to
    // input are not added, so a bare input_tokens still compares as reported.
    const outside = cacheCountsReportedOutsideInput(usageRaw, cache);
    context.prompt_input_tokens = (Number.isFinite(canonicalInputTokens) ? canonicalInputTokens : 0) +
        (outside.read ? Math.max(0, cachedReadTokens ?? 0) : 0) +
        (outside.write ? Math.max(0, cache.writeTokens ?? 0) : 0);

    logPricingDebug("splitUsage_output", {
        meters,
        context,
    });

    return { meters, context, inputTextCoversPrompt };
}

const INPUT_MODALITY_METERS: PricingDimensionKey[] = ["input_image_tokens", "input_audio_tokens", "input_video_tokens"];

/**
 * Image, audio and video prompt tokens are part of the provider's input total. When the card
 * prices a modality on its own meter, take those tokens out of input_text_tokens so they are
 * billed once, at the modality's rate. When it does not, they stay in input_text_tokens and
 * are billed as text, as before.
 */
function separatePricedInputModalities(
    meters: Record<string, number>,
    inputTextCoversPrompt: boolean,
    hasRule: (meter: PricingDimensionKey) => boolean,
): void {
    for (const meter of INPUT_MODALITY_METERS) {
        const quantity = meters[meter];
        if (typeof quantity !== "number" || !(quantity > 0)) continue;
        if (!inputTextCoversPrompt || !hasRule(meter)) continue;
        const text = meters.input_text_tokens ?? 0;
        const moved = Math.min(text, quantity);
        meters.input_text_tokens = text - moved;
    }
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

const UTC_DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

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
        const utcDay = UTC_DAY_KEYS[date.getUTCDay()];
        const matches = windows
            .map((window, index) => ({ window, index }))
            .filter(({ window }) => {
                if (!window || window.timezone !== "UTC") return false;
                if (window.days_of_week?.length && !window.days_of_week.includes(utcDay)) return false;
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
                    ...(matched.days_of_week?.length ? { days_of_week: matched.days_of_week } : {}),
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
    const unitSize = Number(rule.unit_size);
    if (!Number.isFinite(unitSize) || unitSize <= 0) {
        throw new Error("pricing_invalid_unit_size");
    }
    if (rule.currency && rule.currency.toUpperCase() !== "USD") {
        throw new Error("pricing_unsupported_currency");
    }
    const includedQuantity = Number.isFinite(rule.included_quantity)
        ? Math.max(0, Number(rule.included_quantity))
        : 0;
    const resolvedPrice = resolveRulePrice(rule, requestOptions);
    const numericPrice = Number(resolvedPrice.price_per_unit);
    if ((typeof resolvedPrice.price_per_unit !== "string" && typeof resolvedPrice.price_per_unit !== "number") ||
        String(resolvedPrice.price_per_unit).trim() === "" || !Number.isFinite(numericPrice) || numericPrice < 0) {
        throw new Error("pricing_invalid_unit_price");
    }
    // Pro-rate by unit size (e.g. 8 tokens at a per-1M-token rate).
    const billableQuantity = Math.max(0, qty - includedQuantity);
    const billableUnits = billableQuantity / unitSize;
    const unitPriceNanos = parseUsdToNanos(resolvedPrice.price_per_unit);
    // Catalogue prices keep digits below a nano (numeric(30,12) nanos), so price the line
    // exactly rather than from the unit price truncated to whole nanos.
    const exactLineNanos = priceLineNanosExact(billableQuantity, unitSize, resolvedPrice.price_per_unit);
    if (numericPrice > 0 && unitPriceNanos === 0 && exactLineNanos === null) {
        throw new Error("pricing_unit_price_below_precision");
    }
    // Keep nanos integral to avoid floating precision drift downstream.
    const lineNanos = exactLineNanos ?? Math.round(billableUnits * unitPriceNanos);
    if (!Number.isSafeInteger(unitPriceNanos) || !Number.isSafeInteger(lineNanos) || lineNanos < 0) {
        throw new Error("pricing_amount_out_of_range");
    }

    logPricingDebug("priceWithRule", {
        quantity: qty,
        includedQuantity,
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
        unitPriceUsd: formatUsdPriceExact(resolvedPrice.price_per_unit),
        lineCostUsd: formatUsdFromNanosExact(lineNanos),
        lineNanos,
        billingTimestampBasis: resolvedPrice.billing_timestamp_basis,
        billingTimestampBasisConfigured: resolvedPrice.billing_timestamp_basis_configured,
        billingTimestampMs: resolvedPrice.billing_timestamp_ms,
        pricingTimeWindow: resolvedPrice.pricing_time_window,
    };
}

type CachePricingFallback = NonNullable<PricingResult["cache_pricing_fallback"]>[number];

type PricingJob = {
    dim: PricingDimensionKey;
    qty: number;
    context: Record<string, any>;
    /** Meter whose rules price this quantity, when it is not `dim` itself. */
    ruleMeter?: PricingDimensionKey;
};

function rulesReferenceCacheTtl(card: PriceCard, meter: string): boolean {
    return card.rules.some((rule) =>
        rule.meter === meter &&
        Array.isArray(rule.match) &&
        rule.match.some((condition: any) => condition?.path === "cache_ttl"),
    );
}

/**
 * One pricing job per meter, except cache writes: a write rule keyed on `cache_ttl` is
 * matched against the TTL the provider reported for those tokens (5-minute or 1-hour split),
 * and defaults to 5 minutes, Anthropic's default, when neither the usage nor the request
 * names one.
 */
function buildPricingJobs(
    card: PriceCard,
    dims: PricingDimensionKey[],
    meters: Record<string, number>,
    matchContext: Record<string, any>,
    oneHourAtOwnRate = false,
): PricingJob[] {
    const jobs: PricingJob[] = [];
    const requestTtl = typeof matchContext.cache_ttl === "string" && matchContext.cache_ttl.trim()
        ? matchContext.cache_ttl
        : undefined;
    const withTtl = (ttl: string) => ({ ...matchContext, cache_ttl: ttl });
    const answerAtThinkingPrice = thinkingModeBillsAnswer(card, meters);
    for (const dim of dims) {
        const qty = meters[dim];
        if (!qty || qty <= 0) continue;
        if (dim === "output_text_tokens" && answerAtThinkingPrice) {
            jobs.push({ dim, qty, context: matchContext, ruleMeter: "output_reasoning_tokens" });
            continue;
        }
        if (dim === "cached_write_text_tokens_5m" || dim === "cached_write_text_tokens_1h") {
            jobs.push({ dim, qty, context: withTtl(dim.endsWith("_1h") ? "1h" : "5m") });
            continue;
        }
        if (dim === "cached_write_text_tokens" && rulesReferenceCacheTtl(card, dim)) {
            const write5m = Math.max(0, meters.cached_write_text_tokens_5m ?? 0);
            const write1h = Math.max(0, meters.cached_write_text_tokens_1h ?? 0);
            if (write5m + write1h > 0 && write5m + write1h <= qty) {
                const fiveMinuteQty = qty - write1h;
                if (fiveMinuteQty > 0) jobs.push({ dim, qty: fiveMinuteQty, context: withTtl("5m") });
                if (write1h > 0) jobs.push({ dim, qty: write1h, context: withTtl("1h") });
                continue;
            }
            jobs.push({ dim, qty, context: requestTtl ? matchContext : withTtl("5m") });
            continue;
        }
        if (dim === "cached_write_text_tokens" && oneHourAtOwnRate) {
            // The 1-hour writes are priced on their own meter (see oneHourWritesNeedOwnRate).
            const rest = qty - Math.max(0, meters.cached_write_text_tokens_1h ?? 0);
            if (rest > 0) jobs.push({ dim, qty: rest, context: matchContext });
            continue;
        }
        jobs.push({ dim, qty, context: matchContext });
    }
    return jobs;
}

/**
 * Whether 1-hour writes must leave a card's single write row. A card whose only write row is
 * one `cached_write_text_tokens` rate, not keyed on `cache_ttl`, holds the provider's 5-minute
 * price where the provider documents a higher 1-hour price (Claude: 1.25x and 2x input,
 * https://platform.claude.com/docs/en/build-with-claude/prompt-caching#pricing). Writes the
 * usage reports as 1-hour are then billed at the documented 1-hour rate through the cache
 * fallback, not at the 5-minute row.
 */
function oneHourWritesNeedOwnRate(card: PriceCard, meters: Record<string, number>): boolean {
    const write1h = meters.cached_write_text_tokens_1h ?? 0;
    const aggregate = meters.cached_write_text_tokens ?? 0;
    if (!(write1h > 0) || !(aggregate > 0)) return false;
    if ((meters.cached_write_text_tokens_5m ?? 0) + write1h > aggregate) return false;
    if (card.rules.some((rule) => rule.meter === "cached_write_text_tokens_1h" || rule.meter === "cached_write_text_tokens_5m")) return false;
    if (rulesReferenceCacheTtl(card, "cached_write_text_tokens")) return false;
    return cacheWriteFallbackMultiplier(card, "cached_write_text_tokens_1h") !==
        cacheWriteFallbackMultiplier(card, "cached_write_text_tokens");
}

/**
 * Documented cache-write price as a multiple of the input price, for routes whose card has
 * no write row. Claude (every platform): 5-minute writes 1.25x, 1-hour writes 2x. OpenAI and
 * Azure GPT-5.6+ and Alibaba explicit cache: 1.25x. Kimi K3: 5-minute writes 1x, 1-hour 2x.
 * OpenAI 12-hour writes, on any route: 2.5x. Anything else: 1x.
 */
function cacheWriteFallbackMultiplier(card: PriceCard, meter: string): number {
    const provider = String(card.provider ?? "").toLowerCase();
    const model = String(card.model ?? "").toLowerCase();
    if (meter === OPENAI_CACHE_WRITE_12H_METER) return OPENAI_CACHE_WRITE_12H_INPUT_MULTIPLIER;
    const isOneHour = meter === "cached_write_text_tokens_1h";
    if (model.includes("claude")) return isOneHour ? 2 : 1.25;
    if (provider.startsWith("moonshotai") || model.includes("kimi-k3")) return isOneHour ? 2 : 1;
    if (provider === "openai" || provider === "openai-eu" || provider === "azure" || provider.startsWith("alibaba")) {
        return 1.25;
    }
    return 1;
}

function scaleUsdPrice(price: string | number, multiplier: number): string {
    if (multiplier === 1) return String(price);
    return formatUsdFromNanosExact(Math.round(parseUsdToNanos(String(price)) * multiplier));
}

/**
 * Price a cache meter with no matching rule from the route's ordinary input rule: reads at
 * the input rate, writes at the input rate times the documented write multiplier. Mirrors
 * the audio cached-read fallback in after/pricing.ts.
 */
function cacheMeterFallbackRule(
    card: PriceCard,
    meter: PricingDimensionKey,
    pricingPlan: string,
    matchContext: Record<string, any>,
    basePlan = "standard",
): { rule: PriceRule; inputRule: PriceRule; multiplier: number } | null {
    if (!CACHE_METERS.has(meter)) return null;
    const inputMeters: PricingDimensionKey[] = meter.includes("image")
        ? ["input_image_tokens", "input_text_tokens", "input_tokens"]
        : meter.includes("audio")
            ? ["input_audio_tokens", "input_text_tokens", "input_tokens"]
            : meter.includes("video")
                ? ["input_video_tokens", "input_text_tokens", "input_tokens"]
                : ["input_text_tokens", "input_tokens"];
    const plans = pricingPlan === basePlan ? [basePlan] : [pricingPlan, basePlan];
    for (const plan of plans) {
        for (const inputMeter of inputMeters) {
            const candidates = card.rules
                .filter((rule) => rule.pricing_plan === plan && rule.meter === inputMeter)
                .filter((rule) => matchesConditions(rule.match, matchContext));
            const inputRule = selectBestRule(candidates, matchContext)?.rule;
            if (!inputRule) continue;
            const multiplier = meter.startsWith("cached_write") ? cacheWriteFallbackMultiplier(card, meter) : 1;
            return {
                inputRule,
                multiplier,
                rule: {
                    ...inputRule,
                    meter,
                    included_quantity: undefined,
                    price_per_unit: scaleUsdPrice(inputRule.price_per_unit, multiplier),
                    time_windows: inputRule.time_windows?.map((window) => ({
                        ...window,
                        price_per_unit: window.price_per_unit == null
                            ? window.price_per_unit
                            : scaleUsdPrice(window.price_per_unit, multiplier),
                    })),
                    id: `${inputRule.id ?? inputMeter}:cache_fallback:${meter}`,
                },
            };
        }
    }
    return null;
}

/** Main public API -- build a full pricing summary from raw usage. */
export function computeBillSummary(
    usageRaw: Record<string, any>,
    cardInput: PriceCard,
    requestOptions?: Record<string, any>,
    requestedPricingPlan: string = "standard"
): PricingResult {
    // Cards from either loader may still name the fast tier `fast`; the engine prices it as `priority`.
    const card = normalizePriceCardPlans(cardInput);
    // A 1-hour TTL is removed before the request reaches a route that only caches for 5 minutes
    // (see execute/cacheTtl.ts), so its writes are priced as 5-minute writes.
    if (requestOptions?.cache_ttl && cacheTtlUnsupported(String(card.provider ?? ""), [card.model])) {
        requestOptions = { ...requestOptions, cache_ttl: "5m" };
    }
    if (card.currency && card.currency.toUpperCase() !== "USD") {
        throw new Error("pricing_unsupported_currency");
    }
    // A card without standard rules sells its ordinary price under a provider label
    // (DeepInfra `default`, Xiaomi `early_access`) or as `free`; that plan stands in for standard.
    const basePlan = resolveBasePricingPlan(card) ?? "standard";
    const requestedPlan = canonicalPricingPlan(requestedPricingPlan);
    const pricingPlan = requestedPlan === "standard" ? basePlan : requestedPlan;
    // A card for another service tier is not a free price card. Check before
    // walking meters, which may include informational, non-billable counters.
    if (requiresExplicitServiceTier(card) && !card.rules.some((rule) => rule.pricing_plan === pricingPlan)) {
        throw new Error(`pricing_plan_missing:${pricingPlan}`);
    }
    const { meters, context: usageContext, inputTextCoversPrompt } = splitUsage(usageRaw, card, requestOptions);
    const ctx = { ...(requestOptions ?? {}), ...(usageContext ?? {}) };
    {
        const modalityContext = { ...ctx, ...meters };
        const ruleMatches = (plan: string, meter: PricingDimensionKey) =>
            card.rules.some((rule) =>
                rule.pricing_plan === plan && rule.meter === meter && matchesConditions(rule.match, modalityContext),
            );
        // Mirrors the rule selection in the meter loop below, so a modality only leaves
        // input_text_tokens when the loop will price it.
        separatePricedInputModalities(meters, inputTextCoversPrompt, (meter) => {
            if (ruleMatches(pricingPlan, meter)) return true;
            if (pricingPlan === "standard") return false;
            const planDefinesMeter = card.rules.some((rule) => rule.pricing_plan === pricingPlan && rule.meter === meter);
            if (planDefinesMeter) return pricingPlan !== "batch";
            return ruleMatches("standard", meter);
        });
    }

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
    const unmatchedConfiguredMeters: string[] = [];
    const missingRequiredCacheMeters: string[] = [];
    // Tier conditions on `input_tokens` compare the full prompt length; the input_tokens
    // meter itself is still billed at its reported quantity.
    const promptInputTokens = Number(usageContext?.prompt_input_tokens);
    const matchContext = {
        ...ctx,
        ...meters,
        ...(Number.isFinite(promptInputTokens) && promptInputTokens > (meters.input_tokens ?? 0)
            ? { input_tokens: promptInputTokens }
            : {}),
    };

    const findCandidatesForPlanAndMeter = (
        plan: string,
        meter: PricingDimensionKey,
        context: Record<string, any> = matchContext,
    ): PriceRule[] =>
        card.rules
            .filter((r) => r.pricing_plan === plan && r.meter === meter)
            .filter((r) => matchesConditions(r.match, context))
			.sort((a, b) => effectiveRulePriority(b) - effectiveRulePriority(a));

    const oneHourAtOwnRate = oneHourWritesNeedOwnRate(card, meters);
    for (const job of buildPricingJobs(card, dims, meters, matchContext, oneHourAtOwnRate)) {
        const { dim, qty, context: jobContext } = job;
        const ruleMeter = job.ruleMeter ?? dim;

        // choose the highest priority rule for this meter that matches plan + conditions
        let candidates = findCandidatesForPlanAndMeter(pricingPlan, ruleMeter, jobContext);
        let resolvedPlan = pricingPlan;
        let conservativeCoverageFallback = false;
        if (!candidates.length && pricingPlan !== basePlan) {
            const requestedPlanDefinesMeter = card.rules.some(
                (rule) => rule.pricing_plan === pricingPlan && rule.meter === ruleMeter,
            );
            // Batch settlement must retain the hold when its pricing dimensions
            // do not match. Selecting an unrelated tier can charge the wrong rate.
            if (requestedPlanDefinesMeter && pricingPlan !== "batch") {
                candidates = card.rules
                    .filter((rule) =>
                        (rule.pricing_plan === pricingPlan || rule.pricing_plan === basePlan) &&
                        rule.meter === ruleMeter,
                    )
                    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
                conservativeCoverageFallback = true;
                logPricingDebug("meter_plan_coverage_fallback", {
                    meter: dim,
                    quantity: qty,
                    requestedPricingPlan: pricingPlan,
                    fallbackPricingPlan: basePlan,
                    candidateRuleIds: candidates.map((r) => r.id),
                });
            }
            if (conservativeCoverageFallback) {
                resolvedPlan = pricingPlan;
            } else if (!requestedPlanDefinesMeter || pricingPlan !== "batch") {
                const fallbackCandidates = findCandidatesForPlanAndMeter(basePlan, ruleMeter, jobContext);
                if (fallbackCandidates.length) {
                    candidates = fallbackCandidates;
                    resolvedPlan = basePlan;
                    logPricingDebug("meter_plan_fallback", {
                        meter: dim,
                        quantity: qty,
                        requestedPricingPlan: pricingPlan,
                        candidateRuleIds: candidates.map((rule) => rule.id),
                    });
                }
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

        const selectionSummary = analyzeRuleSelection(candidates, jobContext);

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
				priority: effectiveRulePriority(r),
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
            // Cache usage is a distinct upstream cost. Never silently fold or
            // discard it when an effective card is incomplete.
            if (CACHE_METERS.has(dim)) {
                missingRequiredCacheMeters.push(dim);
            } else if (card.rules.some((rule) => rule.meter === ruleMeter)) {
                unmatchedConfiguredMeters.push(dim);
            }
            continue;
        }

        // Bill all quantity using the selected rule
        const rule = conservativeCoverageFallback
            ? candidates.reduce((selected, candidate) => {
                const selectedPrice = priceWithRule(qty, selected, requestOptions);
                const candidatePrice = priceWithRule(qty, candidate, requestOptions);
                return candidatePrice.lineNanos > selectedPrice.lineNanos ? candidate : selected;
            })
            : selectionSummary.selection?.rule ?? candidates[0];
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
				priority: effectiveRulePriority(rule),
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
            bill_mode: (rule.included_quantity ?? 0) > 0 ? "over" : "all",
            included_quantity: rule.included_quantity,
			rule_priority: effectiveRulePriority(rule),
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

    // A partial bill (even a free matched line) cannot cover unmatched usage.
    // Preserve the empty-lines sentinel: async callers use it to reject
    // reservations or retain holds when there is no matching price at all.
	const hasPricedAggregateCacheWrite = lines.some((line) => line.dimension === "cached_write_text_tokens");
	const hasPricedImplicitCacheRead = lines.some((line) => line.dimension === "implicit_cached_input_text_tokens");
	// 1-hour writes taken out of the aggregate row are priced on their own meter.
	const ownRateMeter = (meter: string) => oneHourAtOwnRate && meter === "cached_write_text_tokens_1h";
	let effectiveMissingCacheMeters = missingRequiredCacheMeters.filter((meter) =>
		!(hasPricedAggregateCacheWrite && cacheMeterCanUseAggregate(meter, meters) && !ownRateMeter(meter)) &&
		!(meter === "cached_read_text_tokens" && hasPricedImplicitCacheRead)
	);
	// With no write rule at all, price the TTL split rather than the aggregate so 1-hour
	// writes get their own multiplier and nothing is billed twice.
	if (
		effectiveMissingCacheMeters.includes("cached_write_text_tokens") &&
		((meters.cached_write_text_tokens_5m ?? 0) > 0 || (meters.cached_write_text_tokens_1h ?? 0) > 0) &&
		effectiveMissingCacheMeters.some((meter) => meter === "cached_write_text_tokens_5m" || meter === "cached_write_text_tokens_1h")
	) {
		effectiveMissingCacheMeters = effectiveMissingCacheMeters.filter((meter) => meter !== "cached_write_text_tokens");
	}
	const cachePricingFallback: CachePricingFallback[] = [];
	const unpricedCacheMeters: string[] = [];
	for (const meter of effectiveMissingCacheMeters) {
		const qty = meters[meter];
		// A priced aggregate write smaller than its own TTL split is inconsistent usage;
		// pricing the split on top would bill the same writes twice.
		const fallback = hasPricedAggregateCacheWrite && !ownRateMeter(meter) &&
			(meter === "cached_write_text_tokens_5m" || meter === "cached_write_text_tokens_1h")
			? null
			: cacheMeterFallbackRule(card, meter as PricingDimensionKey, pricingPlan, matchContext, basePlan);
		if (!fallback) {
			unpricedCacheMeters.push(meter);
			continue;
		}
		const priced = priceWithRule(qty, fallback.rule, requestOptions);
		lines.push({
			dimension: meter as PricingDimensionKey,
			quantity: qty,
			billable_units: priced.billableUnits,
			unit_size: fallback.rule.unit_size,
			unit_price_usd: priced.unitPriceUsd,
			line_cost_usd: priced.lineCostUsd,
			line_nanos: priced.lineNanos,
			bill_mode: "all",
			rule_priority: effectiveRulePriority(fallback.rule),
			rule_id: fallback.rule.id,
			billing_timestamp_basis: priced.billingTimestampBasis,
			billing_timestamp_basis_configured: priced.billingTimestampBasisConfigured,
			billing_timestamp_ms: priced.billingTimestampMs,
			billing_timestamp_iso: priced.billingTimestampMs === null
				? null
				: new Date(priced.billingTimestampMs).toISOString(),
			pricing_time_window: priced.pricingTimeWindow,
			pricing_fallback: "input_rate",
		});
		cachePricingFallback.push({
			meter,
			quantity: qty,
			input_meter: fallback.inputRule.meter,
			input_rule_id: fallback.inputRule.id ?? null,
			multiplier: fallback.multiplier,
		});
	}
	if (cachePricingFallback.length > 0) {
		// A missing cache price row is a catalogue gap, not a reason to fail a request the
		// provider has already charged for. Bill at the input rate and make the gap visible.
		console.warn("[pricing] cache meter priced at input-rate fallback", {
			provider: card.provider,
			model: card.model,
			pricing_plan: pricingPlan,
			fallback: cachePricingFallback,
		});
	}
    if (unpricedCacheMeters.length > 0) {
		throw new Error(`pricing_rule_missing:${unpricedCacheMeters.join(",")}`);
    }
    if (lines.length > 0 && unmatchedConfiguredMeters.length > 0) {
        throw new Error(`pricing_rule_missing:${unmatchedConfiguredMeters.join(",")}`);
    }
    const totalNanos = lines.reduce((sum, line: any) => sum + (line.line_nanos ?? parseUsdToNanos(line.line_cost_usd)), 0);
    if (!Number.isSafeInteger(totalNanos)) throw new Error("pricing_amount_out_of_range");
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
        ...(cachePricingFallback.length > 0 ? { cache_pricing_fallback: cachePricingFallback } : {}),
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
        ...(line.pricing_fallback ? { pricing_fallback: line.pricing_fallback } : {}),
    }));

    return {
        ...usageRaw,
        pricing: {
            total_nanos: totalNanos,
            total_usd_str,
            total_cents: total_cents_floor,
            currency: "USD",
            lines: slimLines,
            ...(summary.cache_pricing_fallback ? { cache_pricing_fallback: summary.cache_pricing_fallback } : {}),
        },
    };
}
