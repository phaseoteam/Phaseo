import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "test-encryption-key",
};

const PROVIDER_USER_ID = "11111111-1111-4111-8111-111111111111";

describe("provider onboarding account status", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("shows review decisions and opens catalog management only after approval", async () => {
		let providerReviewStatus = "needs_changes";
		let providerLinkStatus: "pending" | "active" = "pending";
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) {
				return new Response(JSON.stringify({ id: PROVIDER_USER_ID, email: "owner@provider.test", created_at: "2026-09-24T00:00:00Z", user_metadata: {} }), { status: 200 });
			}
			if (url.includes("/rest/v1/users")) return new Response(JSON.stringify([{ role: "user" }]), { status: 200 });
			if (url.includes("/rest/v1/workspace_members")) return new Response(JSON.stringify([{ workspace_id: "provider-workspace" }]), { status: 200 });
			if (url.includes("/rest/v1/workspaces")) return new Response("[]", { status: 200 });
			if (url.includes("/rest/v1/provider_onboarding_submissions")) {
				return new Response(JSON.stringify([{
					id: "submission-1", provider_slug: "provider-test", provider_name: "Provider Test", website_url: "https://provider.test", logo_url: null, catalog_url: null,
					application_type: "claim", submitted_by: PROVIDER_USER_ID, provider_review_status: providerReviewStatus,
					provider_review_reason: providerReviewStatus === "needs_changes" ? "Please clarify model ownership." : null,
					status: "submitted", model_count: 0, validation_summary: { valid: true },
					submitted_at: "2026-09-24T00:00:00Z", created_at: "2026-09-24T00:00:00Z",
				}]), { status: 200 });
			}
			if (url.includes("/rest/v1/provider_account_links")) {
				return new Response(JSON.stringify([{ provider_slug: "provider-test", workspace_id: "provider-workspace", role: "owner", status: providerLinkStatus, linked_by: PROVIDER_USER_ID, verified_at: null }]), { status: 200 });
			}
			if (url.includes("/rest/v1/provider_catalog_events")) return new Response("[]", { status: 200 });
			if (url.includes("/rest/v1/v2_providers")) {
				return new Response(JSON.stringify([{
					provider_slug: "provider-test", name: "Provider Test", status: "active", routable: true, routing_enabled: true,
					metadata: { website_url: "https://provider.test" },
				}]), { status: 200 });
			}
			if (url.includes("/rest/v1/provider_catalog_sources")) {
				return new Response(JSON.stringify([{
					provider_slug: "provider-test", status: "active", delivery_mode: "webhook_and_polling", catalog_url: null,
					last_success_at: null, last_polled_at: null, last_catalog_sha256: null, consecutive_failures: 0,
					last_error: null, etag: null, last_modified: null, next_poll_at: null, webhook_secret_hash: "stored-hash",
				}]), { status: 200 });
			}
			return new Response("[]", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const readAccount = () => app.request("https://phaseo.app/api/account/settings/provider-onboarding", {
			headers: { authorization: "Bearer provider-session" },
		}, env);

		const changesRequested = await readAccount();
		expect(changesRequested.status).toBe(200);
		await expect(changesRequested.json()).resolves.toMatchObject({
			submissions: [{ website_url: "https://provider.test", logo_url: null, application_type: "claim", catalog_mode: "managed", provider_review_status: "needs_changes", provider_review_reason: "Please clarify model ownership." }],
			catalogProviders: [{ provider_review_status: "needs_changes", canManageCatalog: false, operatingStatus: "Changes requested" }],
		});

		providerReviewStatus = "approved";
		const approved = await readAccount();
		await expect(approved.json()).resolves.toMatchObject({
			submissions: [{ provider_review_status: "approved", provider_review_reason: null }],
			catalogProviders: [{ provider_review_status: "approved", canManageCatalog: true, operatingStatus: "Active" }],
		});

		providerReviewStatus = "needs_changes";
		providerLinkStatus = "active";
		const incumbent = await readAccount();
		await expect(incumbent.json()).resolves.toMatchObject({
			catalogProviders: [{ provider_review_status: "needs_changes", canManageCatalog: true }],
		});
	});

	it("accepts a verified domain claim for a provider already linked to another workspace", async () => {
		const challengeId = "33333333-3333-4333-8333-333333333333";
		const providerUserId = "44444444-4444-4444-8444-444444444444";
		const challengeExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
		let challengeTokenHash = "";
		let publishedToken = "";
		let enrollmentBody: Record<string, unknown> | null = null;

		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : null;
			const url = request?.url ?? String(input);
			const method = request?.method ?? init?.method ?? "GET";
			const respond = (value: unknown, status = 200) => {
				const singular = request?.headers.get("accept")?.includes("application/vnd.pgrst.object+json") ?? false;
				const payload = singular && Array.isArray(value) ? value[0] ?? null : value;
				return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
			};

			if (url.includes("/.well-known/phaseo-provider-claim.txt")) return new Response(publishedToken, { status: 200, headers: { "content-length": String(publishedToken.length) } });
			if (url.includes("/auth/v1/user")) return respond({ id: providerUserId, email: "owner@personal.test", created_at: "2026-09-24T00:00:00Z", user_metadata: {} });
			if (url.includes("/rest/v1/v2_providers")) return respond([{ provider_slug: "existing-provider", name: "Existing Provider", status: "active", routing_enabled: true, routable: true, metadata: { website_url: "https://acme.example" } }]);
			if (url.includes("/rest/v1/provider_claim_challenges")) {
				if (method === "POST") {
					const body = JSON.parse(String(request ? await request.clone().text() : init?.body ?? "{}")) as Record<string, unknown>;
					challengeTokenHash = String(body.token_hash ?? "");
					return respond({ id: challengeId, expires_at: challengeExpiresAt });
				}
				return respond([{
					id: challengeId, domain: "acme.example", token_hash: challengeTokenHash,
					status: "pending", expires_at: challengeExpiresAt,
				}]);
			}
			if (url.includes("/rest/v1/provider_catalog_sources")) return respond([{ provider_slug: "existing-provider", created_by: "original-owner" }]);
			if (url.includes("/rest/v1/provider_account_links")) return respond([{
				provider_slug: "existing-provider", workspace_id: "original-owner-workspace",
				role: "owner", status: "active", linked_by: "original-owner",
			}]);
			if (url.includes("/rest/v1/workspace_members") || url.includes("/rest/v1/workspaces")) return respond([]);
			if (url.includes("/rest/v1/rpc/reserve_provider_onboarding_submission_slot")) return respond(true);
			if (url.includes("/rest/v1/rpc/complete_provider_enrollment")) {
				enrollmentBody = JSON.parse(String(request ? await request.clone().text() : init?.body ?? "{}")) as Record<string, unknown>;
				return respond({ provider: { provider_slug: "existing-provider" }, submission: {
					id: "submission-2", provider_slug: "existing-provider", provider_name: "Existing Provider", status: "submitted", model_count: 0,
					pending_webhook_secret_ciphertext: "encrypted-secret", pending_webhook_secret_iv: "iv", pending_webhook_secret_hash: "hash",
				}, providerWorkspaceId: "workspace-2", applicationType: "claim" });
			}
			return respond([]);
		});
		vi.stubGlobal("fetch", fetchMock);

		const start = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/claims/start", {
			method: "POST",
			headers: { authorization: "Bearer provider-session", "content-type": "application/json" },
			body: JSON.stringify({ providerSlug: "existing-provider", websiteUrl: "https://acme.example" }),
		}, env);
		expect(start.status).toBe(201);
		const challenge = await start.json() as { challengeId: string; token: string };
		expect(challenge.challengeId).toBe(challengeId);
		expect(challenge.token).toMatch(/^phaseo_claim_[a-f0-9]+$/);
		publishedToken = challenge.token;

		const submit = await app.request("https://phaseo.app/api/account/settings/provider-onboarding/submit", {
			method: "POST",
			headers: { authorization: "Bearer provider-session", "content-type": "application/json" },
			body: JSON.stringify({ providerSlug: "existing-provider", providerName: "Existing Provider", websiteUrl: "https://acme.example", catalogMode: "managed", claimChallengeId: challenge.challengeId }),
		}, env);
		expect(submit.status).toBe(201);
		const submissionResult = await submit.json() as { applicationType: string; submission: Record<string, unknown>; message: string };
		expect(submissionResult.applicationType).toBe("claim");
		expect(submissionResult.message).toContain("stay unchanged");
		expect(submissionResult.submission).not.toHaveProperty("pending_webhook_secret_ciphertext");
		expect(submissionResult.submission).not.toHaveProperty("pending_webhook_secret_iv");
		expect(submissionResult.submission).not.toHaveProperty("pending_webhook_secret_hash");
		expect(enrollmentBody).toMatchObject({
			p_provider_slug: "existing-provider",
			p_proof_method: "domain_file",
			p_claim_challenge_id: challengeId,
		});
		expect(challengeTokenHash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("allows an incumbent owner to rotate a secret while keeping an unapproved claimant locked", async () => {
		let linkStatus: "pending" | "active" = "pending";
		let applicationSubmitter = PROVIDER_USER_ID;
		let sourceUpdates = 0;
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = input instanceof Request ? input : null;
			const url = request?.url ?? String(input);
			const method = request?.method ?? init?.method ?? "GET";
			const respond = (value: unknown, status = 200) => {
				const singular = request?.headers.get("accept")?.includes("application/vnd.pgrst.object+json") ?? false;
				const payload = singular && Array.isArray(value) ? value[0] ?? null : value;
				return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
			};

			if (url.includes("/auth/v1/user")) return respond({ id: PROVIDER_USER_ID, email: "owner@provider.test", user_metadata: {} });
			if (url.includes("/rest/v1/workspace_members")) return respond([{ workspace_id: "provider-workspace", role: "owner" }]);
			if (url.includes("/rest/v1/workspaces")) return respond([]);
			if (url.includes("/rest/v1/provider_account_links")) return respond([{
				provider_slug: "provider-test", workspace_id: "provider-workspace", role: "owner", status: linkStatus, linked_by: PROVIDER_USER_ID,
			}]);
			if (url.includes("/rest/v1/provider_onboarding_submissions")) return respond([{
				application_type: "claim", submitted_by: applicationSubmitter, provider_review_status: "awaiting_approval",
			}]);
			if (url.includes("/rest/v1/v2_providers")) return respond([{ metadata: { website_url: "https://provider.test" } }]);
			if (url.includes("/rest/v1/provider_catalog_sources") && String(method).toUpperCase() === "PATCH") {
				sourceUpdates += 1;
				return new Response(null, { status: 204 });
			}
			if (url.includes("/rest/v1/provider_catalog_sources")) return respond([{ provider_slug: "provider-test" }]);
			return respond([]);
		});
		vi.stubGlobal("fetch", fetchMock);

		const rotate = () => app.request("https://phaseo.app/api/account/settings/provider-onboarding/webhook/rotate", {
			method: "POST",
			headers: { authorization: "Bearer provider-session", "content-type": "application/json" },
			body: JSON.stringify({ providerSlug: "provider-test" }),
		}, env);

		const claimantResponse = await rotate();
		expect(claimantResponse.status).toBe(409);
		expect(sourceUpdates).toBe(0);

		linkStatus = "active";
		applicationSubmitter = "claimant-user";
		const incumbentResponse = await rotate();
		expect(incumbentResponse.status).toBe(200);
		expect(sourceUpdates).toBe(1);
	});
});
