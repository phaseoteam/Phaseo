export type AuthMethod = "password" | "social" | "sso" | "unknown";

export const SENSITIVE_AUTH_MAX_AGE_SECONDS = 5 * 60;

const NON_INTERACTIVE_AUTH_METHODS = new Set([
	"refresh_token",
	"token_refresh",
]);

function normalizeTimestampSeconds(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return null;
	}

	return Math.floor(value);
}

export function latestInteractiveAuthenticationTimestamp(
	claims: Record<string, unknown> | null | undefined,
): number | null {
	const rawAmr = claims?.amr;
	if (!Array.isArray(rawAmr)) return null;

	let latest: number | null = null;
	for (const entry of rawAmr) {
		if (typeof entry !== "object" || entry === null) continue;

		const method = String(
			(entry as { method?: unknown }).method ?? "",
		).toLowerCase();
		if (!method || NON_INTERACTIVE_AUTH_METHODS.has(method)) continue;

		const timestamp = normalizeTimestampSeconds(
			(entry as { timestamp?: unknown }).timestamp,
		);
		if (timestamp !== null && (latest === null || timestamp > latest)) {
			latest = timestamp;
		}
	}

	return latest;
}

export function hasRecentInteractiveAuthentication(
	claims: Record<string, unknown> | null | undefined,
	options: {
		maxAgeSeconds?: number;
		nowSeconds?: number;
	} = {},
): boolean {
	const latest = latestInteractiveAuthenticationTimestamp(claims);
	if (latest === null) return false;

	const now = Math.floor(options.nowSeconds ?? Date.now() / 1000);
	const maxAge = options.maxAgeSeconds ?? SENSITIVE_AUTH_MAX_AGE_SECONDS;
	const age = now - latest;

	return age >= 0 && age <= maxAge;
}

export function hasRecentSignIn(
	lastSignInAt: string | null | undefined,
	options: {
		maxAgeSeconds?: number;
		nowMilliseconds?: number;
	} = {},
): boolean {
	if (!lastSignInAt) return false;
	const timestamp = Date.parse(lastSignInAt);
	if (!Number.isFinite(timestamp)) return false;

	const now = options.nowMilliseconds ?? Date.now();
	const maxAgeMilliseconds =
		(options.maxAgeSeconds ?? SENSITIVE_AUTH_MAX_AGE_SECONDS) * 1000;
	const age = now - timestamp;

	return age >= 0 && age <= maxAgeMilliseconds;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
	const parts = token.split(".");
	if (parts.length < 2 || !parts[1]) return null;

	try {
		const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = payload.padEnd(
			payload.length + ((4 - (payload.length % 4 || 4)) % 4),
			"=",
		);
		const json = Buffer.from(padded, "base64").toString("utf8");
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function classifyAuthMethodFromJwtClaims(
	claims: Record<string, unknown> | null | undefined,
): AuthMethod {
	const rawAmr = claims?.amr;
	if (Array.isArray(rawAmr)) {
		for (const entry of rawAmr) {
			const method =
				typeof entry === "string"
					? entry
					: typeof entry === "object" &&
							entry !== null &&
							typeof (entry as { method?: unknown }).method === "string"
						? String((entry as { method: string }).method)
						: "";
			const normalized = method.toLowerCase();
			if (normalized.startsWith("sso/")) return "sso";
			if (normalized === "password") return "password";
			if (
				normalized === "oauth" ||
				normalized === "oidc" ||
				normalized.startsWith("social")
			) {
				return "social";
			}
		}
	}

	return "unknown";
}

export function classifyAuthMethodFromSession(
	session:
		| {
				access_token?: string | null;
			}
		| null
		| undefined,
): AuthMethod {
	const accessToken = String(session?.access_token ?? "").trim();
	if (!accessToken) return "unknown";
	const claims = decodeJwtPayload(accessToken);
	return classifyAuthMethodFromJwtClaims(claims);
}

export function classifyAuthMethodFromProvider(provider: unknown): AuthMethod {
	const normalized = String(provider ?? "").trim().toLowerCase();
	if (!normalized) return "unknown";
	if (normalized === "email") return "password";
	if (normalized === "sso" || normalized.startsWith("custom:")) return "sso";
	return "social";
}
