import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { normalizeProviderCatalog } from "./provider-catalog";
import { normalizedCatalogDocument } from "./provider-catalog-overrides";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

describe("provider catalog management API", () => {
	afterEach(() => vi.unstubAllGlobals());

	function stubEditorRead(options: {
		role?: string;
		providerMetadata?: Record<string, unknown>;
		applicationStatus?: string;
		applicationType?: "new" | "claim";
		submittedBy?: string;
		linkStatus?: "pending" | "active";
		linkedBy?: string;
	} = {}) {
		const {
			role = "user",
			providerMetadata = {},
			applicationStatus,
			applicationType = "new",
			submittedBy = "provider-user",
			linkStatus = "active",
			linkedBy = "provider-user",
		} = options;
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "provider-user", email: "provider@example.com" }), { status: 200 });
			if (url.includes("/rest/v1/users")) return new Response(JSON.stringify([{ role }]), { status: 200 });
			if (url.includes("/rest/v1/workspace_members")) return new Response(JSON.stringify([{ workspace_id: "workspace-1" }]), { status: 200 });
			if (url.includes("/rest/v1/workspaces")) return new Response(JSON.stringify([]), { status: 200 });
			if (url.includes("/rest/v1/provider_account_links")) return new Response(JSON.stringify([{ provider_slug: "synthetic", workspace_id: "workspace-1", role: "editor", status: linkStatus, linked_by: linkedBy }]), { status: 200 });
			if (url.includes("/rest/v1/v2_providers")) return new Response(JSON.stringify([{ provider_slug: "synthetic", name: "Synthetic", status: "disabled", metadata: providerMetadata }]), { status: 200 });
			if (url.includes("/rest/v1/provider_onboarding_submissions")) return new Response(JSON.stringify(applicationStatus ? [{ application_type: applicationType, submitted_by: submittedBy, provider_review_status: applicationStatus }] : []), { status: 200 });
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
	it("ignores unchanged polls when reading the latest catalog revision", async () => {
		stubEditorRead();
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		const urls = vi.mocked(fetch).mock.calls.map(([input]) => new URL(input instanceof Request ? input.url : String(input)));
		const latest = urls.find(url => url.pathname.endsWith("/provider_catalog_sync_runs"));
		expect(latest?.searchParams.get("status")).toBe("neq.not_modified");
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

	it("keeps provider catalog editing closed until the application is approved", async () => {
		stubEditorRead({ providerMetadata: { self_serve: { provider_review_status: "awaiting_approval" } } });
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ catalog: { data: [] } }),
		}, env);

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({ error: "provider_application_not_approved" });
		expect(vi.mocked(fetch).mock.calls.some(([input, init]) => {
			const url = input instanceof Request ? input.url : String(input);
			return url.includes("/rest/v1/rpc/restore_provider_catalog_feed") && (input instanceof Request ? input.method : init?.method) === "POST";
		})).toBe(false);
	});

	it("keeps a legacy provider claim locked without self-serve metadata", async () => {
		stubEditorRead({
			providerMetadata: { website_url: "https://provider.example" },
			applicationStatus: "awaiting_approval",
			applicationType: "claim",
			linkStatus: "pending",
		});
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ catalog: { data: [] } }),
		}, env);

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({ error: "provider_application_not_approved" });
		expect(vi.mocked(fetch).mock.calls.some(([input, init]) => {
			const url = input instanceof Request ? input.url : String(input);
			return url.includes("/rest/v1/rpc/restore_provider_catalog_feed") && (input instanceof Request ? input.method : init?.method) === "POST";
		})).toBe(false);
	});

	it("keeps the incumbent provider owner able to edit while another workspace claim is pending", async () => {
		stubEditorRead({
			providerMetadata: { website_url: "https://provider.example" },
			applicationStatus: "awaiting_approval",
			applicationType: "claim",
			submittedBy: "claimant-user",
			linkStatus: "active",
			linkedBy: "provider-user",
		});
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ catalog: { mode: "remote" } }),
		}, env);

		expect(response.status).toBe(200);
		expect(vi.mocked(fetch).mock.calls.some(([input, init]) => {
			const url = input instanceof Request ? input.url : String(input);
			return url.includes("/rest/v1/rpc/restore_provider_catalog_feed") && (input instanceof Request ? input.method : init?.method) === "POST";
		})).toBe(true);
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
		stubEditorRead({ role: "admin" });
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("provider_account_links"))).toBe(false);
	});

	it("compares the document revision rather than the background sync timestamp", async () => {
		stubEditorRead();
		const original = vi.mocked(fetch).getMockImplementation()!;
		let payload: Record<string, unknown> = {};
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("rpc/restore_provider_catalog_feed") && init?.method === "POST") {
				payload = JSON.parse(String(init.body));
				return Response.json({ message: "provider_catalog_version_conflict" }, { status: 409 });
			}
			return original(input, init);
		});
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", {
			method: "PUT", headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ catalog: { mode: "remote" }, expectedUpdatedAt: "2026-09-10T12:00:00Z" }),
		}, env);
		expect(response.status).toBe(409);
		expect(payload.p_expected_version).toBe("2026-09-10T12:00:00Z");
		expect(payload.p_actor_id).toBe("provider-user");
		expect(payload.p_actor_kind).toBe("provider");
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
	it.each(["admin", "user"])("allows description edits only for Phaseo admins (%s)", async (role) => {
		stubEditorRead({ role });
		const original = vi.mocked(fetch).getMockImplementation()!;
		const feed = normalizeProviderCatalog({ data: [{ id: "synthetic/model-a", name: "Feed name", provider_model_slug: "native", availability: "not_ready", capabilities: ["chat.completions"] }] }).allModels;
		let saved: Record<string, unknown> = {};
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/rest/v1/provider_catalog_sources") && (!init?.method || init.method === "GET")) return Response.json([{ provider_slug: "synthetic", management_mode: "remote", status: "active", catalog_url: "https://provider.example/catalog.json", feed_models: feed, catalog_overrides: { "synthetic/model-a": { name: { value: "Pinned", actor_id: "previous-operator", actor_kind: "phaseo", edited_at: "2026-10-07T00:00:00Z" } } }, updated_at: "2026-10-07T00:00:00Z" }]);
			if (url.includes("/rpc/save_provider_catalog_overrides")) { saved = JSON.parse(String(init?.body)); return new Response(null, { status: 204 }); }
			return original(input, init);
		});
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", {
			method: "PUT", headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ expectedUpdatedAt: "2026-10-07T00:00:00Z", actor_id: "forged", actor_kind: "phaseo", catalog: normalizedCatalogDocument([{ ...feed[0], name: "Pinned", description: "Editorial correction" }]) }),
		}, env);
		if (role !== "admin") {
			expect(response.status).toBe(403);
			expect(saved).toEqual({});
			return;
		}
		expect(response.status).toBe(200);
		expect(saved.p_actor_id).toBe("provider-user");
		expect(saved.p_actor_kind).toBe("phaseo");
		expect(saved.p_changes).toEqual([{ model_id: "synthetic/model-a", field: "description", value: "Editorial correction" }]);
		expect((await response.json()).source.management_mode).toBe("remote");
	});
});
