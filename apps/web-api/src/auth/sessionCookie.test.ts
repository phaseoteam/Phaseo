import { describe, expect, it } from "vitest";
import type { Env } from "@/env";
import { sessionCookieAccessToken, supabaseAuthCookieName, withSessionAuthorization } from "./sessionCookie";

const env = { ENV: "production", SUPABASE_URL: "https://xansbgjaduxypzsmjwct.supabase.co" } as Env;
const NAME = "sb-xansbgjaduxypzsmjwct-auth-token";
const SESSION = JSON.stringify({ access_token: "header.payload.signature", refresh_token: "r", expires_at: 1, user: { id: "u" } });

function request(cookie: string, headers: Record<string, string> = {}) {
	return new Request("https://phaseo.app/api/account/settings/slack/oauth/callback?code=x", { headers: { cookie, ...headers } });
}

describe("Supabase session cookie", () => {
	it("names the cookie after the project, as the Supabase client does", () => {
		expect(supabaseAuthCookieName(env)).toBe(NAME);
		expect(supabaseAuthCookieName({ ENV: "development", SUPABASE_URL: "http://127.0.0.1:54321" } as Env)).toBe("sb-127-auth-token");
		expect(supabaseAuthCookieName({ ENV: "development" } as Env)).toBeNull();
	});

	it("reads a base64url session cookie", () => {
		const value = `base64-${Buffer.from(SESSION).toString("base64url")}`;
		expect(sessionCookieAccessToken(request(`theme=dark; ${NAME}=${value}; activeWorkspaceId=w`), env)).toBe("header.payload.signature");
	});

	it("joins chunked cookies in order", () => {
		const value = `base64-${Buffer.from(SESSION).toString("base64url")}`;
		const cut = Math.floor(value.length / 2);
		const cookie = `${NAME}.1=${value.slice(cut)}; ${NAME}.0=${value.slice(0, cut)}`;
		expect(sessionCookieAccessToken(request(cookie), env)).toBe("header.payload.signature");
	});

	it("reads an older URL-encoded JSON cookie", () => {
		expect(sessionCookieAccessToken(request(`${NAME}=${encodeURIComponent(SESSION)}`), env)).toBe("header.payload.signature");
	});

	it("ignores other projects' cookies and anything malformed", () => {
		expect(sessionCookieAccessToken(request(`sb-otherproject-auth-token=${encodeURIComponent(SESSION)}`), env)).toBeNull();
		expect(sessionCookieAccessToken(request(`${NAME}=base64-%%%`), env)).toBeNull();
		expect(sessionCookieAccessToken(request(`${NAME}=not-json`), env)).toBeNull();
		expect(sessionCookieAccessToken(request(`${NAME}=${encodeURIComponent(JSON.stringify({ access_token: 5 }))}`), env)).toBeNull();
		expect(sessionCookieAccessToken(request(""), env)).toBeNull();
	});

	it("prefers the request's own bearer token, and otherwise turns the cookie into one", () => {
		const own = request(`${NAME}=${encodeURIComponent(SESSION)}`, { authorization: "Bearer own-token" });
		expect(withSessionAuthorization(own, env)).toBe(own);
		const fromCookie = withSessionAuthorization(request(`${NAME}=${encodeURIComponent(SESSION)}`), env);
		expect(fromCookie?.headers.get("authorization")).toBe("Bearer header.payload.signature");
		expect(fromCookie?.headers.get("cookie")).toBeNull();
		expect(withSessionAuthorization(request("theme=dark"), env)).toBeNull();
	});
});
