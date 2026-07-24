/**
 * Gemini's native Schema type is an OpenAPI subset and does not accept every
 * JSON Schema keyword. In particular, additionalProperties is rejected in
 * function declaration parameters even when it is valid in the caller's
 * OpenAI-compatible tool schema.
 */
export function sanitizeGeminiSchema(schema: unknown): unknown {
	if (Array.isArray(schema)) {
		return schema.map(sanitizeGeminiSchema);
	}

	if (!schema || typeof schema !== "object") {
		return schema;
	}

	const sanitized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(schema)) {
		if (key === "additionalProperties") continue;
		sanitized[key] = sanitizeGeminiSchema(value);
	}

	return sanitized;
}
