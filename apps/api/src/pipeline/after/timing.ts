import type { PipelineContext } from "../before/types";

/** Receipt to the first upstream dispatch, including admission and request construction.
 * Do not infer this from end-to-end time: retries and provider waits would be included.
 */
export function buildResponseTimeline(ctx?: PipelineContext | null) {
	const value = ctx?.meta.timeToUpstreamRequestMs;
	const startedAt = ctx?.meta.startedAtMs;
	const valid = typeof value === "number" && Number.isFinite(value) && value >= 0;
	const steps = buildRoutingSteps(ctx);
	const unattributed = valid ? resolveUnattributedRoutingMs(value, ctx) : null;
	return {
		version: 1,
		routing_ms: valid ? Math.round(value) : null,
		...(unattributed !== null ? { unattributed_ms: unattributed } : {}),
		failover_ms: resolveFailoverMs(ctx),
		// Allows retry intervals to exclude preparation already shown as routing.
		...(valid && typeof startedAt === "number" && Number.isFinite(startedAt)
			? { first_dispatch_at_ms: startedAt + value } : {}),
		...(steps ? { steps } : {}),
	};
}

/**
 * Stored name → timer span, for the work done between receipt and the first dispatch. Each value
 * is that step's own duration in ms. Steps can overlap: context, workspace policy and testing mode
 * run in parallel, and the context_* steps are parts of `context`. Do not add them up.
 */
const ROUTING_STEP_SPANS = {
	admission: "admission", // receipt to pipeline entry (admission middleware)
	before: "before_start", // the whole before-request phase
	auth: "guardAuth",
	parse: "guardJson",
	validate: "guardZod",
	model: "guardModel",
	context: "guardContext",
	context_fetch: "context_total", // loading the context (cache or database), without the spend-limit wait
	context_preset_access: "context_preset_access",
	context_private_model: "context_private_model",
	context_cache_read: "context_cache_read",
	context_catalog_read: "context_catalog_read",
	context_key_version: "context_key_version",
	context_credit_refresh: "context_credit_refresh",
	context_db: "context_rpc", // the gateway context RPC on a cache miss
	context_enrich: "context_enrich",
	context_byok: "context_byok_hydration",
	context_cache_write: "context_cache_write",
	context_spend_limit: "context_spend_limit", // waiting for the spend-limit Durable Object (enforce mode)
	workspace_policy: "fetchWorkspacePolicy",
	testing_mode: "resolveTestingMode",
	capabilities: "validateCapabilities",
	decode: "ir_decode",
	candidates: "execute_guard_candidates",
	modalities: "execute_filter_modalities",
	spend_rules: "execute_spend_rule_blocks",
	pricing: "execute_guard_pricing",
	ranking: "execute_rank_providers",
	// Not ir_encode: it times encoding the provider's response, after dispatch.
	// After "before", up to the first upstream fetch (text surfaces). Only the first provider
	// attempt is shown; a later attempt's preparation is in failover_ms or unattributed_ms.
	before_to_execute: "before_to_execute", // end of before to execute start: protocol, decode, response cache
	protocol: "protocol_detect",
	response_cache: "response_cache_lookup",
	execute_to_attempt: "execute_to_attempt", // execute start to the first attempt: candidates … ranking, credential plan
	attempt_to_executor: "attempt_1_to_executor", // first attempt start to its executor call: the attempt_* steps below
	attempt_price_card: "attempt_1_load_pricecard",
	attempt_rate_limit_policies: "attempt_1_rate_limit_policies",
	attempt_free_quota: "attempt_1_free_customer_quota", // free models only
	attempt_free_quota_limits: "attempt_1_free_quota_limits", // part of attempt_free_quota: customer limits read
	attempt_free_quota_counter: "attempt_1_free_quota_counter", // part of attempt_free_quota: rate-limit Durable Object
	attempt_breaker: "attempt_1_breaker",
	attempt_resolve_executor: "attempt_1_resolve_executor",
	attempt_normalize: "attempt_1_normalize_ir",
	attempt_prompt_cache_key: "attempt_1_prompt_cache_key",
	attempt_executor_to_dispatch: "attempt_1_executor_to_dispatch", // executor call to its first fetch
	attempt_request_build: "attempt_1_request_build", // part of attempt_executor_to_dispatch, as the executor reports it
} as const;

