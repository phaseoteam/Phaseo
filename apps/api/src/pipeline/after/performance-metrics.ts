export type OutputPerformanceMetrics = {
	effectiveThroughputTps: number | null;
	outputSpeedTps: number | null;
	tpotMs: number | null;
	itlMs: number | null;
	phaseoOverheadMs: number | null;
};

/**
 * The stretch of output that output speed is measured over: from the first
 * generated output to the end of the response.
 */
export type OutputSpeedWindow = {
	durationMs: number | null;
	outputTokens: number;
	reasoningTokens?: number | null;
	/**
	 * Separate network reads that carried output. Unknown (undefined or null)
	 * when the path does not count them.
	 */
	arrivals?: number | null;
};

function finiteNonNegative(value: number | null | undefined): number | null {
	return value != null && Number.isFinite(value) ? Math.max(0, value) : null;
}

/**
 * Output speed and time per output token after the first generated output.
 *
 * Provider TTFT is the first visible output, so reasoning the provider did
 * before it is not part of the window. Usage counts reasoning inside output
 * tokens, so it is taken out here.
 *
 * There is no speed limit: a model that streams fast gets its real figure. Speed
 * is unmeasurable only when the output arrived in one network read (the provider
 * held the answer and sent it at once) or took no measurable time.
 */
export function calculateOutputSpeed(window: OutputSpeedWindow | null): {
	outputSpeedTps: number | null;
	tpotMs: number | null;
} {
	const none = { outputSpeedTps: null, tpotMs: null };
	if (!window) return none;
	const arrivals = finiteNonNegative(window.arrivals);
	if (arrivals !== null && arrivals < 2) return none;
	const durationMs = finiteNonNegative(window.durationMs);
	if (durationMs === null || durationMs <= 0) return none;
	const outputTokens = finiteNonNegative(window.outputTokens) ?? 0;
	const reasoningTokens = finiteNonNegative(window.reasoningTokens) ?? 0;
	const visibleTokens = Math.max(0, outputTokens - reasoningTokens);
	const postFirstTokenCount = visibleTokens - 1;
	if (postFirstTokenCount <= 0) return none;
	const tpotMs = durationMs / postFirstTokenCount;
	return { outputSpeedTps: 1000 / tpotMs, tpotMs };
}

export function calculateOutputPerformanceMetrics(args: {
	outputTokens: number;
	/** Reasoning tokens included in outputTokens. */
	reasoningTokens?: number | null;
	providerDurationMs: number | null;
	providerTtftMs: number | null;
	gatewayE2eMs: number | null;
	/** Time spent on failed provider attempts; provider time, not Phaseo's. */
	failoverMs?: number | null;
	/** Separate network reads that carried output, when the stream counted them. */
	outputArrivals?: number | null;
	/**
	 * Measure output speed over this window instead of provider duration after
	 * TTFT, for example the final round of a server-tool loop. Null means the
	 * speed was not measurable.
	 */
	speedWindow?: OutputSpeedWindow | null;
}): OutputPerformanceMetrics {
	const outputTokens = Number.isFinite(args.outputTokens)
		? Math.max(0, args.outputTokens)
		: 0;
	const providerDurationMs = finiteNonNegative(args.providerDurationMs);
	const providerTtftMs =
		args.providerTtftMs != null && Number.isFinite(args.providerTtftMs) && args.providerTtftMs > 0
			? args.providerTtftMs
			: null;
	const gatewayE2eMs = finiteNonNegative(args.gatewayE2eMs);
	const failoverMs = finiteNonNegative(args.failoverMs) ?? 0;
	const speed = calculateOutputSpeed(
		args.speedWindow !== undefined
			? args.speedWindow
			: providerDurationMs != null && providerTtftMs != null
				? {
					durationMs: providerDurationMs - providerTtftMs,
					outputTokens,
					reasoningTokens: args.reasoningTokens,
					arrivals: args.outputArrivals,
				}
				: null,
	);

	return {
		effectiveThroughputTps:
			providerDurationMs != null && providerDurationMs > 0 && outputTokens > 0
				? outputTokens / (providerDurationMs / 1000)
				: null,
		outputSpeedTps: speed.outputSpeedTps,
		tpotMs: speed.tpotMs,
		// ITL is populated from observed content-bearing stream-frame intervals.
		// Request-level token counts cannot produce a distinct ITL measurement.
		itlMs: null,
		phaseoOverheadMs:
			gatewayE2eMs != null && providerDurationMs != null
				? Math.max(0, gatewayE2eMs - providerDurationMs - failoverMs)
				: null,
	};
}

/** Reasoning tokens from gateway or provider usage, in any of the shapes it takes. */
export function getUsageReasoningTokens(usage: any): number | null {
	if (!usage || typeof usage !== "object") return null;
	const value =
		usage.reasoning_tokens ??
		usage.output_tokens_details?.reasoning_tokens ??
		usage.completion_tokens_details?.reasoning_tokens ??
		usage.reasoningTokens ??
		null;
	const numeric = Number(value);
	return value != null && Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
