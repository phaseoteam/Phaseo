export const DEFAULT_POST_AUTH_REDIRECT = "/";

export function sanitizeReturnUrl(
	candidate: unknown,
	fallback: string = DEFAULT_POST_AUTH_REDIRECT
): string {
	if (typeof candidate !== "string") return fallback;
	const raw = candidate.trim();
	if (!raw) return fallback;
	if (/[\u0000-\u001F\u007F]/.test(raw)) return fallback;
	if (!raw.startsWith("/")) return fallback;

	let decoded = raw;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		return fallback;
	}

	const normalized = decoded.replace(/\\/g, "/");
	if (!normalized.startsWith("/")) return fallback;
	if (normalized.startsWith("//")) return fallback;

	const lower = normalized.toLowerCase();
	if (lower.startsWith("/sign-in") || lower.startsWith("/sign-up")) {
		return fallback;
	}
	if (lower.startsWith("/auth/callback")) return fallback;
	return normalized;
}
