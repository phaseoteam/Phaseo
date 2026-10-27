import type { Env } from "@/env";

// Account routes normally authenticate with a bearer token that the web app's
// server adds. A browser navigation that lands directly on this Worker (an OAuth
// redirect back from another site to https://phaseo.app/api/account/...) has no
// such header, but it does carry the session cookie the web app's Supabase client
// keeps on phaseo.app (SameSite=Lax, so it is sent on top-level GET navigations).
// This reads the access token from that cookie so requireUser can verify it the
// usual way (signature, expiry and the MFA level). The cookie is never trusted on
// its own, and it is never refreshed here.

const MAX_CHUNKS = 16;
const BASE64_PREFIX = "base64-";

function cookies(request: Request): Map<string, string> {
	const values = new Map<string, string>();
	for (const segment of (request.headers.get("cookie") ?? "").split(";")) {
		const separator = segment.indexOf("=");
		if (separator < 0) continue;
		const name = segment.slice(0, separator).trim();
		if (!name || values.has(name)) continue;
		const value = segment.slice(separator + 1).trim();
		try { values.set(name, decodeURIComponent(value)); } catch { values.set(name, value); }
	}
	return values;
}

/** The Supabase client's default storage key: sb-<first label of the project host>-auth-token. */
export function supabaseAuthCookieName(env: Env): string | null {
	const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
	if (!url) return null;
	try {
		const reference = new URL(url).hostname.split(".")[0];
		return reference ? `sb-${reference}-auth-token` : null;
	} catch {
		return null;
	}
}

function decodeBase64Url(value: string): string | null {
	if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) return null;
	try {
		const base64 = value.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
		const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (character) => character.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
}

/** The access token in the browser's Supabase session cookie (whole or chunked, base64url or raw JSON), if any. */
export function sessionCookieAccessToken(request: Request, env: Env): string | null {
	const name = supabaseAuthCookieName(env);
	if (!name) return null;
	const jar = cookies(request);
	let raw = jar.get(name);
	if (raw === undefined) {
		const chunks: string[] = [];
		for (let index = 0; index < MAX_CHUNKS; index += 1) {
			const chunk = jar.get(`${name}.${index}`);
			if (chunk === undefined) break;
			chunks.push(chunk);
		}
		raw = chunks.length ? chunks.join("") : undefined;
	}
	if (!raw) return null;
	const text = raw.startsWith(BASE64_PREFIX) ? decodeBase64Url(raw.slice(BASE64_PREFIX.length)) : raw;
	if (!text) return null;
	try {
		const session = JSON.parse(text) as { access_token?: unknown } | null;
		const token = session && typeof session === "object" ? session.access_token : null;
		return typeof token === "string" && token.length > 0 && token.length <= 8_192 ? token : null;
	} catch {
		return null;
	}
}

/**
 * The request's own bearer token, or else the session cookie's access token,
 * as a request that requireUser and requireAccountWorkspace accept.
 */
export function withSessionAuthorization(request: Request, env: Env): Request | null {
	const header = request.headers.get("authorization")?.trim();
	if (header?.startsWith("Bearer ") && header.slice("Bearer ".length).trim()) return request;
	const token = sessionCookieAccessToken(request, env);
	if (!token) return null;
	return new Request(request.url, { method: "GET", headers: { authorization: `Bearer ${token}` } });
}
