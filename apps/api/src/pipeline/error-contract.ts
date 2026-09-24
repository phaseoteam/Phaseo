// Purpose: Keep the public gateway error contract consistent across pipeline stages.
// Why: Before-stage, execute-stage, and direct upstream failures must expose the
// same correlation, retry, and next-step fields without leaking provider payloads.

export const GATEWAY_ERROR_DOCS_URL = "https://phaseo.app/docs/v1/api-reference/errors";
export const GATEWAY_ERROR_SUPPORT_URL = "https://phaseo.tawk.help/";
export const GATEWAY_KEYS_URL = "https://phaseo.app/settings/keys";
export const GATEWAY_MODELS_URL = "https://phaseo.app/models";
export const GATEWAY_CREDITS_URL = "https://phaseo.app/settings/credits";
export const GATEWAY_BYOK_URL = "https://phaseo.app/settings/byok";
export const GATEWAY_GUARDRAILS_URL = "https://phaseo.app/settings/guardrails";

export type GatewayErrorCategory =
	| "authentication"
	| "model"
	| "unsupported_feature"
	| "invalid_request"
	| "rate_limit"
	| "billing"
	| "provider_unavailable"
	| "internal";

/** Protocol-neutral failure value produced before OpenAI or Anthropic encoding. */
export type GatewayErrorIR = {
	code: string;
	category: GatewayErrorCategory;
	statusCode: number | null;
	message: string;
	action: string;
	helpUrl: string;
	retryable: boolean;
};

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
	return (nonEmptyString(input.error_code) ?? nonEmptyString(input.error))?.toLowerCase() ?? "gateway_error";
}

function modelPageUrl(value: unknown): string {
	const model = nonEmptyString(value);
	const parts = model?.split("/") ?? [];
	if (parts.length !== 2 || parts.some((part) => !/^[a-z0-9._-]+$/i.test(part))) {
		return GATEWAY_MODELS_URL;
	}
	return `${GATEWAY_MODELS_URL}/${parts.map(encodeURIComponent).join("/")}`;
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
	if (code === "provider_capacity_exhausted" || code === "provider_service_unavailable") return true;
	if (code === "provider_request_rejected" || code === "provider_feature_unsupported" || code === "provider_payment_required") return false;

	const failedStatuses = failedStatusesFrom(input);
	if (failedStatuses.length > 0 && failedStatuses.every((value) => value >= 400 && value < 500 && value !== 408 && value !== 409 && value !== 429)) {
		return false;
	}

	if (
		/(validation|invalid|unauthor|forbidden|permission|unsupported|not_found|model_required|not_implemented|credentials|billing|payment|insufficient|guardrail|region_unavailable|pricing|provider_request_rejected)/.test(code) ||
		status === 501
	) {
		return false;
	}
	if (/(capacity|rate_limit|timeout|timed_out|conflict|upstream_service|service_unavailable|overload|gateway_error|server_error|pipeline_execution)/.test(code)) {
		return true;
	}

	return status === 408 || status === 409 || status === 429 || (status != null && status >= 500);
}

function categoryFrom(input: Record<string, unknown>, code: string, status: number | null): GatewayErrorCategory {
	if (code === "provider_feature_unsupported" || code === "unsupported_modalities" || code === "not_supported" || code === "not_implemented_yet") return "unsupported_feature";
	if (code === "unauthorised" || code === "unauthorized" || status === 401) return "authentication";
	if (code === "model_required" || code === "model_region_unavailable") return "model";
	if (code === "unsupported_model_or_endpoint") {
		return input.error_type === "system" ? "provider_unavailable" : "model";
	}
	if (code === "provider_capacity_exhausted" || code === "key_limit_exceeded" || status === 429) return "rate_limit";
	if (code === "provider_payment_required" || code === "insufficient_funds") return "billing";
	if (code === "provider_service_unavailable" || code === "upstream_error" || code === "not_ready") return "provider_unavailable";
	if (code === "gateway_error" || code === "pipeline_execution_error" || code === "pricing_not_configured") return "internal";
	if (code === "provider_request_rejected" || /validation|invalid|unsupported|not_supported|guardrail/.test(code)) return "invalid_request";
	if (status != null && status >= 500) return input.error_origin === "upstream" ? "provider_unavailable" : "internal";
	return "invalid_request";
}

