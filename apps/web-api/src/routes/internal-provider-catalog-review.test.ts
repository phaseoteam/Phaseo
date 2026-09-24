import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "22222222-2222-4222-8222-222222222222";

describe("provider application review API", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("shows a submitted application and allows identity approval before route setup is ready", async () => {
		let reviewRpcBody: Record<string, unknown> | null = null;
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : null;
			const url = request?.url ?? String(input);
			const method = request?.method ?? init?.method ?? "GET";

			if (url.includes("/auth/v1/user") && method === "GET") {
				return new Response(JSON.stringify({ id: ADMIN_ID, email: "admin@phaseo.app", user_metadata: {} }), { status: 200 });
			}
			if (url.includes("/rest/v1/users")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/rest/v1/v2_providers")) {
				return new Response(JSON.stringify([{
					provider_slug: "new-provider",
					name: "New Provider",
					status: "not_ready",
					routable: false,
					routing_enabled: false,
					base_url: null,
					metadata: { website_url: "https://provider.test", self_serve: { provider_review_status: "awaiting_approval" } },
					created_at: "2026-09-24T00:00:00Z",
					updated_at: "2026-09-24T00:00:00Z",
				}]), { status: 200 });
			}
			if (url.includes("/rest/v1/provider_catalog_route_candidates")) return new Response("[]", { status: 200 });
			if (url.includes("/rest/v1/provider_onboarding_submissions")) {
				return new Response(JSON.stringify([{
					provider_slug: "new-provider", submitted_by: CONTACT_ID, provider_name: "New Provider",
					website_url: "https://provider.test", catalog_url: null, catalog_mode: "managed",
					application_type: "new", model_count: 0, provider_review_status: "awaiting_approval",
					provider_review_reason: null, created_at: "2026-09-24T00:00:00Z",
				}]), { status: 200 });
			}
			if (url.includes(`/auth/v1/admin/users/${CONTACT_ID}`)) {
				return new Response(JSON.stringify({ id: CONTACT_ID, email: "owner@provider.test" }), { status: 200 });
			}
			if (url.includes("/rest/v1/rpc/review_provider_application")) {
				const body = JSON.parse(String(request ? await request.clone().text() : init?.body ?? "{}")) as Record<string, unknown>;
				reviewRpcBody = body;
				return new Response(JSON.stringify({ providerSlug: "new-provider", decision: body.p_decision, activatedRouteIds: [] }), { status: 200 });
			}
			return new Response("[]", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const queueResponse = await app.request("https://phaseo.app/api/internal/provider-catalog/providers", {
			headers: { authorization: "Bearer admin-session" },
		}, env);
		expect(queueResponse.status).toBe(200);
		await expect(queueResponse.json()).resolves.toMatchObject({
			providers: [{
				provider_slug: "new-provider",
				application_type: "new",
				review_status: "awaiting_approval",
				technical_ready: false,
				route_blockers: ["endpoint", "adapter", "credentials", "probe"],
			}],
		});

		const decisionResponse = await app.request("https://phaseo.app/api/internal/provider-catalog/providers/new-provider", {
			method: "PATCH",
			headers: { authorization: "Bearer admin-session", "content-type": "application/json" },
			body: JSON.stringify({ decision: "approved" }),
		}, env);
		expect(decisionResponse.status).toBe(200);
		expect(reviewRpcBody).toMatchObject({
			p_provider_slug: "new-provider",
			p_decision: "approved",
			p_reviewed_by: ADMIN_ID,
		});
		expect(reviewRpcBody?.p_provider_slug).toBe("new-provider");
		const routeCandidateReadCount = fetchMock.mock.calls.filter(([input]) => {
			const url = input instanceof Request ? input.url : String(input);
			return url.includes("/rest/v1/provider_catalog_route_candidates");
		}).length;
		expect(routeCandidateReadCount).toBe(1);
	});

	it("includes legacy provider claims and shows their staged profile in the review queue", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: ADMIN_ID, email: "admin@phaseo.app", user_metadata: {} }), { status: 200 });
			if (url.includes("/rest/v1/users")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/rest/v1/v2_providers")) {
				const search = new URL(url).searchParams;
				if (search.has("metadata")) return new Response("[]", { status: 200 });
				return new Response(JSON.stringify([{
					provider_slug: "legacy-provider", name: "Current Public Name", status: "active",
					routable: true, routing_enabled: true, base_url: "https://api.provider.test",
					metadata: { website_url: "https://provider.test" },
					created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z",
				}]), { status: 200 });
			}
			if (url.includes("/rest/v1/provider_onboarding_submissions")) {
				return new Response(JSON.stringify([{
					provider_slug: "legacy-provider", submitted_by: CONTACT_ID,
					provider_name: "Proposed Provider Name", website_url: "https://provider.test",
					catalog_url: null, catalog_mode: "managed", application_type: "claim",
					model_count: 0, provider_review_status: "awaiting_approval",
					provider_review_reason: null, created_at: "2026-09-24T00:00:00Z",
				}]), { status: 200 });
			}
			if (url.includes("/rest/v1/provider_catalog_route_candidates")) return new Response("[]", { status: 200 });
			if (url.includes("/rest/v1/provider_catalog_sources")) return new Response(JSON.stringify([{
				provider_slug: "legacy-provider", management_mode: "remote", catalog_url: "https://provider.test/old-models.json",
				last_success_at: "2026-09-20T00:00:00Z",
			}]), { status: 200 });
			if (url.includes("/rest/v1/provider_account_links")) return new Response(JSON.stringify([
				{
					provider_slug: "legacy-provider", linked_by: "incumbent-owner", status: "active",
					proof_method: "domain_file", proof_subject: "current-owner.test", verified_at: "2026-09-23T00:00:00Z",
				},
				{
					provider_slug: "legacy-provider", linked_by: CONTACT_ID, status: "pending",
					proof_method: "domain_file", proof_subject: "claimant.test", verified_at: "2026-09-24T00:00:00Z",
				},
			]), { status: 200 });
			return new Response("[]", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/internal/provider-catalog/providers", {
			headers: { authorization: "Bearer admin-session" },
		}, env);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			providers: [{
				provider_slug: "legacy-provider",
				name: "Proposed Provider Name",
				application_type: "claim",
				review_status: "awaiting_approval",
				ownership_proof_subject: "claimant.test",
				catalog_mode: "managed",
				catalog_url: null,
			}],
		});
	});

	it("loads provider claims from submission history beyond the first page", async () => {
		const olderClaim = {
			id: "claim-submission", provider_slug: "older-claim", submitted_by: CONTACT_ID,
			provider_name: "Older Claim", website_url: "https://older-claim.test", catalog_url: null,
			catalog_mode: "managed", application_type: "claim", model_count: 0,
			provider_review_status: "awaiting_approval", provider_review_reason: null,
			created_at: "2026-09-01T00:00:00Z", submitted_at: "2026-09-01T00:00:00Z",
		};
		const recentSubmissions = Array.from({ length: 500 }, (_, index) => ({
			id: `recent-${index}`, provider_slug: `recent-${index}`, submitted_by: null,
			provider_name: `Recent ${index}`, website_url: "https://recent.test", catalog_url: null,
			catalog_mode: "managed", application_type: "new", model_count: 0,
			provider_review_status: "rejected", provider_review_reason: "Closed",
			created_at: `2026-09-${String(20 - Math.floor(index / 50)).padStart(2, "0")}T00:00:00Z`,
		}));
		const submissionRanges: string[] = [];
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const request = input instanceof Request ? input : null;
			const url = request?.url ?? String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: ADMIN_ID, email: "admin@phaseo.app", user_metadata: {} }), { status: 200 });
			if (url.includes("/rest/v1/users")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/rest/v1/provider_onboarding_submissions")) {
				const range = request?.headers.get("range") ?? "0-499";
				submissionRanges.push(range);
				return new Response(JSON.stringify(submissionRanges.length === 1 ? recentSubmissions : [olderClaim]), { status: 200 });
			}
			if (url.includes("/rest/v1/v2_providers")) {
				if (new URL(url).searchParams.has("metadata")) return new Response("[]", { status: 200 });
				return new Response(JSON.stringify([{
					provider_slug: "older-claim", name: "Older Claim", status: "active",
					routable: true, routing_enabled: true, base_url: "https://api.older-claim.test",
					metadata: { website_url: "https://older-claim.test" },
					created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
				}]), { status: 200 });
			}
			if (url.includes("/rest/v1/provider_catalog_route_candidates") || url.includes("/rest/v1/provider_catalog_sources") || url.includes("/rest/v1/provider_account_links")) return new Response("[]", { status: 200 });
			if (url.includes(`/auth/v1/admin/users/${CONTACT_ID}`)) return new Response(JSON.stringify({ id: CONTACT_ID, email: "owner@provider.test" }), { status: 200 });
			return new Response("[]", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await app.request("https://phaseo.app/api/internal/provider-catalog/providers", {
			headers: { authorization: "Bearer admin-session" },
		}, env);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			providers: [expect.objectContaining({
				provider_slug: "older-claim",
				application_type: "claim",
				review_status: "awaiting_approval",
			})],
		});
		expect(submissionRanges).toHaveLength(2);
	});
});
