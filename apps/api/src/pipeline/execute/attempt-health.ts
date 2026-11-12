// Purpose: One classifier for what a provider attempt says about the provider.
// Why: Model pages report three provider metrics per attempt (reachable,
//      accepted, completed) and exclude customer- and Phaseo-caused failures.
//      The runtime breaker (classifyProviderHealthImpact) maps the same classes
//      onto success/failure/neutral, so routing and reporting cannot drift.
// How: Pure functions with no runtime imports, safe to use from execute, after
//      and audit code and from unit tests. Every attempt gets a class and, when
//      it did not plainly succeed, a short reason saying what the issue was.

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
 *   (invalid request, content policy, BYOK 401/402/403/429, client
 *   cancellation). Excluded from provider metrics.
 * - phaseo: caused by Phaseo (managed-key auth, a route whose model the
 *   provider does not know, a request another route accepted, our egress
 *   location, breaker-blocked, no pricing, missing executor, gateway
 *   exceptions). Excluded too.
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

/**
 * Why an attempt got its class. Null for a plain success. Persisted on
 * v2_request_attempts.health_reason; the same values are derived in SQL for
 * rows recorded before the gateway sent them.
 */
export const ATTEMPT_HEALTH_REASONS = {
	// reachability
	transport: "reachability", // the provider fetch failed (connection, DNS, TLS)
	headers_timeout: "reachability", // no response headers in time (408 or our timeout)
	upstream_unavailable: "reachability", // 502/503/504 and Cloudflare 52x origin errors
	// capacity
	rate_limited: "capacity", // 429 on Phaseo's managed key
	overloaded: "capacity", // 529, or 5xx/thrown error saying overloaded / out of capacity
	// call_error
	server_error: "call_error", // 500 and other 5xx after the provider accepted the call
	stream_break: "call_error", // the served stream broke, or the provider dropped it mid-way
	empty_output: "call_error", // the served response had no output
	invalid_output: "call_error", // the served response could not be normalized
	error_finish: "call_error", // the provider finished the response with an error
	// customer (excluded)
	client_cancelled: "customer", // the caller disconnected or aborted
	byok_error: "customer", // 401/402/403 on the customer's own key
	customer_key_limit: "customer", // rate/quota limit on the customer's own key
	invalid_request: "customer", // other 4xx: the request itself was rejected
	content_policy: "customer", // a provider content/safety policy rejected the request
	region_unavailable: "customer", // the provider rejected the requested model region
	// phaseo (excluded)
	route_model_not_found: "phaseo", // the provider does not know the model id on our managed route
	provider_rejected_request_accepted_elsewhere: "phaseo", // a 4xx another route then accepted
	phaseo_key_auth: "phaseo", // 401/402/403 on Phaseo's managed key
	egress_location_unsupported: "phaseo", // the provider does not serve the location we called from
	breaker_blocked: "phaseo", // our circuit breaker skipped the provider
	gateway_fault: "phaseo", // no pricing, no executor, or a gateway exception
} as const satisfies Record<string, Exclude<AttemptHealthClass, "success">>;

export type AttemptHealthReason = keyof typeof ATTEMPT_HEALTH_REASONS;

export type AttemptHealth = { healthClass: AttemptHealthClass; reason: AttemptHealthReason | null };

export const PROVIDER_FAILURE_CLASSES: ReadonlySet<AttemptHealthClass> = new Set([
	"reachability",
	"capacity",
	"call_error",
]);

/**
 * Customer reasons that say the request itself was rejected. When another
 * route then accepted the same request, the request was fine after all and the
 * rejection is reclassified as Phaseo's routing or mapping problem.
 */
const REQUEST_REJECTION_REASONS: ReadonlySet<AttemptHealthReason> = new Set([
	"invalid_request",
	"content_policy",
	"region_unavailable",
]);

export function isAttemptHealthClass(value: unknown): value is AttemptHealthClass {
	return typeof value === "string" && (ATTEMPT_HEALTH_CLASSES as readonly string[]).includes(value);
}

