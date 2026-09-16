import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

function stubPreviewData({ role = "admin", matched = false, includeOtherProvider = false }: { role?: string; matched?: boolean; includeOtherProvider?: boolean } = {}) {
	const modelMatch = matched
		? { canonical_model_slug: "openai/model-a", match_type: "exact" }
		: { canonical_model_slug: null, match_type: "new_model" };
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
		const url = input instanceof Request ? input.url : String(input);
		if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: role === "admin" ? "admin-1" : "provider-1", email: "test@example.com" }), { status: 200 });
		if (url.includes("users")) return new Response(JSON.stringify([{ role }]), { status: 200 });
		if (url.includes("workspace_members")) return new Response(JSON.stringify([{ workspace_id: "workspace-1" }]), { status: 200 });
		if (url.includes("workspaces")) return new Response(JSON.stringify([]), { status: 200 });
		if (url.includes("provider_account_links")) return new Response(JSON.stringify([{ provider_slug: "synthetic", workspace_id: "workspace-1", status: "active" }]), { status: 200 });
		if (url.includes("provider_catalog_sync_runs")) return new Response(JSON.stringify([
			{ id: "run-synthetic", provider_slug: "synthetic", status: "applied", review_status: "pending", created_at: "2026-09-09T12:00:00Z" },
			{ id: "run-other", provider_slug: "other-provider", status: "applied", review_status: "pending", created_at: "2026-09-09T11:00:00Z" },
		]), { status: 200 });
		if (url.includes("provider_catalog_sync_models")) return new Response(JSON.stringify([
			{ run_id: "run-synthetic", provider_slug: "synthetic", model_slug: "synthetic/model-a", ...modelMatch, provider_model_slug: "model-a", name: "Synthetic Model A", description: "Preview only", input_modalities: ["text"], output_modalities: ["text"], context_length: 32_000, max_output_tokens: 4_000, availability: "ready", available_from: null, deprecated_at: null, shutdown_at: null, decision: "pending", route_projection_status: "not_projected", created_at: "2026-09-09T12:00:00Z" },
			...(includeOtherProvider ? [{ run_id: "run-other", provider_slug: "other-provider", model_slug: "other/model-b", ...modelMatch, provider_model_slug: "model-b", name: "Other Model B", description: "Should stay private", input_modalities: ["text"], output_modalities: ["text"], context_length: 16_000, max_output_tokens: 2_000, availability: "ready", available_from: null, deprecated_at: null, shutdown_at: null, decision: "pending", route_projection_status: "not_projected", created_at: "2026-09-09T11:00:00Z" }] : []),
		]), { status: 200 });
		if (url.includes("provider_catalog_sync_model_capabilities")) return new Response(JSON.stringify([{ run_id: "run-synthetic", model_slug: "synthetic/model-a", capability_id: "responses", parameters: ["temperature", "max_tokens"] }]), { status: 200 });
		if (url.includes("v2_providers")) return new Response(JSON.stringify([
			{ provider_slug: "synthetic", name: "Synthetic", status: "active" },
			...(includeOtherProvider ? [{ provider_slug: "other-provider", name: "Other Provider", status: "active" }] : []),
		]), { status: 200 });
		return new Response(JSON.stringify([]), { status: 200 });
	}));
}

describe("authenticated provider catalog previews", () => {
	it("rejects signed-out preview requests", async () => {
		const response = await app.request(
			"https://phaseo.app/api/account/settings/provider-onboarding/catalogue-previews",
			{},
			env,
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toContain("no-store");
	});

	it("lets admins see pending staged models without exposing them as private", async () => {
		stubPreviewData({ includeOtherProvider: true });
		const response = await app.request(
			"https://phaseo.app/api/account/settings/provider-onboarding/catalogue-previews",
			{ headers: { authorization: "Bearer session-token" } },
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			isAdmin: true,
			models: expect.arrayContaining([
				expect.objectContaining({
					model_id: "synthetic/model-a",
					canonical_model_slug: null,
					match_type: "new_model",
					provider_name: "Synthetic",
					availability_status: "coming_soon",
					availability_reason: "pending_review",
					endpoints: ["responses"],
					supported_params: ["temperature", "max_tokens"],
					is_active_gateway: false,
					can_test: false,
					test_blocked_reason: "provider_endpoint_missing",
				}),
			]),
	});
	});

	it("preserves the canonical match for an existing model offer", async () => {
		stubPreviewData({ matched: true });
		const response = await app.request(
			"https://phaseo.app/api/account/settings/provider-onboarding/catalogue-previews",
			{ headers: { authorization: "Bearer session-token" } },
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			models: [
				expect.objectContaining({
					model_id: "synthetic/model-a",
					canonical_model_slug: "openai/model-a",
					match_type: "exact",
				}),
			],
		});
	});

	it("limits provider users to linked provider models even when extra rows are returned", async () => {
		stubPreviewData({ role: "member", includeOtherProvider: true });
		const response = await app.request(
			"https://phaseo.app/api/account/settings/provider-onboarding/catalogue-previews",
			{ headers: { authorization: "Bearer session-token" } },
			env,
		);

		expect(response.status).toBe(200);
		const payload = await response.json() as { isAdmin: boolean; models: Array<{ provider_slug: string }> };
		expect(payload.isAdmin).toBe(false);
		expect(payload.models).toHaveLength(1);
		expect(payload.models[0]?.provider_slug).toBe("synthetic");
	});
});
