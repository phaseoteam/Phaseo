export type ChatErrorPayload = Error & {
	code?: string;
	status?: number;
	requestId?: string;
	description?: string;
	details?: Array<{
		message: string;
		path?: string[];
		keyword?: string;
	}>;
	routingDiagnostics?: Record<string, unknown> | null;
	rawPayload?: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeErrorDetails(details: unknown) {
	if (!Array.isArray(details)) return undefined;

	return details.flatMap((detail) => {
		if (!detail || typeof detail !== "object") return [];
		const payload = detail as {
			message?: unknown;
			path?: unknown;
			keyword?: unknown;
		};
		if (typeof payload.message !== "string") return [];

		return [
			{
				message: payload.message,
				path: Array.isArray(payload.path)
					? payload.path.filter(
							(entry): entry is string => typeof entry === "string",
						)
					: undefined,
				keyword:
					typeof payload.keyword === "string" ? payload.keyword : undefined,
			},
		];
	});
}

function normalizeRoutingDiagnostics(payload: Record<string, unknown>) {
	const diagnostics = payload.routing_diagnostics;
	if (
		diagnostics &&
		typeof diagnostics === "object" &&
		!Array.isArray(diagnostics)
	) {
		return diagnostics as Record<string, unknown>;
	}
	return undefined;
}

function normalizeStatus(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function firstString(...values: unknown[]) {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return undefined;
}

function getNestedRecord(
	payload: Record<string, unknown>,
	key: string,
): Record<string, unknown> | undefined {
	const value = payload[key];
	return isRecord(value) ? value : undefined;
}

function buildChatErrorPayload(args: {
	message: string;
	status?: number;
	code?: string;
	requestId?: string;
	description?: string;
	details?: ChatErrorPayload["details"];
	routingDiagnostics?: Record<string, unknown> | null;
	rawPayload?: Record<string, unknown> | null;
}) {
	const requestError = new Error(args.message) as ChatErrorPayload;
	if (args.code) requestError.code = args.code;
	if (args.status != null) requestError.status = args.status;
	requestError.requestId = args.requestId;
	requestError.description = args.description;
	requestError.details = args.details;
	requestError.routingDiagnostics = args.routingDiagnostics ?? null;
	requestError.rawPayload = args.rawPayload ?? null;
	return requestError;
}

export function createChatStreamTextError(
	message: string,
	rawPayload?: Record<string, unknown> | null,
) {
	return buildChatErrorPayload({
		message: message.trim() || "The streamed response failed.",
		code: "stream_error",
		rawPayload,
	});
}

export function parseChatStreamErrorFrame(
	payload: unknown,
	frameEventType?: string | null,
): ChatErrorPayload | null {
	if (!isRecord(payload)) return null;

	const response = getNestedRecord(payload, "response");
	const payloadError = payload.error;
	const responseError = isRecord(response?.error)
		? response.error
		: undefined;
	const errorObject = isRecord(payloadError)
		? payloadError
		: responseError;
	const objectType = firstString(payload.object);
	const frameType = firstString(payload.type, frameEventType);
	const isErrorFrame =
		frameEventType === "error" ||
		frameType === "error" ||
		frameType === "response.failed" ||
		objectType === "error" ||
		Boolean(errorObject) ||
		typeof payloadError === "string";

	if (!isErrorFrame) return null;

	const rawPayload = {
		...(frameEventType ? { frame_event_type: frameEventType } : {}),
		...payload,
	};
	const message = firstString(
		errorObject?.message,
		responseError?.message,
		payload.message,
		payload.description,
		typeof payloadError === "string" ? payloadError : undefined,
	) ?? "The streamed response failed.";
	const description = firstString(
		payload.description,
		errorObject?.description,
		responseError?.description,
	);
	const code = firstString(
		errorObject?.code,
		errorObject?.type,
		responseError?.code,
		responseError?.type,
		payload.code,
		payload.error_code,
		typeof payloadError === "string" ? payloadError : undefined,
		objectType === "error" ? "stream_error" : undefined,
		frameType === "response.failed" ? "response_failed" : undefined,
	);
	const status = normalizeStatus(payload.status) ??
		normalizeStatus(payload.status_code) ??
		normalizeStatus(errorObject?.status) ??
		normalizeStatus(errorObject?.status_code);

	return buildChatErrorPayload({
		message,
		status,
		code,
		requestId: firstString(
			payload.request_id,
			payload.requestId,
			errorObject?.request_id,
			response?.id,
		),
		description,
		details: normalizeErrorDetails(payload.details),
		routingDiagnostics: normalizeRoutingDiagnostics(payload) ?? null,
		rawPayload,
	});
}

export async function parseChatErrorResponse(response: Response) {
	const contentType = response.headers.get("content-type") ?? "";
	let errorMessage = `Request failed (${response.status}).`;
	let errorCode: string | undefined;
	let errorRequestId: string | undefined;
	let errorDescription: string | undefined;
	let errorDetails: ChatErrorPayload["details"];
	let routingDiagnostics: Record<string, unknown> | null | undefined;
	let rawPayload: Record<string, unknown> | undefined;

	if (contentType.includes("application/json")) {
		try {
			const payload = (await response.json()) as Record<string, unknown> | null;
			if (payload) {
				rawPayload = payload;
				if (typeof payload.message === "string") {
					errorMessage = payload.message;
				} else if (typeof payload.description === "string") {
					errorMessage = payload.description;
				} else if (typeof payload.error === "string") {
					errorMessage = payload.error;
				}
				if (typeof payload.error === "string") {
					errorCode = payload.error;
				}
				if (typeof payload.request_id === "string") {
					errorRequestId = payload.request_id;
				}
				if (typeof payload.description === "string") {
					errorDescription = payload.description;
				}
				errorDetails = normalizeErrorDetails(payload.details);
				routingDiagnostics = normalizeRoutingDiagnostics(payload);
			}
		} catch {
			// Fall back to the status-derived message when the JSON body is malformed.
		}
	} else {
		const text = await response.text();
		if (text) errorMessage = text;
	}

	return buildChatErrorPayload({
		message: errorMessage,
		status: response.status,
		code: errorCode,
		requestId: errorRequestId,
		description: errorDescription,
		details: errorDetails,
		routingDiagnostics: routingDiagnostics ?? null,
		rawPayload: rawPayload ?? null,
	});
}
