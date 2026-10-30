export type OutputPerformanceMetrics = {
	effectiveThroughputTps: number | null;
	outputSpeedTps: number | null;
	tpotMs: number | null;
	itlMs: number | null;
	phaseoOverheadMs: number | null;
};

export function calculateOutputPerformanceMetrics(args: {
	outputTokens: number;
	providerDurationMs: number | null;
	providerTtftMs: number | null;
	gatewayE2eMs: number | null;
	/** Time spent on failed provider attempts; provider time, not Phaseo's. */
	failoverMs?: number | null;
}): OutputPerformanceMetrics {
	const outputTokens = Number.isFinite(args.outputTokens)
		? Math.max(0, args.outputTokens)
		: 0;
	const providerDurationMs =
		args.providerDurationMs != null && Number.isFinite(args.providerDurationMs)
			? Math.max(0, args.providerDurationMs)
			: null;
	const providerTtftMs =
		args.providerTtftMs != null && Number.isFinite(args.providerTtftMs) && args.providerTtftMs > 0
			? args.providerTtftMs
			: null;
	const gatewayE2eMs =
		args.gatewayE2eMs != null && Number.isFinite(args.gatewayE2eMs)
			? Math.max(0, args.gatewayE2eMs)
			: null;
	const failoverMs =
		args.failoverMs != null && Number.isFinite(args.failoverMs)
			? Math.max(0, args.failoverMs)
			: 0;
	const postFirstTokenMs =
		providerDurationMs != null && providerTtftMs != null
			? Math.max(0, providerDurationMs - providerTtftMs)
			: null;
	const postFirstTokenCount = Math.max(0, outputTokens - 1);
	const tpotMs =
		postFirstTokenMs != null && postFirstTokenMs > 0 && postFirstTokenCount > 0
			? postFirstTokenMs / postFirstTokenCount
			: null;

	return {
		effectiveThroughputTps:
			providerDurationMs != null && providerDurationMs > 0 && outputTokens > 0
				? outputTokens / (providerDurationMs / 1000)
				: null,
		outputSpeedTps:
			tpotMs != null && tpotMs > 0 ? 1000 / tpotMs : null,
		tpotMs,
		// ITL is populated from observed content-bearing stream-frame intervals.
		// Request-level token counts cannot produce a distinct ITL measurement.
		itlMs: null,
		phaseoOverheadMs:
			gatewayE2eMs != null && providerDurationMs != null
				? Math.max(0, gatewayE2eMs - providerDurationMs - failoverMs)
				: null,
	};
}