export function isAttemptHealthReason(value: unknown): value is AttemptHealthReason {
	return typeof value === "string" && Object.prototype.hasOwnProperty.call(ATTEMPT_HEALTH_REASONS, value);
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

/**
 * The provider refuses the location the call came from. Providers see
 * Phaseo's Worker egress, not the customer, so this is Phaseo's (for example
 * Google AI Studio: "User location is not supported for the API use." from
 * the Hong Kong colo; OpenAI: unsupported_country_region_territory).
 */
function isEgressLocationSignal(value: unknown): boolean {
	const normalized = normalizeHealthSignal(value);
	if (!normalized) return false;
	return (
		normalized.includes("location is not supported") ||
		normalized.includes("unsupported_country") ||
		normalized.includes("country, region, or territory not supported") ||
		normalized.includes("not available in your country") ||
		normalized.includes("not available in your region")
	);
}

/** The provider rejected the model region the route asked for. */
function isRegionSignal(value: unknown): boolean {
	const normalized = normalizeHealthSignal(value);
	return Boolean(normalized) && (normalized.includes("region") || normalized.includes("country"));
}

/** Content and safety policy rejections belong to the request. */
function isContentPolicySignal(value: unknown): boolean {
	const normalized = normalizeHealthSignal(value);
	if (!normalized) return false;
	return (
		normalized.includes("policy") ||
		normalized.includes("safety") ||
		normalized.includes("moderation") ||
		normalized.includes("content_filter") ||
		normalized.includes("prohibited_content")
	);
}

/**
 * The provider does not know (or has not enabled) the model id we sent: a
 * wrong or retired provider model id on the route. Signals that name another
 * resource (a file, a previous response, a batch) are the customer's.
 */
function isModelNotFoundSignal(value: unknown): boolean {
	const normalized = normalizeHealthSignal(value);
	if (!normalized) return false;
	if (normalized.includes("modelnotopen") || normalized.includes("model_not_found") || normalized.includes("unknown model") || normalized.includes("invalid model") || normalized.includes("no such model")) {
		return true;
	}
	return normalized.includes("model") && (
		normalized.includes("not found") ||
		normalized.includes("does not exist") ||
		normalized.includes("not exist") ||
		normalized.includes("not activated")
	);
}

function isTimeoutSignal(value: unknown): boolean {
	const normalized = normalizeHealthSignal(value);
	return Boolean(normalized) && (normalized.includes("timeout") || normalized.includes("timed out"));
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

const health = (reason: AttemptHealthReason): AttemptHealth => ({ healthClass: ATTEMPT_HEALTH_REASONS[reason], reason });
const SUCCESS: AttemptHealth = { healthClass: "success", reason: null };

/** The attempt's class and the reason for it. */
export function classifyAttemptHealthDetail(args: AttemptHealthInput): AttemptHealth {
	if (args.aborted || args.failureOrigin === "client") return health("client_cancelled");
	if (args.failureOrigin === "gateway") return health("gateway_fault");
	if (args.outcome === "blocked") return health("breaker_blocked");
	if (args.outcome === "no_pricing" || args.outcome === "unsupported_executor") return health("gateway_fault");
	const status = Number(args.upstreamStatus ?? 0);
	const byok = args.credentialSource === "byok";
	// Credential ownership stays authoritative if a stream also reports an error.
	if (byok && status === 429) return health("customer_key_limit");
	if (byok && [401, 402, 403].includes(status)) return health("byok_error");
	if (args.midStreamError) return health("stream_break");
	if (isErrorFinishReason(args.finishReason)) return health("error_finish");
	if (Number.isFinite(status) && status >= 200 && status < 300) return SUCCESS;

	const signals = [args.errorCode, args.errorType, args.errorMessage];
	const hasCapacitySignal = signals.some(isCapacitySignal);
	if (status === 429) return health("rate_limited");
	if (status === 529) return health("overloaded");
	if (status === 408) return health("headers_timeout");
	if (status >= 400 && status < 500) {
		// The provider sees Phaseo's egress location, whatever the key.
		if (signals.some(isEgressLocationSignal)) return health("egress_location_unsupported");
		if (!byok && status === 403) {
			if (signals.some(isRegionSignal)) return health("region_unavailable");
			if (signals.some(isContentPolicySignal)) return health("content_policy");
		}
		if (!byok && (status === 401 || status === 402 || status === 403)) return health("phaseo_key_auth");
		// On Phaseo's managed key, a provider that does not know the model is a
		// wrong or retired provider model id on our route. A 404 with no error
		// body at all is read the same way; a 404 naming another resource is not.
		if (!byok && [400, 404, 422].includes(status)) {
			const hasSignal = signals.some((signal) => normalizeHealthSignal(signal).length > 0);
			if (signals.some(isModelNotFoundSignal) || (status === 404 && !hasSignal)) return health("route_model_not_found");
		}
		if (signals.some(isContentPolicySignal)) return health("content_policy");
		// Request validation, size, unknown resources: the request, not provider health.
		return health("invalid_request");
	}
	if (status >= 500 && status < 600) {
		if (hasCapacitySignal) return health("overloaded");
		if (status === 502 || status === 503 || status === 504) return health("upstream_unavailable");
		// Cloudflare origin errors: unknown error, down, connect timeout,
		// unreachable, response timeout, TLS handshake/certificate.
		if (status >= 520 && status <= 527) return health("upstream_unavailable");
		return health("server_error");
	}

	// No usable status: a thrown failure.
	const fromProvider = args.failureOrigin === "provider";
	if (signals.some(isRateLimitSignal)) {
		if (byok) return health("customer_key_limit");
		return fromProvider ? health("rate_limited") : health("gateway_fault");
	}
	if (fromProvider && hasCapacitySignal) return health("overloaded");
	if (fromProvider) return signals.some(isTimeoutSignal) ? health("headers_timeout") : health("transport");
	// Socket error codes without proof they came from the provider
	// fetch may be our own subrequests, and unknown exceptions may be mapping,
	// billing or gateway bugs: neither is evidence against the provider.
	return health("gateway_fault");
}

export function classifyAttemptHealth(args: AttemptHealthInput): AttemptHealthClass {
	return classifyAttemptHealthDetail(args).healthClass;
}

/** Health for an attempt log that has no explicit class yet. */
export function classifyAttemptLogDetail(entry: ProviderAttemptLog): AttemptHealth {
	if (entry.outcome === "success") return SUCCESS;
	return classifyAttemptHealthDetail({
		outcome: entry.outcome,
		upstreamStatus: entry.status ?? null,
		credentialSource: entry.key_source ?? null,
		errorCode: entry.upstream_error_code ?? null,
		errorType: entry.upstream_error_type ?? null,
		errorMessage: entry.upstream_error_message ?? null,
	});
}

export function classifyAttemptLog(entry: ProviderAttemptLog): AttemptHealthClass {
	return classifyAttemptLogDetail(entry).healthClass;
}

/** Classifies an attempt log from its own fields unless it already has a class. */
export function applyAttemptHealth(entry: ProviderAttemptLog): void {
	if (isAttemptHealthClass(entry.health_class)) return;
	const detail = classifyAttemptLogDetail(entry);
	entry.health_class = detail.healthClass;
	entry.health_reason = detail.reason;
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
	detail: AttemptHealth,
): void {
	const served = findServedAttempt(attempts);
	if (!served) return;
	served.health_class = detail.healthClass;
	served.health_reason = detail.reason;
}

/** The provider route an attempt went to: provider plus the model id it was sent. */
function attemptRouteKey(entry: ProviderAttemptLog): string {
	return `${entry.provider ?? ""}::${entry.provider_model_slug ?? entry.api_model_id ?? entry.model ?? ""}`;
}

/**
 * A provider rejected the request with a 4xx, and a later attempt on another
 * route (another provider, or another model in a fallback) then accepted the
 * same request. The request was fine, so the rejection is Phaseo's: a route or
 * request-mapping problem, not the customer's and not provider health. Only
 * request rejections are reclassified; credential, key-limit and cancellation
 * reasons keep their class. Runs once the request has finished.
 */
export function reclassifyAttemptsAcceptedElsewhere(attempts: ProviderAttemptLog[] | null | undefined): void {
	if (!Array.isArray(attempts)) return;
	const served = findServedAttempt(attempts);
	if (!served) return;
	const servedIndex = attempts.lastIndexOf(served);
	const servedRoute = attemptRouteKey(served);
	for (let index = 0; index < servedIndex; index++) {
		const entry = attempts[index];
		if (!entry || entry.outcome === "success") continue;
		const status = Number(entry.status ?? 0);
		if (!(status >= 400 && status < 500)) continue;
		if (attemptRouteKey(entry) === servedRoute) continue;
		const detail = isAttemptHealthClass(entry.health_class)
			? { healthClass: entry.health_class, reason: isAttemptHealthReason(entry.health_reason) ? entry.health_reason : classifyAttemptLogDetail(entry).reason }
			: classifyAttemptLogDetail(entry);
		if (detail.healthClass !== "customer" || !detail.reason || !REQUEST_REJECTION_REASONS.has(detail.reason)) continue;
		entry.health_class = "phaseo";
		entry.health_reason = "provider_rejected_request_accepted_elsewhere";
	}
}

/**
 * What a request-level failure recorded after a successful provider response
 * says about the provider that served it. Null keeps the attempt a success
 * (for example a Phaseo pricing/finalization failure after a good response).
 */
export function servedAttemptHealthForFailure(attribution: string, errorCode: string): AttemptHealth | null {
	const origin = normalizeHealthSignal(attribution);
	const code = normalizeHealthSignal(errorCode);
	if (origin === "client" || origin === "user") return health("client_cancelled");
	if (code === "upstream_stream_failure") return health("stream_break");
	if (code === "google_empty_response" || code === "empty_response") return health("empty_output");
	if (code === "normalization_failed") return health("invalid_output");
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

/**
 * What a finished stream tells the routing breaker. A stream that ended
 * without a terminal event while the client was still connected was dropped by
 * the provider: a mid-stream failure, like an error event. Only a client
 * cancellation is neutral.
 */
export function streamHealthSignals(args: {
	aborted: boolean;
	downstreamDisconnected: boolean;
	streamFailed: boolean;
}): { clientCancelled: boolean; midStreamError: boolean } {
	const clientCancelled = isClientCancelledStream(args);
	return { clientCancelled, midStreamError: args.streamFailed || (args.aborted && !clientCancelled) };
}