/**
 * Contiguous segments from receipt to the first attempt's first fetch. They do not overlap, so
 * routing_ms minus their sum is time no step accounts for (pipeline entry, small gaps).
 */
const SEQUENTIAL_ROUTING_SPANS = [
	"admission",
	"before_start",
	"before_to_execute",
	"execute_to_attempt",
	"attempt_1_to_executor",
	"attempt_1_executor_to_dispatch",
] as const;

/**
 * routing_ms minus the sequential chain, in ms. Null unless every segment was timed, which means
 * the first dispatch was the first attempt's on a text surface; otherwise the chain is incomplete
 * and the difference would not mean anything.
 */
export function resolveUnattributedRoutingMs(routingMs: number, ctx?: PipelineContext | null): number | null {
	const timing = ctx?.timing;
	if (!timing) return null;
	let sum = 0;
	for (const span of SEQUENTIAL_ROUTING_SPANS) {
		const ms = timing[span];
		if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
		sum += ms;
	}
	return Math.round(Math.max(0, routingMs - sum) * 10) / 10;
}

type RoutingSteps = Partial<Record<keyof typeof ROUTING_STEP_SPANS, number>> & { context_cache?: string };

/** Per-step routing time from the request's timer snapshot, or null when there is none. */
export function buildRoutingSteps(ctx?: PipelineContext | null): RoutingSteps | null {
	const timing = ctx?.timing;
	if (!timing) return null;
	const steps: RoutingSteps = {};
	for (const [key, span] of Object.entries(ROUTING_STEP_SPANS) as Array<[keyof typeof ROUTING_STEP_SPANS, string]>) {
		const ms = timing[span];
		if (typeof ms === "number" && Number.isFinite(ms) && ms >= 0) steps[key] = Math.round(ms * 10) / 10;
	}
	const cache = ctx?.meta?.beforeContextCacheStatus;
	if (typeof cache === "string") steps.context_cache = cache;
	return Object.keys(steps).length > 0 ? steps : null;
}

/** First upstream dispatch to the selected one: time spent on failed provider attempts.
 * Zero when the first attempt was selected; null when either dispatch clock is missing.
 */
export function resolveFailoverMs(ctx?: PipelineContext | null): number | null {
	const rounds = finiteOrNull(ctx?.meta.providerRoundsFailoverMs);
	const current = currentRoundFailoverMs(ctx);
	if (rounds === null) return current;
	return rounds + (current ?? 0);
}

function currentRoundFailoverMs(ctx?: PipelineContext | null): number | null {
	const first = ctx?.meta.upstreamFetchStartMs;
	const selected = ctx?.meta.selectedUpstreamFetchStartMs;
	if (typeof first !== "number" || !Number.isFinite(first)) return null;
	if (typeof selected !== "number" || !Number.isFinite(selected)) return null;
	return Math.max(0, Math.round(selected - first));
}

function finiteOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Records provider timing for a response the gateway read to the end before
 * replying: a buffered response, a stream materialised for a non-streaming
 * client, or one server-tool round. It uses the selected dispatch time that
 * the shared upstream tracker records for every provider, so it never depends
 * on what an executor reports.
 *
 * Rounds add up. Generation is the provider time of every round, failover is
 * summed per round, and provider TTFT is the first round's first output.
 * Without a dispatch clock, the executor's own figures are left as they are.
 */
