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

	const requestError = new Error(errorMessage) as ChatErrorPayload;
	if (errorCode) requestError.code = errorCode;
	requestError.status = response.status;
	requestError.requestId = errorRequestId;
	requestError.description = errorDescription;
	requestError.details = errorDetails;
	requestError.routingDiagnostics = routingDiagnostics ?? null;
	requestError.rawPayload = rawPayload;
	return requestError;
}
