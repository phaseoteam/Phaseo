import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PHASEO_GATEWAY_ENDPOINT, phaseoProfile, renewPhaseoKey, signInPhaseo } from "./phaseoOAuth";

const tokens = { access_token: "owned-fixture-key", token_type: "Bearer", expires_in: 3600, scope: "gateway:access models:read", resource: PHASEO_GATEWAY_ENDPOINT };
function callback(authorize: URL, state = authorize.searchParams.get("state")!) {
	const url = new URL(authorize.searchParams.get("redirect_uri")!); url.searchParams.set("code", "owned-code"); url.searchParams.set("state", state); return url;
}

describe("Phaseo desktop OAuth", () => {
	it("binds the code to PKCE, the desktop client and gateway resource", async () => {
		let authorization!: URL;
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokens)));
		const result = await signInPhaseo({ signal: new AbortController().signal, fetcher, openBrowser: async url => { authorization = new URL(url); expect(authorization.searchParams.has("code_verifier")).toBe(false); const response = await fetch(callback(authorization)); expect(response.status).toBe(200); } });
		const [url, request] = fetcher.mock.calls[0]; const body = request.body as URLSearchParams;
		expect(url).toBe("https://api.phaseo.app/oauth/token"); expect(request.redirect).toBe("error");
		expect(body.get("client_id")).toBe("phaseo_desktop"); expect(body.get("code")).toBe("owned-code");
		expect(body.get("resource")).toBe(PHASEO_GATEWAY_ENDPOINT); expect(body.get("redirect_uri")).toBe(authorization.searchParams.get("redirect_uri"));
		// Model calls and the account: the CLI's access as well as the gateway's.
		expect(authorization.searchParams.get("scope")!.split(" ")).toEqual(expect.arrayContaining(["openid", "profile", "email", "gateway:access", "models:read", "credits:read", "keys:write", "settings:write"]));
		expect(createHash("sha256").update(body.get("code_verifier")!).digest("base64url")).toBe(authorization.searchParams.get("code_challenge"));
		expect(result.key).toBe(tokens.access_token); expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now()); expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it("rejects forged, duplicate and malformed callbacks without consuming the real callback", async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokens)));
		await signInPhaseo({ signal: new AbortController().signal, fetcher, openBrowser: async value => {
			const authorize = new URL(value);
			for (const state of ["wrong", "é".repeat(43)]) expect((await fetch(callback(authorize, state))).status).toBe(400);
			const duplicate = callback(authorize); duplicate.searchParams.append("code", "second"); expect((await fetch(duplicate)).status).toBe(400);
			expect((await fetch(callback(authorize), { method: "POST" })).status).toBe(400);
			expect((await fetch(callback(authorize))).status).toBe(200);
		} });
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it("cancels and closes the loopback listener without exchanging a code", async () => {
		const controller = new AbortController(); const fetcher = vi.fn(); let url!: URL;
		await expect(signInPhaseo({ signal: controller.signal, fetcher, openBrowser: async value => { url = callback(new URL(value)); controller.abort(); } })).rejects.toThrow("canceled");
		expect(fetcher).not.toHaveBeenCalled(); await expect(fetch(url)).rejects.toThrow();
	});
	it("rejects insufficient consent and mismatched resources", async () => {
		for (const invalid of [{ ...tokens, scope: "models:read" }, { ...tokens, resource: "https://another.example/v1" }, { ...tokens, expires_in: -1 }]) {
			await expect(signInPhaseo({ signal: new AbortController().signal, fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(invalid))), openBrowser: async value => { await fetch(callback(new URL(value))); } })).rejects.toThrow("invalid sign-in response");
		}
	});
	it("bounds the response and redacts malformed token bodies", async () => {
		for (const body of ["owned-sensitive-token", "x".repeat(65_537)]) await expect(signInPhaseo({ signal: new AbortController().signal, fetcher: vi.fn().mockResolvedValue(new Response(body)), openBrowser: async value => { await fetch(callback(new URL(value))); } })).rejects.toThrow("Phaseo returned an invalid sign-in response.");
	});
	it("handles browser failures and timeout without leaving a listener", async () => {
		await expect(signInPhaseo({ signal: new AbortController().signal, openBrowser: async () => { throw new Error("Browser unavailable"); } })).rejects.toThrow("Browser unavailable");
		await expect(signInPhaseo({ signal: new AbortController().signal, timeoutMs: 25, openBrowser: async () => {} })).rejects.toThrow("timed out");
	});
});

describe("Phaseo profile", () => {
	it("reads the name, email and an https picture from userinfo with the account's token", async () => {
		const fetcher = vi.fn(async () => Response.json({ sub: "user", name: "  Ada Lovelace ", given_name: "Ada", email: "ada@example.invalid", picture: "https://lh3.googleusercontent.com/a/photo=s96-c" }));
		expect(await phaseoProfile("token", fetcher as unknown as typeof fetch)).toMatchObject({ name: "Ada Lovelace", givenName: "Ada", email: "ada@example.invalid", picture: "https://lh3.googleusercontent.com/a/photo=s96-c" });
		expect(fetcher).toHaveBeenCalledWith("https://api.phaseo.app/oauth/userinfo", expect.objectContaining({ headers: { Authorization: "Bearer token" } }));
		// Anything but an https picture is dropped, and a missing name stays missing.
		const plain = await phaseoProfile("token", (async () => Response.json({ email: "ada@example.invalid", picture: "http://example.invalid/a.png" })) as unknown as typeof fetch);
		expect(plain).not.toHaveProperty("picture"); expect(plain).not.toHaveProperty("name");
		await expect(phaseoProfile("token", (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch)).rejects.toThrow("HTTP 401");
	});
});

describe("Phaseo sign-in renewal", () => {
	it("renews the key with itself and returns its new expiry", async () => {
		const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
		const fetcher = vi.fn(async () => Response.json({ expires_at: expiresAt, expires_in: 2_592_000 }));
		expect(await renewPhaseoKey("token", fetcher as unknown as typeof fetch)).toBe(expiresAt);
		expect(fetcher).toHaveBeenCalledWith("https://api.phaseo.app/oauth/desktop/renew", expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer token" }, redirect: "error" }));
	});
	it("leaves the expiry alone on a server that can't renew yet, and fails on a refusal or a nonsense expiry", async () => {
		expect(await renewPhaseoKey("token", (async () => new Response("", { status: 404 })) as unknown as typeof fetch)).toBeUndefined();
		await expect(renewPhaseoKey("token", (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch)).rejects.toThrow("HTTP 401");
		for (const expires_at of [new Date(Date.now() - 1000).toISOString(), new Date(Date.now() + 365 * 86_400_000).toISOString(), "soon"]) {
			await expect(renewPhaseoKey("token", (async () => Response.json({ expires_at })) as unknown as typeof fetch)).rejects.toThrow("invalid renewal");
		}
	});
});
