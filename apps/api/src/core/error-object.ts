// Purpose: The `error` object every gateway error body and Chat error frame carries.
// Why: OpenAI-compatible SDKs read `error.message`, `error.type` and `error.code`
//      from an object (https://platform.openai.com/docs/guides/error-codes); a bare
//      code string leaves them with a generic error and no message.
// How: One mapping from HTTP status (or, inside a stream, the error code) to an
//      error type, and one function that turns a body whose `error` is a code string
//      into `{ code, message, type, param, metadata }`. The other top-level fields
//      stay, and the code string is also kept as top-level `code` for readers that
//      took `error` as a string.

export type GatewayErrorType =
	| "invalid_request_error"
	| "authentication_error"
	| "permission_error"
	| "not_found_error"
	| "rate_limit_error"
	| "insufficient_quota"
	| "server_error"
	| "service_unavailable"
	| "overloaded";

export type GatewayErrorObject = {
	code: string;
	message: string;
	type: GatewayErrorType;
	param: string | null;
	metadata?: Record<string, unknown>;
};

const ERROR_TYPES = new Set<string>([
	"invalid_request_error",
	"authentication_error",
	"permission_error",
	"not_found_error",
	"rate_limit_error",
	"insufficient_quota",
	"server_error",
	"service_unavailable",
	"overloaded",
]);

// Used only when there is no HTTP status, as for an error inside a stream.
const TYPE_BY_CODE: Record<string, GatewayErrorType> = {
	unauthorised: "authentication_error",
	unauthorized: "authentication_error",
	invalid_api_key: "authentication_error",
	permission_denied: "permission_error",
	guardrail_blocked: "permission_error",
	not_found: "not_found_error",
	model_not_found: "not_found_error",
	rate_limit_exceeded: "rate_limit_error",
	key_limit_exceeded: "rate_limit_error",
	phaseo_free_model_limit_exceeded: "rate_limit_error",
	insufficient_funds: "insufficient_quota",
	overloaded_error: "overloaded",
	api_error: "server_error",
	validation_error: "invalid_request_error",
	invalid_json: "invalid_request_error",
	invalid_request: "invalid_request_error",
	model_required: "invalid_request_error",
	context_length_exceeded: "invalid_request_error",
	unsupported_parameter: "invalid_request_error",
	payload_too_large: "invalid_request_error",
};

function typeForStatus(status: number): GatewayErrorType | null {
	if (!Number.isFinite(status) || status < 400) return null;
	switch (status) {
		case 401:
			return "authentication_error";
		case 402:
			return "insufficient_quota";
		case 403:
			return "permission_error";
		case 404:
			return "not_found_error";
		case 408:
			return "server_error";
		case 429:
			return "rate_limit_error";
		case 503:
			return "service_unavailable";
		case 529:
			return "overloaded";
	}
	return status >= 500 ? "server_error" : "invalid_request_error";
}

/**
 * The error type for a failure: from the HTTP status when there is one, as the
 * OpenAI SDKs pick their exception class by status, otherwise from the code.
 */
