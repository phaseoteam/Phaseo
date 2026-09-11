import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	KEY_PEPPER_ACTIVE: "test-pepper",
};

async function hmac(secret: string) {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey("raw", encoder.encode(env.KEY_PEPPER_ACTIVE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(secret)))]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

afterEach(() => vi.unstubAllGlobals());

describe("API key lookup", () => {
	it("returns the matching key id after verifying the full plaintext key", async () => {
		const kid = "AbCdEf123456";
		const secret = "a".repeat(40);
		const hash = await hmac(secret);
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(String(input), init);
			const url = request.url;
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "admin@example.com", app_metadata: {}, user_metadata: {} }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("workspaces") && url.includes("owner_user_id")) return new Response(JSON.stringify([{ owner_user_id: "owner-1" }]), { status: 200 });
			if (url.includes("/rest/v1/keys")) return new Response(JSON.stringify([{ id: "key-1", kid, hash }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/keys/lookup", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", key: `phaseo_v1_sk_${kid}_${secret}` }),
		}, env);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ keyId: "key-1" });
	});

	it("accepts gateway-compatible legacy keys with underscores in the secret", async () => {
		const kid = "legacy-kid";
		const secret = "legacy_secret_with_underscores";
		const hash = await hmac(secret);
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(String(input), init);
			const url = request.url;
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "admin@example.com", app_metadata: {}, user_metadata: {} }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("workspaces") && url.includes("owner_user_id")) return new Response(JSON.stringify([{ owner_user_id: "owner-1" }]), { status: 200 });
			if (url.includes("/rest/v1/keys")) return new Response(JSON.stringify([{ id: "legacy-key-1", kid, hash }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/keys/lookup", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", key: `aistats_v1_sk_${kid}_${secret}` }),
		}, env);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ keyId: "legacy-key-1" });
	});

	it("does not query stored keys for malformed input", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : new Request(String(input), init);
			const url = request.url;
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "admin@example.com", app_metadata: {}, user_metadata: {} }), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("workspaces") && url.includes("owner_user_id")) return new Response(JSON.stringify([{ owner_user_id: "owner-1" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/account/settings/keys/lookup", {
			method: "POST",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1", key: "not-a-key" }),
		}, env);

		expect(await response.json()).toEqual({ keyId: null });
		expect(fetchMock.mock.calls.some(([input]) => (input instanceof Request ? input.url : String(input)).includes("/rest/v1/keys"))).toBe(false);
	});
});