function helpUrlFrom(input: Record<string, unknown>, code: string): string {
	const explicit = nonEmptyString(input.help_url);
	if (explicit) {
		try {
			const url = new URL(explicit);
			if (url.protocol === "https:" && (url.hostname === "phaseo.app" || url.hostname === "phaseo.tawk.help")) {
				return url.toString();
			}
		} catch {
			// Use the category's trusted destination below.
		}
	}
	if (code === "unauthorised" || code === "unauthorized" || code === "key_limit_exceeded") return GATEWAY_KEYS_URL;
	if (code === "byok_credentials_required") return GATEWAY_BYOK_URL;
	if (code === "insufficient_funds") return GATEWAY_CREDITS_URL;
	if (code === "guardrail_blocked") return GATEWAY_GUARDRAILS_URL;
	if (code === "model_required") return GATEWAY_MODELS_URL;
	if (code === "unsupported_model_or_endpoint" && input.reason === "model_not_found_or_inactive") return GATEWAY_MODELS_URL;
	if (code === "provider_feature_unsupported" || code === "unsupported_model_or_endpoint" || code === "unsupported_modalities" || code === "model_region_unavailable") {
		return modelPageUrl(input.model);
	}
	return GATEWAY_ERROR_DOCS_URL;
}

function defaultMessage(input: Record<string, unknown>, code: string, status: number | null): string {
	const reason = nonEmptyString(input.reason)?.toLowerCase() ?? "";
	if (code === "provider_feature_unsupported") return "The selected model does not support this feature.";
	if (code === "unsupported_modalities") return "This model does not support the requested input or output type.";
	if (code === "not_supported") return "This operation is not supported on this endpoint.";
	if (code === "not_implemented_yet") return "This endpoint is not available yet.";
	if (code === "not_ready") return "The requested resource is not ready yet.";
	if (code === "not_found") return "The requested resource was not found.";
	if (code === "guardrail_blocked") return "A workspace guardrail blocked this request.";
	if (code === "provider_request_rejected") return "The upstream provider rejected a request parameter or feature.";
	if (code === "provider_payment_required") return "The upstream provider reported insufficient balance or quota.";
	if (code === "provider_service_unavailable") return "The upstream provider is temporarily unavailable.";
	if (code === "provider_capacity_exhausted") return "The upstream provider is rate limiting this request.";
	if (code === "key_limit_exceeded") return "This API key or workspace has reached its configured limit.";
	if (code === "unauthorised" || code === "unauthorized") {
		if (reason === "missing_authorization_header") return "This request is missing an API key.";
		if (/key|secret|authorization_header/.test(reason)) return "The API key is invalid, expired, or unavailable.";
		if (reason.startsWith("oauth_")) return "The OAuth credential cannot access this gateway endpoint.";
		return "This request is not authorized for the selected workspace or endpoint.";
	}
	if (code === "model_required") return "A model ID is required.";
	if (code === "unsupported_model_or_endpoint") {
		if (reason === "model_not_found_or_inactive") return "We could not find an active model or alias for the supplied model ID.";
		if (reason === "unsupported_endpoint_for_model") return "This model does not support the requested endpoint.";
		return "This model has no available provider route for the requested endpoint.";
	}
	if (code === "model_region_unavailable") return "This model is unavailable from your location.";
	if (code === "invalid_json") return "The request body is not valid JSON.";
	if (code === "payload_too_large") return "The request body is too large.";
	if (code === "validation_error") return "The request contains invalid parameters.";
	if (code === "insufficient_funds") return "Your workspace has insufficient credits for this request.";
	if (code === "byok_credentials_required") return "This route requires a provider API key.";
	if (code === "pricing_not_configured") return "This model is temporarily unavailable because pricing is not configured.";
	if (code === "gateway_error" || code === "pipeline_execution_error") return "Something went wrong in the gateway. We are investigating.";
	if (code === "upstream_error") return "The upstream provider could not complete this request. We are investigating.";
	if (code.includes("validation") || code.includes("invalid")) return "The request contains invalid parameters.";
	if (status === 401) return "Authentication failed for this request.";
	if (status === 403) return "This request is not allowed for the current credentials or workspace.";
	if (status === 429) return "This request was rate limited.";
	if (status === 408 || status === 504) return "The request timed out before it completed.";
	if (status != null && status >= 500) return "Something went wrong while processing this request. We are investigating.";
	return "The request could not be completed.";
}

