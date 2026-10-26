import { describe, expect, it, vi } from "vitest";
import { phaseoProfile, renewPhaseoKey } from "./phaseoOAuth";

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