export function recordProviderRound(
	ctx: PipelineContext,
	round: {
		completedAtMs?: number;
		firstOutputAtMs?: number | null;
		/** The first output was streamed reasoning, so reasoning tokens are inside the window. */
		reasoningStreamed?: boolean;
		/** Separate moments output arrived in the round, when counted. */
		outputArrivals?: number | null;
		/** The round's own usage, before it is added to earlier rounds. */
		usage?: { outputTokens?: number; reasoningTokens?: number } | null;
	} = {},
): void {
	const dispatchAtMs = finiteOrNull(ctx.meta.selectedUpstreamFetchStartMs);
	if (dispatchAtMs === null) return;
	const completedAtMs = round.completedAtMs ?? Date.now();
	const roundMs = Math.max(0, Math.round(completedAtMs - dispatchAtMs));
	// Output speed of a multi-round response is the last round's: earlier rounds'
	// tool time and the next round's wait are not output time.
	const roundFirstOutputAtMs = finiteOrNull(round.firstOutputAtMs);
	ctx.meta.lastProviderRoundSpeedWindow = roundFirstOutputAtMs === null
		? null
		: {
			durationMs: Math.max(0, Math.round(completedAtMs - roundFirstOutputAtMs)),
			outputTokens: finiteOrNull(round.usage?.outputTokens) ?? 0,
			reasoningTokens: round.reasoningStreamed ? null : finiteOrNull(round.usage?.reasoningTokens),
			arrivals: finiteOrNull(round.outputArrivals),
		};
	ctx.meta.providerRoundsMs = (finiteOrNull(ctx.meta.providerRoundsMs) ?? 0) + roundMs;
	ctx.meta.providerRoundsFailoverMs =
		(finiteOrNull(ctx.meta.providerRoundsFailoverMs) ?? 0) + (currentRoundFailoverMs(ctx) ?? 0);
	ctx.meta.generation_ms = ctx.meta.providerRoundsMs;
	// The next round measures its failover from its own first dispatch.
	delete (ctx.meta as Record<string, unknown>).upstreamFetchStartMs;

	if (finiteOrNull(ctx.meta.provider_ttft_ms) !== null) return;
	const firstOutputAtMs = finiteOrNull(round.firstOutputAtMs);
	if (firstOutputAtMs === null) {
		// A buffered executor reports first output relative to the selected dispatch.
		const reported = finiteOrNull(ctx.meta.latency_ms);
		if (reported !== null && reported > 0 && reported <= roundMs) ctx.meta.provider_ttft_ms = Math.round(reported);
		return;
	}
	ctx.meta.firstProviderOutputAtMs = firstOutputAtMs;
	const ttftMs = Math.max(1, Math.round(firstOutputAtMs - dispatchAtMs));
	ctx.meta.provider_ttft_ms = ttftMs;
	ctx.meta.latency_ms = ttftMs;
}

/**
 * The output-speed window for a synthetic stream (a server-tool loop): the last
 * provider round's. Undefined for other responses, which measure from provider
 * TTFT to the end of the provider stream.
 */
export function resolveOutputSpeedWindow(ctx: PipelineContext) {
	if (!ctx.meta.preserve_stream_timing) return undefined;
	return ctx.meta.lastProviderRoundSpeedWindow ?? null;
}

function readTimingMetric(ctx: PipelineContext, key: string): number | null {
	const timing = (ctx as any)?.timing;
	if (!timing || typeof timing !== "object") return null;
	const value = timing[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function resolveBeforeLatencyMs(ctx: PipelineContext): number {
	const fromMeta = ctx.meta.before_ms;
	if (typeof fromMeta === "number" && Number.isFinite(fromMeta)) return fromMeta;

	const nested = (ctx as any)?.timing?.before?.total_ms;
	if (typeof nested === "number" && Number.isFinite(nested)) return nested;

	return readTimingMetric(ctx, "before_start") ?? 0;
}

export function resolveExecuteTotalLatencyMs(ctx: PipelineContext): number | null {
	const nested = (ctx as any)?.timing?.execute?.total_ms;
	if (typeof nested === "number" && Number.isFinite(nested)) return nested;

	return readTimingMetric(ctx, "adapter_start");
}

export function resolveNonStreamLatencyMs(
	ctx: PipelineContext,
	_generationMs: number | null | undefined,
): number | null {
	if (typeof ctx.meta.latency_ms === "number" && Number.isFinite(ctx.meta.latency_ms)) {
		return ctx.meta.latency_ms;
	}
	return null;
}