export function errorTypeFor(status: number | null | undefined, code?: string | null): GatewayErrorType {
	const byStatus = typeForStatus(Number(status ?? NaN));
	if (byStatus) return byStatus;
	const normalised = typeof code === "string" ? code.trim().toLowerCase() : "";
	if (ERROR_TYPES.has(normalised)) return normalised as GatewayErrorType;
	return TYPE_BY_CODE[normalised] ?? "server_error";
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function paramFromPath(path: unknown): string | null {
	if (typeof path === "string") return nonEmptyString(path);
	if (!Array.isArray(path) || path.length === 0) return null;
	return path.map((part) => String(part)).join(".");
}

function paramOf(body: Record<string, unknown>): string | null {
	const direct = nonEmptyString(body.param);
	if (direct) return direct;
	const upstream = body.upstream_error as Record<string, unknown> | null | undefined;
	const upstreamParam = upstream && typeof upstream === "object" ? nonEmptyString(upstream.param) : null;
	if (upstreamParam) return upstreamParam;
	const first = Array.isArray(body.details) ? body.details[0] : null;
	return first && typeof first === "object" ? paramFromPath((first as Record<string, unknown>).path) : null;
}

// Structured detail the gateway already returns at the top level that says which
// provider failed or when to retry. Repeated under `error.metadata`.
const METADATA_FIELDS = [
	"provider",
	"reason",
	"retryable",
	"retry_after_seconds",
	"reset_at",
	"attempt_count",
	"failed_providers",
	"failed_statuses",
	"upstream_error",
	"provider_payment_required_provider",
	"policy_id",
	"limit_scope",
	"retired_at",
	"replacement_model",
] as const;

function metadataOf(body: Record<string, unknown>, retryAfter: string | null | undefined): Record<string, unknown> | null {
	const metadata: Record<string, unknown> = {};
	for (const field of METADATA_FIELDS) {
		const value = body[field];
		if (value !== undefined && value !== null) metadata[field] = value;
	}
	if (metadata.retry_after_seconds === undefined && retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds) && seconds >= 0) metadata.retry_after_seconds = seconds;
	}
	return Object.keys(metadata).length > 0 ? metadata : null;
}

/** The error code of a gateway error body, in either the old or the current shape. */
export function errorCodeOf(body: unknown): string | null {
	if (!body || typeof body !== "object") return null;
	const record = body as Record<string, unknown>;
	if (typeof record.error === "string") return record.error;
	if (typeof record.code === "string") return record.code;
	const error = record.error as Record<string, unknown> | null | undefined;
	return error && typeof error === "object" && typeof error.code === "string" ? error.code : null;
}

/**
 * Turns a gateway error body (`error` holding the code string) into one whose
 * `error` is an object, keeping every other field and adding top-level `code`.
 * A body already in this shape gets its `error.type` refreshed for `status`; any
 * other body (an upstream's own error object, for example) is returned unchanged.
 */
export function withErrorObject(
	body: Record<string, unknown>,
	status: number,
	opts: { retryAfter?: string | null } = {},
): Record<string, unknown> {
	if (typeof body.error !== "string") {
		const existing = body.error as Record<string, unknown> | null | undefined;
		if (
			existing &&
			typeof existing === "object" &&
			typeof existing.code === "string" &&
			body.code === existing.code
		) {
			return { ...body, error: { ...existing, type: errorTypeFor(status, existing.code) } };
		}
		return body;
	}
	const code = body.error;
	const message =
		nonEmptyString(body.message) ??
		nonEmptyString(body.description) ??
		code;
	const error: GatewayErrorObject = {
		code,
		message,
		type: errorTypeFor(status, code),
		param: paramOf(body),
	};
	const metadata = metadataOf(body, opts.retryAfter);
	if (metadata) error.metadata = metadata;
	return { ...body, error, code: typeof body.code === "string" ? body.code : code };
}

/**
 * Reshapes a JSON error response whose body still holds `error` as a code string.
 * Other responses are returned as they are.
 */
export async function withErrorObjectResponse(response: Response): Promise<Response> {
	if (response.status < 400) return response;
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().includes("application/json")) return response;
	let body: unknown;
	try {
		body = await response.clone().json();
	} catch {
		return response;
	}
	if (!body || typeof body !== "object" || Array.isArray(body)) return response;
	if (typeof (body as Record<string, unknown>).error !== "string") return response;
	response.body?.cancel().catch(() => undefined);
	const shaped = withErrorObject(body as Record<string, unknown>, response.status, {
		retryAfter: response.headers.get("retry-after"),
	});
	const headers = new Headers(response.headers);
	headers.delete("content-length");
	return new Response(JSON.stringify(shaped), {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/**
 * A Chat Completions stream error frame. OpenAI SDKs raise on a frame's `error`
 * object; `object`, `message` and `code` stay at the top level for existing readers.
 */
export function chatStreamErrorFrame(args: { message: string; code?: string | null }): Record<string, unknown> {
	const code = nonEmptyString(args.code);
	return {
		object: "error",
		message: args.message,
		...(code ? { code } : {}),
		error: {
			code,
			message: args.message,
			type: errorTypeFor(null, code),
			param: null,
		},
	};
}
