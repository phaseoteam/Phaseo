// Purpose: Classify how the provider attempts of one request failed.
// Why: The client status and request-level model fallback depend on whether
// every provider throttled the request or rejected it as malformed.
// How: Reads the attempt error log written by the execute stage.

// Attempts that reached (or tried to reach) a provider. Breaker blocks, missing
// pricing and missing executors never dispatched and say nothing about the request.
const DISPATCHED_ATTEMPT_TYPES = new Set(["upstream_non_2xx", "error", "retryable_error"]);

// Provider statuses that mean the request itself was rejected: malformed or
// invalid parameters, an oversized payload, or unprocessable content. Another
// provider of the same model is still tried (its parameter support and limits
// can differ), but switching to a different model would not fix the request.
const REQUEST_REJECTED_STATUSES = new Set([400, 413, 422]);

type AttemptError = Record<string, unknown> | null | undefined;

function dispatchedAttempts(attemptErrors: readonly AttemptError[] | null | undefined): AttemptError[] {
	if (!Array.isArray(attemptErrors)) return [];
	return attemptErrors.filter((entry) => DISPATCHED_ATTEMPT_TYPES.has(String(entry?.type ?? "")));
}

function everyDispatchedAttemptHasStatus(
	attemptErrors: readonly AttemptError[] | null | undefined,
	statuses: ReadonlySet<number>,
): boolean {
	const dispatched = dispatchedAttempts(attemptErrors);
	return dispatched.length > 0 && dispatched.every((entry) =>
		entry?.type === "upstream_non_2xx" && statuses.has(Number(entry?.status ?? NaN))
	);
}

const RATE_LIMITED_STATUSES = new Set([429]);

/** Every provider that was called answered 429: the request was throttled, not failed. */
export function everyAttemptRateLimited(attemptErrors: readonly AttemptError[] | null | undefined): boolean {
	return everyDispatchedAttemptHasStatus(attemptErrors, RATE_LIMITED_STATUSES);
}

/** Every provider that was called rejected the request itself (400, 413 or 422). */
export function everyAttemptRejectedRequest(attemptErrors: readonly AttemptError[] | null | undefined): boolean {
	return everyDispatchedAttemptHasStatus(attemptErrors, REQUEST_REJECTED_STATUSES);
}
