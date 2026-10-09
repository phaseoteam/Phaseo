// Request-local upstream timing for Cloudflare Workers.
// The tracker has no module-level mutable state and measures at the fetch boundary.

import type {
	ExecutorExecuteArgs,
	ExecutorUpstreamTiming,
	UpstreamFetchPhase,
	UpstreamResponseTiming,
} from "@executors/types";
import { observeGatewayStream, type GatewayTimingTrace } from "@pipeline/telemetry/gateway-trace";
import { getBindingsIfConfigured } from "@/runtime/env";

/**
 * A provider did not return response headers within
 * GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS. Unlike a caller AbortError this is a
 * provider transport failure: health accounting counts it against the provider
 * and the attempt loop fails over to the next candidate.
 */
export class UpstreamHeadersTimeoutError extends Error {
	readonly code = "upstream_headers_timeout";
	readonly timeoutMs: number;

	constructor(timeoutMs: number) {
		super(`upstream_headers_timeout: no response headers within ${timeoutMs}ms`);
		this.name = "UpstreamHeadersTimeoutError";
		this.timeoutMs = timeoutMs;
	}
}

export function resolveUpstreamHeadersTimeoutMs(): number {
	let raw: unknown;
	try {
		raw = getBindingsIfConfigured()?.GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS;
	} catch {
		// Runtime not available (e.g. partially mocked in tests): deadline off.
		return 0;
	}
	if (raw === undefined || raw === null || String(raw).trim() === "") return 0;
	const value = Number(raw);
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * fetch() with an optional deadline for the response headers. The caller's
 * signal (init.signal or the Request's own signal) still cancels the request
 * and, after headers, the body. The timer is cleared as soon as headers arrive,
 * so the deadline never truncates a streaming body.
 */
export async function fetchWithHeadersDeadline(
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	timeoutMs: number,
): Promise<Response> {
	if (!(timeoutMs > 0)) return globalThis.fetch(input, init);
	const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : null);
	if (callerSignal?.aborted) return globalThis.fetch(input, init);

	const controller = new AbortController();
	const forwardCallerAbort = () => controller.abort(callerSignal?.reason);
	callerSignal?.addEventListener("abort", forwardCallerAbort, { once: true });
	const timeoutError = new UpstreamHeadersTimeoutError(timeoutMs);
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort(timeoutError);
	}, timeoutMs);
	try {
		return await globalThis.fetch(input, { ...init, signal: controller.signal });
	} catch (error) {
		if (timedOut && !callerSignal?.aborted) throw timeoutError;
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

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

/**
 * `applyHeadersDeadline` enables GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS for provider
 * fetches. Pass it only for streaming requests: a non-streaming provider sends
 * headers once generation finishes, so a deadline would cut off long reasoning or
 * media generations and fail them over (paying for the same work twice).
 */
export function createUpstreamTimingTracker(trace?: GatewayTimingTrace, options: { applyHeadersDeadline?: boolean } = {}): {
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
			response = phase === "provider" && options.applyHeadersDeadline
				? await fetchWithHeadersDeadline(input, init, resolveUpstreamHeadersTimeoutMs())
				: await globalThis.fetch(input, init);
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
	// Without a tracker the caller's streaming mode is unknown; never apply the deadline.
	return globalThis.fetch(input, init);
}
