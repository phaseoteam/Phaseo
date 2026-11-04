// Purpose: One classifier for what a provider attempt says about the provider.
// Why: Model pages report three provider metrics per attempt (reachability,
//      capacity, call errors) and exclude customer- and Phaseo-caused failures.
//      The runtime breaker (classifyProviderHealthImpact) maps the same classes
//      onto success/failure/neutral, so routing and reporting cannot drift.
// How: Pure functions with no runtime imports, safe to use from execute, after
//      and audit code and from unit tests.

import type { ProviderAttemptLog } from "@pipeline/before/types";

/**
 * - success: the provider answered the call.
 * - reachability: we could not get a response at all (transport, DNS/TLS,
 *   timeout before headers, 502/504/52x, 503 without an overload signal).
 * - capacity: the provider turned the call away for load (429 on Phaseo's
 *   managed key, 529, 503/5xx with an overload signal, capacity exhausted).
 * - call_error: the provider accepted the call and then failed it (500 and
 *   other 5xx, a stream that broke after headers, empty/invalid output,
 *   finish reason `error`).
 * - customer: caused by the request or the customer's own key/limits
 *   (400/413/422 and other 4xx, BYOK 401/402/403/429, client cancellation,
 *   region/policy rejections). Excluded from provider metrics.
 * - phaseo: caused by Phaseo (401/402/403 on the managed key, breaker-blocked,
 *   no pricing, missing executor, gateway exceptions). Excluded too.
 */
export type AttemptHealthClass =
	| "success"
	| "reachability"
	| "capacity"
	| "call_error"
	| "customer"
	| "phaseo";

export const ATTEMPT_HEALTH_CLASSES: readonly AttemptHealthClass[] = [
	"success",
	"reachability",
	"capacity",
	"call_error",
	"customer",
	"phaseo",
];

export const PROVIDER_FAILURE_CLASSES: ReadonlySet<AttemptHealthClass> = new Set([
	"reachability",
	"capacity",
	"call_error",
]);

export function isAttemptHealthClass(value: unknown): value is AttemptHealthClass {
	return typeof value === "string" && (ATTEMPT_HEALTH_CLASSES as readonly string[]).includes(value);
}

export function normalizeHealthSignal(value: unknown): string {
	return String(value ?? "").trim().toLowerCase();
}

export function isRateLimitSignal(value: unknown): boolean {
	const normalized = normalizeHealthSignal(value);
	if (!normalized) return false;
	return (
		normalized.includes("rate limit") ||
		normalized.includes("rate_limit") ||
		normalized.includes("too many requests") ||
		normalized.includes("ratelimit") ||
		normalized.includes("quota exceeded")
	);
}

/** Provider says it is overloaded or out of capacity (not a per-key quota). */
export function isCapacitySignal(value: unknown): boolean {
	const normalized = normalizeHealthSignal(value);
	if (!normalized) return false;
	return (
		normalized.includes("overload") ||
		normalized.includes("capacity") ||
		normalized.includes("server_busy") ||
		normalized.includes("server is busy") ||
		normalized.includes("too busy")
	);
}

/** Region availability and content/safety policy rejections belong to the request. */
function isRequestPolicySignal(value: unknown): boolean {
	const normalized = normalizeHealthSignal(value);
	if (!normalized) return false;
	return (
		normalized.includes("region") ||
		normalized.includes("unsupported_country") ||
		normalized.includes("country") ||
		normalized.includes("policy") ||
		normalized.includes("safety") ||
		normalized.includes("moderation") ||
		normalized.includes("content_filter")
	);
}

const ERROR_FINISH_REASONS = new Set(["error", "failed", "failure", "upstream_failure"]);

export function isErrorFinishReason(value: unknown): boolean {
	return ERROR_FINISH_REASONS.has(normalizeHealthSignal(value));
}


export type AttemptHealthInput = {
	/** Pre-execution outcomes are Phaseo's own: the provider was never called. */
	outcome?: ProviderAttemptLog["outcome"] | null;
	upstreamStatus?: number | null;
	/** Customer cancellation (client disconnect, AbortError). */
	aborted?: boolean;
	/** The stream broke after headers, or the provider sent an error event. */
	midStreamError?: boolean;
	finishReason?: string | null;
	errorCode?: string | null;
	errorType?: string | null;
	errorMessage?: string | null;
	credentialSource?: "gateway" | "byok" | null;
	/**
	 * Where a thrown failure came from. "provider" means the provider fetch
	 * itself failed (transport error, headers timeout); "gateway" and "client"
	 * are Phaseo and the caller. Unknown thrown errors are treated as Phaseo's.
	 */
	failureOrigin?: "provider" | "gateway" | "client";
};

