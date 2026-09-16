import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

describe("provider catalog management API", () => {
	afterEach(() => vi.unstubAllGlobals());

	function stubEditorRead(role = "user") {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "provider-user", email: "provider@example.com" }), { status: 200 });
			if (url.includes("/rest/v1/users")) return new Response(JSON.stringify([{ role }]), { status: 200 });
			if (url.includes("/rest/v1/workspace_members")) return new Response(JSON.stringify([{ workspace_id: "workspace-1" }]), { status: 200 });
			if (url.includes("/rest/v1/workspaces")) return new Response(JSON.stringify([]), { status: 200 });
			if (url.includes("/rest/v1/provider_account_links")) return new Response(JSON.stringify([{ provider_slug: "synthetic", workspace_id: "workspace-1", role: "editor", status: "active" }]), { status: 200 });
			if (url.includes("/rest/v1/v2_providers")) return new Response(JSON.stringify([{ provider_slug: "synthetic", name: "Synthetic", status: "disabled" }]), { status: 200 });
			if (url.includes("/rest/v1/provider_catalog_sources")) return new Response(JSON.stringify([{ provider_slug: "synthetic", catalog_url: "https://provider.example/catalog.json", management_mode: "managed", managed_catalog: { data: [{ id: "synthetic/model-a", name: "Model A", provider_model_slug: "model-a", input_modalities: ["text"], output_modalities: ["text"], availability: "not_ready", capabilities: [{ id: "chat.completions", parameters: [] }], pricing: [] }] }, managed_updated_at: "2026-09-10T12:00:00Z", updated_at: "2026-09-10T12:00:00Z", last_success_at: "2026-09-10T12:00:00Z", last_error: null, last_polled_at: null }]), { status: 200 });
			if (url.includes("/rest/v1/provider_catalog_sync_runs")) return new Response(JSON.stringify([]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
	}
	it("does not expose a provider catalog to signed-out callers", async () => {
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", {}, env);

		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toContain("no-store");
	});

	it("keeps the lightweight revision check private and returns the managed document version", async () => {
		const path = "https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic/version";
		expect((await app.request(path, {}, env)).status).toBe(401);
		stubEditorRead();
		const response = await app.request(path, { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true, catalog_version: "2026-09-10T12:00:00Z" });
		expect(response.headers.get("cache-control")).toContain("no-store");
	});

	it("does not allow signed-out catalog writes", async () => {
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ catalog: { data: [] } }),
		}, env);

		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toContain("no-store");
	});

	it("allows a linked provider editor to read its own catalog", async () => {
		stubEditorRead();
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", {
			headers: { authorization: "Bearer session-token" },
		}, env);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			source: { management_mode: "managed" },
			models: [expect.objectContaining({ id: "synthetic/model-a", availability: "not_ready" })],
		});
	});

	it("denies a provider user from reading another provider catalog", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "provider-user", email: "provider@example.com" }), { status: 200 });
			if (url.includes("/rest/v1/users")) return new Response(JSON.stringify([{ role: "user" }]), { status: 200 });
			if (url.includes("/rest/v1/workspace_members")) return new Response(JSON.stringify([{ workspace_id: "workspace-1" }]), { status: 200 });
			if (url.includes("/rest/v1/workspaces")) return new Response(JSON.stringify([]), { status: 200 });
			if (url.includes("/rest/v1/provider_account_links")) return new Response(JSON.stringify([]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/other-provider", {
			headers: { authorization: "Bearer session-token" },
		}, env);

		expect(response.status).toBe(403);
		expect(response.headers.get("cache-control")).toContain("no-store");
	});

	it("authorizes a database-backed admin without requiring a provider link", async () => {
		stubEditorRead("admin");
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("provider_account_links"))).toBe(false);
	});

	it("compares the document revision rather than the background sync timestamp", async () => {
		stubEditorRead();
		const original = vi.mocked(fetch).getMockImplementation()!;
		let patchUrl = "";
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("provider_catalog_sources") && init?.method === "PATCH") {
				patchUrl = url;
				return new Response("[]", { status: 200 });
			}
			return original(input, init);
		});
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", {
			method: "PUT", headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ catalog: { mode: "remote" }, expectedUpdatedAt: "2026-09-10T12:00:00Z" }),
		}, env);
		expect(response.status).toBe(409);
		expect(new URL(patchUrl).searchParams.get("managed_updated_at")).toBe("eq.2026-09-10T12:00:00Z");
		expect(new URL(patchUrl).searchParams.has("updated_at")).toBe(false);
	});

	it("accepts the wrapped remote-mode payload used by the settings action", async () => {
		stubEditorRead();
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ catalog: { mode: "remote" } }),
		}, env);

		expect(response.status).toBe(200);
	});
});
