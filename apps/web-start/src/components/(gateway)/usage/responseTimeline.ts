function duration(value: unknown): number | null {
	if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
	const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function providerAttemptTimelineDuration(
	attempt: { duration_ms?: unknown; total_ms?: unknown; started_at_unix_ms?: unknown },
	timeline?: { version?: unknown; first_dispatch_at_ms?: unknown } | null,
): number | null {
	// total_ms on the final child row can cover the whole gateway request.
	const elapsed = duration(attempt.duration_ms) ?? duration(attempt.total_ms);
	const start = duration(attempt.started_at_unix_ms);
	const dispatch = timeline?.version === 1 ? duration(timeline.first_dispatch_at_ms) : null;
	if (elapsed === null || start === null || dispatch === null) return elapsed;
	return Math.max(0, elapsed - Math.max(0, dispatch - start));
}

/** generation_ms stores the full provider duration, including time to first token. */
export function responseTimelineTiming(request: {
	stream?: boolean | null;
	latency_ms?: unknown;
	generation_ms?: unknown;
	detail_metadata?: { response_timeline?: { version?: unknown; routing_ms?: unknown } | null } | null;
}) {
	const recorded = request.detail_metadata?.response_timeline;
	const routingMs = recorded?.version === 1 ? duration(recorded.routing_ms) : null;
	const latency = duration(request.latency_ms);
	const fullProvider = duration(request.generation_ms);
	if (request.stream === true && latency !== null && fullProvider !== null && fullProvider >= latency) {
		return { routingMs, providerMs: latency, generationMs: fullProvider - latency };
	}
	// Non-streaming responses and incomplete measurements cannot be split at
	// the first token. Keep the whole provider interval as a single segment.
	return { routingMs, providerMs: fullProvider ?? latency, generationMs: null };
}