function defaultAction(input: Record<string, unknown>, code: string, retryable: boolean, helpUrl: string): string {
	const reason = nonEmptyString(input.reason)?.toLowerCase() ?? "";
	if (code === "provider_feature_unsupported") return `Review supported parameters here: ${helpUrl}`;
	if (code === "unsupported_modalities") return `Review the model's supported input and output types here: ${helpUrl}`;
	if (code === "not_supported" || code === "not_implemented_yet") return `Review the supported endpoints here: ${helpUrl}`;
	if (code === "not_ready") return "Wait briefly, then check the resource again.";
	if (code === "not_found") return "Check the resource ID and request URL, then try again.";
	if (code === "guardrail_blocked") return `Review your workspace guardrails here: ${helpUrl}`;
	if (code === "provider_request_rejected") return `Check the request parameters and the selected model's supported features here: ${modelPageUrl(input.model)}`;
	if (code === "provider_payment_required") return "Try another provider or contact Phaseo support with the request ID.";
	if (code === "provider_service_unavailable") return "Retry after a short delay or choose another provider. Contact support with the request ID if it continues.";
	if (code === "provider_capacity_exhausted") return "Respect Retry-After when present, then retry with backoff or choose another provider.";
	if (code === "key_limit_exceeded") return `Review this key's limits here: ${helpUrl}`;
	if (code === "unauthorised" || code === "unauthorized") {
		if (reason === "missing_authorization_header") return `Send your API key as a Bearer token. Create or view keys here: ${helpUrl}`;
		if (reason.startsWith("oauth_")) return `Use a key authorized for this gateway endpoint, or create an API key here: ${helpUrl}`;
		return `Check your key and workspace access, or create a new key here: ${helpUrl}`;
	}
	if (code === "model_required" || code === "unsupported_model_or_endpoint") {
		return `Review available model IDs and supported endpoints here: ${helpUrl}`;
	}
	if (code === "model_region_unavailable") return `Choose a model available in your location: ${helpUrl}`;
	if (code === "insufficient_funds") return `Add credits or review your balance here: ${helpUrl}`;
	if (code === "byok_credentials_required") return `Add a provider API key here: ${helpUrl}`;
	if (code === "pricing_not_configured") return `Choose another model here: ${GATEWAY_MODELS_URL}, or contact support with the request ID.`;
	if (code === "validation_error" || code === "invalid_json" || code === "payload_too_large") return "Correct the request using the validation details, then try again.";
	if (code === "gateway_error" || code === "pipeline_execution_error" || code === "upstream_error") {
		return "Retry once. If the error continues, contact Phaseo support with the request ID.";
	}
	if (retryable) return "Retry with bounded backoff. Contact Phaseo support with the request ID if it continues.";
	return `Review the error details here: ${helpUrl}`;
}

export function toGatewayErrorIR(input: Record<string, unknown>, options: ErrorContractOptions = {}): GatewayErrorIR {
	const code = codeFrom(input);
	const statusCode = statusFrom(input, options);
	const retryable = defaultRetryable(input, statusCode, code);
	const helpUrl = helpUrlFrom(input, code);
	return {
		code,
		category: categoryFrom(input, code, statusCode),
		statusCode,
		message: boundedString(input.message, 500) ?? defaultMessage(input, code, statusCode),
		action: boundedString(input.action, 1000) ?? defaultAction(input, code, retryable, helpUrl),
		helpUrl,
		retryable,
	};
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
	const error = toGatewayErrorIR(input, options);
	const status = error.statusCode;
	const requestId =
		boundedString(options.requestId, 256) ??
		boundedString(input.request_id, 256) ??
		boundedString(input.generation_id, 256);
	const description = boundedString(input.description, 2000);

	if (requestId) {
		output.request_id = requestId;
		if (!boundedString(input.generation_id, 256)) output.generation_id = requestId;
	}
	if (status != null && typeof output.status_code !== "number") output.status_code = status;
	if (error.code) output.error_code = error.code;
	output.category = error.category;
	output.help_url = error.helpUrl;
	output.message = error.message;
	if (!nonEmptyString(output.description) && description) output.description = description;
	output.retryable = error.retryable;
	output.action = error.action;
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
