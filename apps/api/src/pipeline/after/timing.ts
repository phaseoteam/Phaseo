import type { PipelineContext } from "../before/types";

/** Receipt to the first upstream dispatch, including admission and request construction.
 * Do not infer this from end-to-end time: retries and provider waits would be included.
 */
export function buildResponseTimeline(ctx?: PipelineContext | null) {
	const value = ctx?.meta.timeToUpstreamRequestMs;
	const startedAt = ctx?.meta.startedAtMs;
	const valid = typeof value === "number" && Number.isFinite(value) && value >= 0;
	return {
		version: 1,
		routing_ms: valid ? Math.round(value) : null,
		failover_ms: resolveFailoverMs(ctx),
		// Allows retry intervals to exclude preparation already shown as routing.
		...(valid && typeof startedAt === "number" && Number.isFinite(startedAt)
			? { first_dispatch_at_ms: startedAt + value } : {}),
	};
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
			reasoningTokens: finiteOrNull(round.usage?.reasoningTokens),
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
