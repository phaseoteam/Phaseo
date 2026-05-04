import type { Endpoint } from "./types";

export const TEXT_SESSION_ID_MAX_LENGTH = 256;

export function isBodyOnlyTextSessionEndpoint(endpoint: Endpoint): boolean {
	return (
		endpoint === "chat.completions" ||
		endpoint === "responses" ||
		endpoint === "messages"
	);
}

export function normalizeTextBodySessionId(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length > TEXT_SESSION_ID_MAX_LENGTH) return null;
	return trimmed;
}
