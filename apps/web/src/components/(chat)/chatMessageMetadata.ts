type ChatEndpoint = "chat.completions" | "responses" | string;

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function firstNonEmptyString(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return null;
}

export function getChatPayloadRequestId(
	payload: unknown,
	endpoint: ChatEndpoint,
): string | null {
	const record = asRecord(payload);
	if (!record) return null;
	const response = asRecord(record.response);

	const explicitRequestId = firstNonEmptyString(
		record.request_id,
		record.requestId,
		record.generation_id,
		record.generationId,
		response?.request_id,
		response?.requestId,
		response?.generation_id,
		response?.generationId,
	);
	if (explicitRequestId) return explicitRequestId;

	if (endpoint !== "responses") return null;
	return firstNonEmptyString(
		response?.object === "response" ? response.id : null,
		record.object === "response" ? record.id : null,
	);
}

export function getChatMessageRequestId(meta: unknown): string | null {
	const record = asRecord(meta);
	if (!record) return null;
	const requestError = asRecord(record.chat_request_error);

	return firstNonEmptyString(
		record.request_id,
		record.requestId,
		record.generation_id,
		record.generationId,
		requestError?.requestId,
		requestError?.request_id,
	);
}

export function buildChatRequestLogHref(requestId: string): string {
	return `/settings/usage/logs/requests/${encodeURIComponent(requestId)}`;
}
