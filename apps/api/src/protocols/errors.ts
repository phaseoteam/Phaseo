import type { Protocol } from "./detect";

type ErrorRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ErrorRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getGatewayErrorCode(payload: ErrorRecord): string {
	return stringValue(payload.error_code) ?? stringValue(payload.error) ?? "upstream_error";
}

function getUpstreamError(payload: ErrorRecord): ErrorRecord | null {
	return isRecord(payload.upstream_error) ? payload.upstream_error : null;
}

function getErrorMessage(payload: ErrorRecord, upstreamError: ErrorRecord | null): string {
	const normalizedMessage = stringValue(payload.message);
	if (normalizedMessage) return normalizedMessage;
	const upstreamMessage = stringValue(upstreamError?.message);
	const upstreamDescription = stringValue(upstreamError?.description);
	if (upstreamMessage && upstreamDescription && !upstreamMessage.includes(upstreamDescription)) {
		return `${upstreamMessage} (${upstreamDescription})`;
	}
	return upstreamMessage ??
		stringValue(payload.description) ??
		stringValue(payload.error) ??
		"The request could not be completed.";
}

function getStatusCode(payload: ErrorRecord): number | null {
	const status = Number(payload.status_code);
	return Number.isFinite(status) ? status : null;
}

function getErrorParam(payload: ErrorRecord, upstreamError: ErrorRecord | null): string | null {
	const upstreamParam = stringValue(upstreamError?.param);
	if (upstreamParam) return upstreamParam;
	const directParam = stringValue(payload.param);
	if (directParam) return directParam;
	if (!Array.isArray(payload.details)) return null;
	const firstDetail = payload.details.find(isRecord);
	if (!firstDetail) return null;
	if (Array.isArray(firstDetail.path)) {
		const path = firstDetail.path
			.filter((part): part is string | number => typeof part === "string" || typeof part === "number")
			.map(String)
			.join(".");
		return path || null;
	}
	return stringValue(firstDetail.path);
}

function openAIErrorType(code: string, status: number | null): string {
	if (code === "provider_request_rejected" || code === "provider_feature_unsupported" || /validation|invalid_json|unsupported_model|unsupported_modalities/.test(code)) {
		return "invalid_request_error";
	}
	if (code === "provider_capacity_exhausted" || status === 429) return "rate_limit_error";
	if (code === "provider_service_unavailable" || status === 503) return "service_unavailable_error";
	if (code === "provider_payment_required") return "server_error";
	if (status === 401 || /authentication|unauthor/.test(code)) return "authentication_error";
	if (status === 403 || /permission|forbidden/.test(code)) return "permission_error";
	if (status === 404 || /not_found/.test(code)) return "not_found_error";
	if (status === 408 || /timeout/.test(code)) return "timeout_error";
	if (status === 409 || /conflict/.test(code)) return "conflict_error";
	if (status === 402 || /billing|insufficient_funds|insufficient_quota/.test(code)) return "insufficient_quota";
	if (status !== null && status >= 500) return "server_error";
	return "invalid_request_error";
}

function anthropicErrorType(code: string, status: number | null): string {
	if (code === "provider_request_rejected" || code === "provider_feature_unsupported" || /validation|invalid_json|unsupported_model|unsupported_modalities/.test(code)) {
		return "invalid_request_error";
	}
	if (code === "provider_capacity_exhausted" || status === 429) return "rate_limit_error";
	if (code === "provider_service_unavailable") return "overloaded_error";
	if (code === "provider_payment_required") return "api_error";
	if (status === 401 || /authentication|unauthor/.test(code)) return "authentication_error";
	if (status === 402 || /billing|insufficient_funds|insufficient_quota/.test(code)) return "billing_error";
	if (status === 403 || /permission|forbidden/.test(code)) return "permission_error";
	if (status === 404 || /not_found/.test(code)) return "not_found_error";
	if (status === 408 || /timeout/.test(code)) return "timeout_error";
	if (status === 409 || /conflict/.test(code)) return "conflict_error";
	if (status === 413) return "request_too_large";
	if (status !== null && status >= 500) return "api_error";
	return "invalid_request_error";
}

/**
 * Wraps the canonical Phaseo diagnostics in the error envelope expected by the
 * caller's API protocol. Shared gateway fields remain available as extensions.
 */
export function encodeProtocolErrorResponse(
	protocol: Protocol,
	payload: ErrorRecord,
): ErrorRecord {
	const gatewayCode = getGatewayErrorCode(payload);
	const upstreamError = getUpstreamError(payload);
	const message = getErrorMessage(payload, upstreamError);
	const status = getStatusCode(payload);
	const param = getErrorParam(payload, upstreamError);

	if (protocol === "anthropic.messages") {
		return {
			...payload,
			message,
			error_code: gatewayCode,
			type: "error",
			error: {
				type: anthropicErrorType(gatewayCode, status),
				message,
			},
		};
	}

	return {
		...payload,
		message,
		error_code: gatewayCode,
		error: {
			message,
			type: openAIErrorType(gatewayCode, status),
			param,
			code: gatewayCode,
		},
	};
}
