import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { browserSignIn, issuePhaseoKey, parsePhaseoSession, passwordSignIn, phaseoAccountProfile, refreshPhaseoSession, secondFactor, verifySecondFactor, type PhaseoSession } from "./phaseoLogin";
import { PHASEO_GATEWAY_ENDPOINT } from "./phaseoOAuth";

const jwt = (claims: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const tokens = { access_token: jwt({ aal: "aal1" }), refresh_token: "owned-refresh", token_type: "bearer", expires_in: 3600, user: { id: "user-1", email: "ada@example.invalid" } };
const session: PhaseoSession = { accessToken: tokens.access_token, refreshToken: "owned-refresh", expiresAt: Date.now() + 3_600_000, userId: "user-1" };
const respond = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const callback = (authorize: URL) => { const url = new URL(authorize.searchParams.get("redirect_to")!); url.searchParams.set("code", "owned-code"); return url; };

describe("Phaseo login in the browser", () => {
	it("binds the code to this sign-in's PKCE verifier and returns the login", async () => {
		let authorize!: URL;
		const fetcher = respond(tokens);
		const result = await browserSignIn({ provider: "github", signal: new AbortController().signal, fetcher: fetcher as unknown as typeof fetch, openBrowser: async url => { authorize = new URL(url); expect((await fetch(callback(authorize))).status).toBe(200); } });
		expect(authorize.pathname).toBe("/auth/v1/authorize");
		expect(authorize.searchParams.get("provider")).toBe("github");
		expect(authorize.searchParams.get("redirect_to")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
		expect(authorize.searchParams.get("code_challenge_method")).toBe("s256");
		const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
		const body = JSON.parse(String(request.body)) as { auth_code: string; code_verifier: string };
		expect(url).toMatch(/\/auth\/v1\/token\?grant_type=pkce$/); expect(request.redirect).toBe("error");
		expect((request.headers as Record<string, string>).apikey).toMatch(/^sb_publishable_/);
		expect(body.auth_code).toBe("owned-code");
		expect(createHash("sha256").update(body.code_verifier).digest("base64url")).toBe(authorize.searchParams.get("code_challenge"));
		expect(result).toMatchObject({ accessToken: tokens.access_token, refreshToken: "owned-refresh", userId: "user-1", email: "ada@example.invalid" });
		expect(result.expiresAt).toBeGreaterThan(Date.now());
	});
	it("takes one callback, refuses malformed ones, and reports a declined sign-in", async () => {
		const fetcher = respond(tokens);
		await browserSignIn({ provider: "google", signal: new AbortController().signal, fetcher: fetcher as unknown as typeof fetch, openBrowser: async value => {
			const real = callback(new URL(value));
			const duplicate = new URL(real); duplicate.searchParams.append("code", "second"); expect((await fetch(duplicate)).status).toBe(400);
			expect((await fetch(real, { method: "POST" })).status).toBe(400);
			const wrongPath = new URL(real); wrongPath.pathname = "/other"; expect((await fetch(wrongPath)).status).toBe(400);
			expect((await fetch(real)).status).toBe(200);
			expect((await fetch(real)).status).toBe(400);
		} });
		expect(fetcher).toHaveBeenCalledTimes(1);
		await expect(browserSignIn({ provider: "gitlab", signal: new AbortController().signal, fetcher: vi.fn(), openBrowser: async value => {
			const url = new URL(new URL(value).searchParams.get("redirect_to")!); url.searchParams.set("error", "access_denied"); await fetch(url);
		} })).rejects.toThrow("declined");
	});
	it("cancels, times out and survives a browser failure without leaving a listener", async () => {
		const controller = new AbortController(); const fetcher = vi.fn(); let url!: URL;
		await expect(browserSignIn({ provider: "github", signal: controller.signal, fetcher, openBrowser: async value => { url = callback(new URL(value)); controller.abort(); } })).rejects.toThrow("canceled");
		expect(fetcher).not.toHaveBeenCalled(); await expect(fetch(url)).rejects.toThrow();
		await expect(browserSignIn({ provider: "github", signal: new AbortController().signal, openBrowser: async () => { throw new Error("Browser unavailable"); } })).rejects.toThrow("Browser unavailable");
		await expect(browserSignIn({ provider: "github", signal: new AbortController().signal, timeoutMs: 25, openBrowser: async () => {} })).rejects.toThrow("timed out");
	});
});

describe("Phaseo login with a password", () => {
	it("signs in, and words failures for the form without the server's text", async () => {
		const fetcher = respond(tokens);
		expect(await passwordSignIn("ada@example.invalid", "secret", fetcher as unknown as typeof fetch)).toMatchObject({ userId: "user-1" });
		expect(JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ email: "ada@example.invalid", password: "secret" });
		for (const [body, status, text] of [[{ code: "invalid_credentials", msg: "Invalid login credentials" }, 400, "don't match"], [{ error_code: "email_not_confirmed" }, 400, "Confirm your email"], [{ msg: "slow down" }, 429, "Too many attempts"], [{ msg: "owned-server-text" }, 500, "HTTP 500"]] as const) {
			const error = await passwordSignIn("ada@example.invalid", "secret", respond(body, status) as unknown as typeof fetch).catch((reason: Error) => reason);
			expect(error).toBeInstanceOf(Error); expect((error as Error).message).toContain(text); expect((error as Error).message).not.toContain("owned-server-text");
		}
		await expect(passwordSignIn("a@b.c", "x", respond({ ...tokens, expires_in: -1 }) as unknown as typeof fetch)).rejects.toThrow("invalid sign-in response");
	});
	it("refreshes with the refresh token, and says when the login has ended", async () => {
		const fetcher = respond({ ...tokens, refresh_token: "next-refresh" });
		expect((await refreshPhaseoSession("owned-refresh", fetcher as unknown as typeof fetch)).refreshToken).toBe("next-refresh");
		expect((fetcher.mock.calls[0] as unknown as [string])[0]).toMatch(/grant_type=refresh_token$/);
		await expect(refreshPhaseoSession("used", respond({ error_code: "refresh_token_already_used" }, 400) as unknown as typeof fetch)).rejects.toThrow("Sign in again");
	});
});

describe("Phaseo two-factor sign-in", () => {
	it("asks for a code only when the account has a verified authenticator and the login hasn't used it", async () => {
		expect(await secondFactor(session, respond({ factors: [{ id: "factor-1", status: "verified", factor_type: "totp" }] }) as unknown as typeof fetch)).toBe("factor-1");
		expect(await secondFactor(session, respond({ factors: [{ id: "factor-1", status: "unverified", factor_type: "totp" }] }) as unknown as typeof fetch)).toBeUndefined();
		const fetcher = vi.fn();
		expect(await secondFactor({ ...session, accessToken: jwt({ aal: "aal2" }) }, fetcher)).toBeUndefined();
		expect(fetcher).not.toHaveBeenCalled();
	});
	it("challenges, then verifies the code for a login that has used it", async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ id: "challenge-1" })).mockResolvedValueOnce(Response.json({ ...tokens, access_token: jwt({ aal: "aal2" }) }));
		const verified = await verifySecondFactor(session, "factor-1", "123456", fetcher);
		expect(fetcher.mock.calls.map(([url]) => String(url).replace(/^.*\/auth\/v1/, ""))).toEqual(["/factors/factor-1/challenge", "/factors/factor-1/verify"]);
		expect(JSON.parse(String(fetcher.mock.calls[1][1].body))).toEqual({ challenge_id: "challenge-1", code: "123456" });
		expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${session.accessToken}`);
		expect(verified.accessToken).toBe(jwt({ aal: "aal2" }));
		const wrong = vi.fn().mockResolvedValueOnce(Response.json({ id: "challenge-2" })).mockResolvedValueOnce(Response.json({ code: "mfa_verification_failed" }, { status: 422 }));
		await expect(verifySecondFactor(session, "factor-1", "000000", wrong)).rejects.toThrow("That code didn't work");
	});
});

describe("Phaseo desktop key for a login", () => {
	const issued = { access_token: "owned-desktop-key", token_type: "Bearer", workspace_id: "ws-1", scope: "gateway:access models:read", resource: PHASEO_GATEWAY_ENDPOINT, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() };
	it("asks the API for a key with the login, for a workspace when one is given", async () => {
		const fetcher = respond(issued);
		expect(await issuePhaseoKey(session, "ws-1", fetcher as unknown as typeof fetch)).toEqual({ key: "owned-desktop-key", expiresAt: issued.expires_at, workspaceId: "ws-1" });
		const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.phaseo.app/oauth/desktop/key"); expect(request.redirect).toBe("error");
		expect((request.headers as Record<string, string>).Authorization).toBe(`Bearer ${session.accessToken}`);
		expect(JSON.parse(String(request.body))).toEqual({ workspace_id: "ws-1" });
		await issuePhaseoKey(session, undefined, fetcher as unknown as typeof fetch);
		expect(JSON.parse(String((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toEqual({});
	});
	it("refuses a key that isn't a gateway key, and words the API's refusals", async () => {
		for (const invalid of [{ ...issued, resource: "https://another.example/v1" }, { ...issued, scope: "models:read" }, { ...issued, expires_at: new Date(Date.now() - 1000).toISOString() }, { ...issued, access_token: "" }]) {
			await expect(issuePhaseoKey(session, undefined, respond(invalid) as unknown as typeof fetch)).rejects.toThrow("invalid sign-in response");
		}
		await expect(issuePhaseoKey(session, undefined, respond({ error: "insufficient_user_authentication" }, 401) as unknown as typeof fetch)).rejects.toThrow("two-factor");
		await expect(issuePhaseoKey(session, "ws-2", respond({ error: "access_denied" }, 403) as unknown as typeof fetch)).rejects.toThrow("isn't a member");
		await expect(issuePhaseoKey(session, undefined, respond({}, 404) as unknown as typeof fetch)).rejects.toThrow("isn't available on this server yet");
	});
});

describe("Phaseo profile for a login", () => {
	it("reads the website's profile: chosen name, first name, email and an https photo", async () => {
		const fetcher = respond({ profile: { displayName: " Ada Lovelace ", email: "ada@example.invalid", avatarUrl: "https://avatars.githubusercontent.com/u/1" } });
		expect(await phaseoAccountProfile(session, fetcher as unknown as typeof fetch)).toMatchObject({ name: "Ada Lovelace", givenName: "Ada", email: "ada@example.invalid", picture: "https://avatars.githubusercontent.com/u/1" });
		expect(fetcher).toHaveBeenCalledWith("https://phaseo.app/api/account/settings/profile", expect.objectContaining({ headers: { Authorization: `Bearer ${session.accessToken}` } }));
		expect(await phaseoAccountProfile(session, respond({ profile: { displayName: "Ada", avatarUrl: "http://example.invalid/a.png" } }) as unknown as typeof fetch)).not.toHaveProperty("picture");
		await expect(phaseoAccountProfile(session, respond({ profile: null }) as unknown as typeof fetch)).rejects.toThrow("Sign in again");
	});
	it("reads a stored login, and says when one is damaged", () => {
		expect(parsePhaseoSession(JSON.stringify(session))).toEqual(session);
		expect(() => parsePhaseoSession("{")).toThrow("damaged");
		expect(() => parsePhaseoSession(JSON.stringify({ accessToken: "a" }))).toThrow("damaged");
	});
});
