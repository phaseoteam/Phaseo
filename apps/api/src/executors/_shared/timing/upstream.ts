// Request-local upstream timing for Cloudflare Workers.
// The tracker has no module-level mutable state and measures at the fetch boundary.

import type {
	ExecutorExecuteArgs,
	ExecutorUpstreamTiming,
	UpstreamFetchPhase,
	UpstreamResponseTiming,
} from "@executors/types";

export type UpstreamTimingSnapshot = {
	requestBuildMs?: number;
	upstreamFetchStartMs?: number;
	upstreamHeadersMs?: number;
	upstreamRequestCount: number;
	upstreamPollCount: number;
	upstreamAuthCount: number;
	upstreamPreflightCount: number;
	upstreamMediaCount: number;
};

export function createUpstreamTimingTracker(): {
	timing: ExecutorUpstreamTiming;
	snapshot: () => UpstreamTimingSnapshot;
} {
	const executorStartedAt = performance.now();
	const responseTimings = new WeakMap<Response, UpstreamResponseTiming>();
	let sequence = 0;
	let firstProviderFetchAt: number | undefined;
	let firstProviderFetchEpochMs: number | undefined;
	let firstProviderHeadersMs: number | undefined;
	const counts: Record<UpstreamFetchPhase, number> = {
		provider: 0,
		auth: 0,
		preflight: 0,
		media: 0,
		poll: 0,
	};

	const timedFetch: ExecutorUpstreamTiming["fetch"] = async (
		input,
		init,
		phase = "provider",
	) => {
		const fetchStartedAt = performance.now();
		const dispatchAtMs = Date.now();
		const fetchSequence = ++sequence;
		counts[phase] += 1;
		if (phase === "provider" && firstProviderFetchAt === undefined) {
			firstProviderFetchAt = fetchStartedAt;
			firstProviderFetchEpochMs = dispatchAtMs;
		}
		const response = await globalThis.fetch(input, init);
		const headersAtMs = Date.now();
		const headersMs = Math.max(0, performance.now() - fetchStartedAt);
		responseTimings.set(response, {
			phase,
			sequence: fetchSequence,
			dispatchAtMs,
			headersAtMs,
			headersMs,
		});
		if (phase === "provider" && firstProviderHeadersMs === undefined) {
			firstProviderHeadersMs = headersMs;
		}
		return response;
	};

	return {
		timing: {
			fetch: timedFetch,
			timingFor: (response) => responseTimings.get(response),
		},
		snapshot: () => ({
			requestBuildMs:
				firstProviderFetchAt === undefined
					? undefined
					: Math.max(0, firstProviderFetchAt - executorStartedAt),
			upstreamFetchStartMs: firstProviderFetchEpochMs,
			upstreamHeadersMs: firstProviderHeadersMs,
			upstreamRequestCount: counts.provider,
			upstreamPollCount: counts.poll,
			upstreamAuthCount: counts.auth,
			upstreamPreflightCount: counts.preflight,
			upstreamMediaCount: counts.media,
		}),
	};
}

export function fetchUpstream(
	args: ExecutorExecuteArgs,
	input: RequestInfo | URL,
	init?: RequestInit,
	phase: UpstreamFetchPhase = "provider",
): Promise<Response> {
	if (args.upstreamTiming) {
		return args.upstreamTiming.fetch(input, init, phase);
	}
	return globalThis.fetch(input, init);
}
