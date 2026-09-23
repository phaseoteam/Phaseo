// Purpose: Keep the public gateway error contract consistent across pipeline stages.
// Why: Before-stage, execute-stage, and direct upstream failures must expose the
// same correlation, retry, and next-step fields without leaking provider payloads.

export const GATEWAY_ERROR_DOCS_URL = "https://phaseo.app/docs/v1/api-reference/errors";
export const GATEWAY_ERROR_SUPPORT_URL = "https://phaseo.tawk.help/";

const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;

type ErrorContractOptions = {
	statusCode?: number | null;
	requestId?: string | null;
	errorType?: string | null;
	errorOrigin?: string | null;
	retryAfterSeconds?: number | null;
};

function nonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
	const normalized = nonEmptyString(value);
	if (!normalized) return null;
	return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function numberOrNull(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	return null;
}

export function parseRetryAfterSeconds(
	value: string | null | undefined,
	nowMs = Date.now(),
): number | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (/^\d+$/.test(trimmed)) {
		const seconds = Number(trimmed);
		return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= MAX_RETRY_AFTER_SECONDS
			? seconds
			: null;
	}

	const retryAtMs = Date.parse(trimmed);
	if (!Number.isFinite(retryAtMs)) return null;
	const seconds = Math.ceil((retryAtMs - nowMs) / 1000);
	return seconds >= 0 && seconds <= MAX_RETRY_AFTER_SECONDS ? seconds : null;
}

function statusFrom(input: Record<string, unknown>, options: ErrorContractOptions): number | null {
	return numberOrNull(options.statusCode) ?? numberOrNull(input.status_code);
}

function codeFrom(input: Record<string, unknown>): string {
	return nonEmptyString(input.error)?.toLowerCase() ?? "";
}

function failedStatusesFrom(input: Record<string, unknown>): number[] {
	return Array.isArray(input.failed_statuses)
		? input.failed_statuses.filter(
				(value): value is number => typeof value === "number" && Number.isFinite(value),
			)
		: [];
}

function defaultRetryable(
	input: Record<string, unknown>,
	status: number | null,
	code: string,
): boolean {
	if (typeof input.retryable === "boolean") return input.retryable;

	const failedStatuses = failedStatusesFrom(input);
	if (failedStatuses.length > 0 && failedStatuses.every((value) => value >= 400 && value < 500 && value !== 408 && value !== 409 && value !== 429)) {
		return false;
	}

	if (
		/(validation|invalid|unauthor|forbidden|permission|unsupported|not_found|model_required|not_implemented|credentials|billing|payment|insufficient|guardrail|region_unavailable|pricing)/.test(code) ||
		status === 501
	) {
		return false;
	}
	if (/(capacity|rate_limit|timeout|timed_out|conflict|upstream_service|gateway_error|server_error|pipeline_execution)/.test(code)) {
		return true;
	}

	return status === 408 || status === 409 || status === 429 || (status != null && status >= 500);
}

function defaultMessage(code: string, status: number | null): string {
	if (code.includes("validation") || code.includes("invalid")) return "The request contains invalid parameters.";
	if (code.includes("unauthor") || status === 401) return "Authentication failed for this request.";
	if (code.includes("forbidden") || code.includes("permission") || status === 403) return "This request is not allowed for the current credentials or workspace.";
	if (code.includes("payment") || code.includes("billing") || code.includes("funds") || code.includes("pricing") || status === 402) return "The request could not be completed because billing or credits need attention.";
	if (code.includes("capacity") || code.includes("rate_limit") || status === 429) return "The request was temporarily rate limited or the selected route is at capacity.";
	if (code.includes("timeout") || status === 408 || status === 504) return "The request timed out before it completed.";
	if (status != null && status >= 500) return "The gateway or an upstream provider could not complete the request.";
	return "The request could not be completed.";
}

function defaultAction(code: string, status: number | null, retryable: boolean): string {
	if (code.includes("validation") || code.includes("invalid") || code.includes("unsupported")) {
		return "Check the fields named in details and the endpoint documentation, then try again.";
	}
	if (code.includes("unauthor") || status === 401) {
		return "Verify the API key and send it in the Authorization header, then try again.";
	}
	if (code.includes("forbidden") || code.includes("permission") || status === 403) {
		return "Check workspace membership, key capabilities, model access, and BYOK configuration.";
	}
	if (code.includes("payment") || code.includes("billing") || code.includes("funds") || code.includes("pricing") || status === 402) {
		return "Check credits, billing, or provider access before retrying the request.";
	}
	if (code.includes("capacity") || code.includes("rate_limit") || status === 429) {
		return "Wait for the Retry-After delay when present, then retry with bounded exponential backoff.";
	}
	if (code.includes("not_found") || status === 404) {
		return "Check the URL, model ID, workspace, and resource name used by the request.";
	}
	if (retryable) return "Retry with bounded exponential backoff. If it continues, contact Phaseo support with the request ID.";
	return "Review the error details and contact Phaseo support with the request ID if you need help.";
}

/**
 * Adds the stable fields clients need while retaining existing gateway-specific
 * diagnostics. This function deliberately does not inspect or copy arbitrary
 * upstream payloads; privacy filtering remains the responsibility of the caller.
 */
export function normalizeGatewayErrorPayload(
	input: Record<string, unknown>,
	options: ErrorContractOptions = {},
): Record<string, unknown> {
	const output: Record<string, unknown> = { ...input };
	const status = statusFrom(input, options);
	const code = codeFrom(input);
	const requestId =
		boundedString(options.requestId, 256) ??
		boundedString(input.request_id, 256) ??
		boundedString(input.generation_id, 256);
	const retryable = defaultRetryable(input, status, code);
	const description = boundedString(input.description, 2000);

	if (requestId) {
		output.request_id = requestId;
		if (!boundedString(input.generation_id, 256)) output.generation_id = requestId;
	}
	if (status != null && typeof output.status_code !== "number") output.status_code = status;
	if (!nonEmptyString(output.message)) output.message = defaultMessage(code, status);
	if (!nonEmptyString(output.description) && description) output.description = description;
	if (typeof output.retryable !== "boolean") output.retryable = retryable;
	if (!nonEmptyString(output.action)) output.action = defaultAction(code, status, retryable);
	if (!nonEmptyString(output.docs_url)) output.docs_url = GATEWAY_ERROR_DOCS_URL;
	if (!nonEmptyString(output.support_url)) output.support_url = GATEWAY_ERROR_SUPPORT_URL;

	const retryAfterSeconds =
		numberOrNull(input.retry_after_seconds) ??
		numberOrNull(options.retryAfterSeconds);
	if (
		retryAfterSeconds != null &&
		Number.isSafeInteger(retryAfterSeconds) &&
		retryAfterSeconds >= 0 &&
		retryAfterSeconds <= MAX_RETRY_AFTER_SECONDS
	) {
		output.retry_after_seconds = retryAfterSeconds;
	}

	if (!nonEmptyString(output.error_type) && nonEmptyString(options.errorType)) {
		output.error_type = options.errorType;
	}
	if (!nonEmptyString(output.error_origin) && nonEmptyString(options.errorOrigin)) {
		output.error_origin = options.errorOrigin;
	}

	return output;
}
