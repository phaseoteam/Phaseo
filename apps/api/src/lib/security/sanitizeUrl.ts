const SENSITIVE_QUERY_KEYS = new Set([
	"key",
	"api_key",
	"x-api-key",
	"access_token",
	"refresh_token",
	"token",
	"sig",
	"signature",
]);

/** Remove credentials before a URL crosses any logging or persistence boundary. */
export function sanitizeUrlForLogging(value: string | null | undefined): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	try {
		const parsed = new URL(value);
		parsed.username = "";
		parsed.password = "";
		for (const key of Array.from(parsed.searchParams.keys())) {
			if (SENSITIVE_QUERY_KEYS.has(key.trim().toLowerCase())) {
				parsed.searchParams.set(key, "[redacted]");
			}
		}
		parsed.hash = "";
		return parsed.toString();
	} catch {
		return null;
	}
}
