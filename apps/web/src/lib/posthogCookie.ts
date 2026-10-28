export type PosthogCookieIdentity = {
	distinctId: string;
	sessionId: string | null;
	identified: boolean;
};

/**
 * Reads the browser SDK's `ph_<project key>_posthog` cookie so server-side
 * events can be linked to the same person and session replay.
 */
export function readPosthogCookieIdentity(
	cookieHeader: string | null | undefined,
	projectKey: string | null | undefined,
): PosthogCookieIdentity | null {
	if (!cookieHeader || !projectKey) return null;

	const prefix = `ph_${projectKey}_posthog=`;
	for (const entry of cookieHeader.split(";")) {
		const cookie = entry.trim();
		if (!cookie.startsWith(prefix)) continue;
		try {
			const value: unknown = JSON.parse(decodeURIComponent(cookie.slice(prefix.length)));
			if (!value || typeof value !== "object") return null;
			const { distinct_id: distinctId, $sesid: session, $user_state: userState } = value as Record<string, unknown>;
			if (typeof distinctId !== "string" || !distinctId) return null;
			// $sesid is [lastActivityTimestamp, sessionId, sessionStartTimestamp].
			const sessionId = Array.isArray(session) && typeof session[1] === "string" ? session[1] : null;
			return { distinctId, sessionId, identified: userState === "identified" };
		} catch {
			return null;
		}
	}
	return null;
}
