// Request-local upstream timing for Cloudflare Workers.
// The tracker has no module-level mutable state and measures at the fetch boundary.

import type {
	ExecutorExecuteArgs,
	ExecutorUpstreamTiming,
	UpstreamFetchPhase,
	UpstreamResponseTiming,
} from "@executors/types";
import { observeGatewayStream, type GatewayTimingTrace } from "@pipeline/telemetry/gateway-trace";
import { markProviderDispatch } from "@/runtime/request-operations";

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

export function createUpstreamTimingTracker(trace?: GatewayTimingTrace): {
	timing: ExecutorUpstreamTiming;
	snapshot: () => UpstreamTimingSnapshot;
	isProviderTransportFailure: (error: unknown) => boolean;
} {
	const executorStartedAt = performance.now();
	const responseTimings = new WeakMap<Response, UpstreamResponseTiming>();
	const providerTransportFailures = new Set<unknown>();
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
        if (phase === "provider") markProviderDispatch();
        const dispatchAtMs = Date.now();
        const diagnosticStart = trace?.now();
        if (trace && phase === "provider") {
            trace.providerRequests++;
            trace.mark("upstream_dispatch", diagnosticStart);
        }
		const fetchSequence = ++sequence;
		counts[phase] += 1;
		if (phase === "provider" && firstProviderFetchAt === undefined) {
			firstProviderFetchAt = fetchStartedAt;
			firstProviderFetchEpochMs = dispatchAtMs;
		}
		let response: Response;
		try {
			response = await globalThis.fetch(input, init);
		} catch (error) {
			// Preserve the original error identity and adapter retry semantics.
			// Explicit cancellation is not provider downtime.
			if ((phase === "provider" || phase === "poll") && !(error instanceof Error && error.name === "AbortError")) providerTransportFailures.add(error);
			throw error;
		}
		const headersAtMs = Date.now();
        const headersMs = Math.max(0, performance.now() - fetchStartedAt);
        if (trace && phase === "provider") {
            const arrived = trace.now();
            trace.mark("upstream_headers", arrived);
            trace.wait(diagnosticStart!, arrived, "headers");
            response = observeGatewayStream(response, trace, "upstream");
        }
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
		isProviderTransportFailure: (error) => providerTransportFailures.has(error),
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
