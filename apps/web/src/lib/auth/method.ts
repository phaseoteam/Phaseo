export type AuthMethod = "password" | "social" | "sso" | "unknown";

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
