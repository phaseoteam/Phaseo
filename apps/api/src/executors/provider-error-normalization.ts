import type { NormalizedProviderErrorCode } from "./provider-error-types";

type ProviderErrorSignals = {
	status: number | null;
	code?: string | null;
	type?: string | null;
};

const BILLING_CODES = new Set([
	"BALANCE_NOT_ENOUGH",
	"BILLING_ERROR",
	"BILLING_HARD_LIMIT_REACHED",
	"INSUFFICIENT_CREDITS",
	"INSUFFICIENT_BALANCE",
	"INSUFFICIENT_FUNDS",
	"INSUFFICIENT_QUOTA",
	"NOT_ENOUGH_BALANCE",
	"NOT_ENOUGH_CREDIT",
	"NOT_ENOUGH_CREDITS",
	"OUT_OF_BALANCE",
	"PAYMENT_REQUIRED",
	"SPEND_LIMIT_REACHED",
]);

const REQUEST_REJECTION_CODES = new Set([
	"BAD_REQUEST",
	"INVALID_ARGUMENT",
	"INVALID_REQUEST",
	"INVALID_REQUEST_ERROR",
	"INVALID_REQUEST_BODY",
	"UNSUPPORTED_OPERATION",
	"UNSUPPORTED_PARAMETER",
	"VALIDATION_ERROR",
]);

const RATE_LIMIT_CODES = new Set([
	"RATE_LIMIT",
	"RATE_LIMIT_ERROR",
	"RATE_LIMIT_EXCEEDED",
	"RATE_LIMITED",
	"RESOURCE_EXHAUSTED",
	"THROTTLED",
	"THROTTLING_EXCEPTION",
	"TOKEN_LIMIT_EXCEEDED",
	"TOO_MANY_REQUESTS",
]);

const SERVICE_UNAVAILABLE_CODES = new Set([
	"OVERLOADED",
	"OVERLOADED_ERROR",
	"SERVER_IS_OVERLOADED",
	"SERVICE_NOT_AVAILABLE",
	"SERVICE_UNAVAILABLE",
	"TEMPORARY_UNAVAILABLE",
	"UPSTREAM_UNAVAILABLE",
]);

function normalizeCode(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
	return normalized || null;
}

function mapGenericProviderError(
	status: number | null,
	codes: Array<string | null>,
): NormalizedProviderErrorCode | null {
	if (codes.some((code) => code != null && BILLING_CODES.has(code))) {
		return "provider_payment_required";
	}
	if (codes.some((code) => code != null && REQUEST_REJECTION_CODES.has(code))) {
		return "provider_request_rejected";
	}
	if (codes.some((code) => code != null && SERVICE_UNAVAILABLE_CODES.has(code))) {
		return "provider_service_unavailable";
	}
	if (codes.some((code) => code != null && RATE_LIMIT_CODES.has(code))) {
		return "provider_capacity_exhausted";
	}

	if (status === 402) return "provider_payment_required";
	if (status === 400 || status === 422) return "provider_request_rejected";
	if (status === 429) return "provider_capacity_exhausted";
	if (status === 503) return "provider_service_unavailable";
	return null;
}

/**
 * Apply common code and HTTP status fallbacks after provider executors have
 * supplied any provider-specific interpretation.
 */
export function normalizeProviderErrorCode(
	input: ProviderErrorSignals,
): NormalizedProviderErrorCode | null {
	const code = normalizeCode(input.code);
	const type = normalizeCode(input.type);

	return mapGenericProviderError(input.status, [code, type]);
}
