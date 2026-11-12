import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};
const PATH = "https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic/rate-limits";
const VERSION = "2026-10-10T09:00:00.123456+00:00";
const managedCatalog = { schema_version: "1.1", data: [{
	id: "synthetic/model-a", name: "Model A", input_modalities: ["text"], output_modalities: ["text"], availability: "ready",
	capabilities: [{ id: "chat.completions", parameters: [] }],
	service_tiers: [
		{ service_tier: "standard", provider_model_slug: "model-a", pricing: [] },
		{ service_tier: "fast", provider_model_slug: "model-a-fast", upstream_service_tier: null, pricing: [] },
	],
}] };

type Stub = { role?: string; linked?: boolean; reviewStatus?: string; rpcError?: string; storedRows?: Array<Record<string, unknown>> };

function stub({ role = "user", linked = true, reviewStatus, rpcError, storedRows = [{ provider_model_slug: "retired-model", requests_per_minute: 3, requests_per_day: null, tokens_per_minute: null, tokens_per_day: null }] }: Stub = {}) {
	const rpc = vi.fn();
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : String(input);
		const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
		if (url.includes("/auth/v1/user")) return json({ id: "provider-user", email: "provider@example.com" });
		if (url.includes("/rest/v1/rpc/save_provider_rate_limits")) {
			rpc(JSON.parse(String(input instanceof Request ? await input.text() : init?.body)));
			return rpcError ? json({ code: "P0001", message: rpcError }, 400) : json("2026-10-10T09:05:00.654321+00:00");
		}
		if (url.includes("/rest/v1/users")) return json([{ role }]);
		if (url.includes("/rest/v1/workspace_members")) return json([{ workspace_id: "workspace-1" }]);
		if (url.includes("/rest/v1/workspaces")) return json([]);
		if (url.includes("/rest/v1/provider_account_links")) return json(linked ? [{ provider_slug: "synthetic", workspace_id: "workspace-1", role: "editor", status: "active", linked_by: "provider-user" }] : []);
		if (url.includes("/rest/v1/v2_providers")) return json([{ provider_slug: "synthetic", name: "Synthetic", status: "active", routable: true, routing_enabled: true, metadata: reviewStatus ? { self_serve: { provider_review_status: reviewStatus } } : {} }]);
		if (url.includes("/rest/v1/provider_catalog_sources")) return json([{ provider_slug: "synthetic", catalog_url: null, management_mode: "managed", managed_catalog: managedCatalog, managed_updated_at: "2026-09-10T12:00:00Z", updated_at: "2026-09-10T12:00:00Z", rate_limits_updated_at: VERSION }]);
		if (url.includes("/rest/v1/provider_rate_limits")) return json(storedRows);
		return json([]);
	}));
	return rpc;
}

const put = (body: unknown) => app.request(PATH, { method: "PUT", headers: { authorization: "Bearer session-token", "content-type": "application/json" }, body: JSON.stringify(body) }, env);

describe("provider-declared rate limits API", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("requires a signed-in caller", async () => {
		const response = await app.request(PATH, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rate_limits: [], expectedVersion: null }) }, env);
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toContain("no-store");
	});

	it("does not let a non-member edit another provider's limits", async () => {
		const rpc = stub({ linked: false });
		const response = await put({ rate_limits: [{ requests_per_minute: 1 }], expectedVersion: VERSION });
		expect(response.status).toBe(403);
		expect(rpc).not.toHaveBeenCalled();
	});

	it("keeps limits closed until the provider application is approved", async () => {
		const rpc = stub({ reviewStatus: "awaiting_approval" });
		const response = await put({ rate_limits: [{ requests_per_minute: 1 }], expectedVersion: VERSION });
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({ error: "provider_application_not_approved" });
		expect(rpc).not.toHaveBeenCalled();
	});

	it("replaces the provider's limits without review, guarded by their version", async () => {
		const rpc = stub({ reviewStatus: "approved" });
		const response = await put({ rate_limits: [{ requests_per_minute: 600 }, { model: "model-a-fast", tokens_per_minute: 50_000 }, { model: "retired-model", requests_per_minute: 3 }], expectedVersion: VERSION });
		expect(response.status).toBe(200);
		expect(rpc).toHaveBeenCalledWith({
			p_provider_slug: "synthetic", p_actor_id: "provider-user", p_actor_kind: "provider", p_expected_version: VERSION, p_check_version: true,
			p_limits: [
				{ model: null, requests_per_minute: 600, requests_per_day: null, tokens_per_minute: null, tokens_per_day: null },
				{ model: "model-a-fast", requests_per_minute: null, requests_per_day: null, tokens_per_minute: 50_000, tokens_per_day: null },
				{ model: "retired-model", requests_per_minute: 3, requests_per_day: null, tokens_per_minute: null, tokens_per_day: null },
			],
		});
		await expect(response.json()).resolves.toMatchObject({ ok: true, rate_limits: { version: "2026-10-10T09:05:00.654321+00:00" } });
	});

	it("lets platform admins edit through the same surface", async () => {
		const rpc = stub({ role: "admin", linked: false, reviewStatus: "awaiting_approval" });
		const response = await put({ rate_limits: [], expectedVersion: VERSION });
		expect(response.status).toBe(200);
		expect(rpc).toHaveBeenCalledWith(expect.objectContaining({ p_actor_kind: "phaseo", p_limits: [] }));
	});

	it("reports a concurrent edit as a version conflict", async () => {
		stub({ rpcError: "provider_catalog_version_conflict" });
		const response = await put({ rate_limits: [{ requests_per_minute: 1 }], expectedVersion: null });
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({ error: "Rate limits changed. Reload before saving again." });
	});

	it.each([
		[{ rate_limits: [{ model: "unknown-model", requests_per_minute: 1 }], expectedVersion: VERSION }, 422, "rate_limits[0].model"],
		[{ rate_limits: [{ requests_per_minute: -1 }], expectedVersion: VERSION }, 422, "rate_limits[0].requests_per_minute"],
		[{ rate_limits: [{ requests_per_minute: 1 }, { requests_per_day: 1 }], expectedVersion: VERSION }, 422, "rate_limits[1]"],
		[{ rate_limits: [{ requests_per_minute: 1 }] }, 400, null],
		[{ rate_limits: [], expectedVersion: "yesterday" }, 400, null],
		[{ rate_limits: [], expectedVersion: null, extra: true }, 400, null],
	])("validates %j", async (body, status, issuePath) => {
		const rpc = stub();
		const response = await put(body);
		expect(response.status).toBe(status);
		if (issuePath) expect((await response.json() as { issues: Array<{ path: string }> }).issues.map((issue) => issue.path)).toContain(issuePath);
		expect(rpc).not.toHaveBeenCalled();
	});

	it("returns declared limits and their version with the catalog", async () => {
		stub();
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ rate_limits: { version: VERSION, limits: [{ model: "retired-model", requests_per_minute: 3 }] } });
	});

	it("keeps limits out of catalog document saves", async () => {
		const rpc = stub();
		const response = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/catalog/synthetic", {
			method: "PUT",
			headers: { authorization: "Bearer session-token", "content-type": "application/json" },
			body: JSON.stringify({ catalog: { ...managedCatalog, rate_limits: [{ requests_per_minute: 1 }] }, expectedUpdatedAt: "2026-09-10T12:00:00Z" }),
		}, env);
		expect(response.status).toBe(422);
		await expect(response.json()).resolves.toMatchObject({ issues: [{ path: "rate_limits" }] });
		expect(rpc).not.toHaveBeenCalled();
	});
});