export function classifyAttemptHealth(args: AttemptHealthInput): AttemptHealthClass {
	if (args.aborted || args.failureOrigin === "client") return "customer";
	if (args.failureOrigin === "gateway") return "phaseo";
	if (args.outcome === "blocked" || args.outcome === "no_pricing" || args.outcome === "unsupported_executor") {
		return "phaseo";
	}
	const status = Number(args.upstreamStatus ?? 0);
	const byok = args.credentialSource === "byok";
	// Credential ownership stays authoritative if a stream also reports an error.
	if (byok && [401, 402, 403, 429].includes(status)) return "customer";
	if (args.midStreamError) return "call_error";
	if (isErrorFinishReason(args.finishReason)) return "call_error";
	if (Number.isFinite(status) && status >= 200 && status < 300) return "success";

	const signals = [args.errorCode, args.errorType, args.errorMessage];
	const hasCapacitySignal = signals.some(isCapacitySignal);
	if (status === 429) return byok ? "customer" : "capacity";
	if (status === 529) return "capacity";
	if (status === 408) return "reachability";
	if (status === 401 || status === 402) return "phaseo";
	if (status === 403) return signals.some(isRequestPolicySignal) ? "customer" : "phaseo";
	// Request validation, size, unknown resources: the request, not provider health.
	if (status >= 400 && status < 500) return "customer";
	if (status >= 500 && status < 600) {
		if (hasCapacitySignal) return "capacity";
		if (status === 502 || status === 503 || status === 504) return "reachability";
		// Cloudflare origin errors: unknown error, down, connect timeout,
		// unreachable, response timeout, TLS handshake/certificate.
		if (status >= 520 && status <= 527) return "reachability";
		return "call_error";
	}

	// No usable status: a thrown failure.
	const fromProvider = args.failureOrigin === "provider";
	if (signals.some(isRateLimitSignal)) {
		if (byok) return "customer";
		return fromProvider ? "capacity" : "phaseo";
	}
	if (fromProvider && hasCapacitySignal) return "capacity";
	if (fromProvider) return "reachability";
	// Socket error codes without proof they came from the provider
	// fetch may be our own subrequests, and unknown exceptions may be mapping,
	// billing or gateway bugs: neither is evidence against the provider.
	return "phaseo";
}


/** Health class for an attempt log that has no explicit class yet. */
export function classifyAttemptLog(entry: ProviderAttemptLog): AttemptHealthClass {
	if (entry.outcome === "success") return "success";
	return classifyAttemptHealth({
		outcome: entry.outcome,
		upstreamStatus: entry.status ?? null,
		credentialSource: entry.key_source ?? null,
		errorCode: entry.upstream_error_code ?? null,
		errorType: entry.upstream_error_type ?? null,
		errorMessage: entry.upstream_error_message ?? null,
	});
}

/**
 * The attempt whose response was served: the last successful attempt. An
 * attempt is marked successful when headers arrive, so a later stream break or
 * empty output is attributed to it here.
 */
export function findServedAttempt(attempts: ProviderAttemptLog[] | null | undefined): ProviderAttemptLog | null {
	if (!Array.isArray(attempts)) return null;
	for (let index = attempts.length - 1; index >= 0; index--) {
		if (attempts[index]?.outcome === "success") return attempts[index];
	}
	return null;
}

export function markServedAttemptHealth(
	attempts: ProviderAttemptLog[] | null | undefined,
	healthClass: AttemptHealthClass,
): void {
	const served = findServedAttempt(attempts);
	if (served) served.health_class = healthClass;
}

/**
 * What a request-level failure recorded after a successful provider response
 * says about the provider that served it. Null keeps the attempt a success
 * (for example a Phaseo pricing/finalization failure after a good response).
 */
export function servedAttemptHealthForFailure(attribution: string, errorCode: string): AttemptHealthClass | null {
	const origin = normalizeHealthSignal(attribution);
	const code = normalizeHealthSignal(errorCode);
	if (origin === "client" || origin === "user") return "customer";
	if (code === "upstream_stream_failure") return "call_error";
	if (code === "google_empty_response" || code === "normalization_failed" || code === "empty_response") {
		return "call_error";
	}
	return null;
}

/** Status recorded when the caller closed the request (nginx convention). */
export const CLIENT_CLOSED_REQUEST_STATUS = 499;

/**
 * A stream that ended without a terminal event because the caller left. The
 * finaliser's `aborted` flag alone also covers a provider that disconnected
 * mid-stream, so the client must have disconnected first and the provider must
 * not have reported an error.
 */
export function isClientCancelledStream(args: {
	aborted: boolean;
	downstreamDisconnected: boolean;
	streamFailed: boolean;
}): boolean {
	return args.aborted && args.downstreamDisconnected && !args.streamFailed;
}
