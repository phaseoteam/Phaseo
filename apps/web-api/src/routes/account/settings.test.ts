import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

function authenticatedFetch(input: RequestInfo | URL): Response {
	const url = input instanceof Request ? input.url : String(input);
	if (url.includes("/auth/v1/user")) {
		return new Response(JSON.stringify({
			id: "user-1",
			email: "user@example.com",
			created_at: "2025-01-01T00:00:00Z",
			app_metadata: { provider: "email" },
			factors: [{ id: "factor-1", factor_type: "totp", status: "verified" }],
		}), { status: 200 });
	}
	if (url.includes("workspace_members") && url.includes("teams%3Aworkspaces")) {
		return new Response(JSON.stringify([{
			workspace_id: "workspace-1",
			teams: { id: "workspace-1", name: "Team One" },
		}]), { status: 200 });
	}
	if (url.includes("workspace_members") && url.includes("select=workspace_id")) {
		return new Response(JSON.stringify([{ workspace_id: "workspace-1" }]), { status: 200 });
	}
	if (url.includes("workspace_members")) {
		return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
	}
	if (url.includes("select=owner_user_id")) {
		return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
	}
	if (url.includes("tier%2Cbilling_mode")) {
		return new Response(JSON.stringify([{ tier: "enterprise", billing_mode: "invoice" }]), { status: 200 });
	}
	if (url.includes("beta_opt_in")) {
		return new Response(JSON.stringify([{
			beta_opt_in: true,
			beta_features: { models_catalogue_v2: true },
		}]), { status: 200 });
	}
	if (url.includes("obfuscate_info")) {
		return new Response(JSON.stringify([{
			user_id: "user-1",
			display_name: "Test User",
			default_workspace_id: "workspace-1",
			obfuscate_info: false,
			created_at: "2025-01-01T00:00:00Z",
		}]), { status: 200 });
	}
	if (url.includes("workspace_settings")) {
		if (url.includes("low_balance_email")) {
			return new Response(JSON.stringify([{
				low_balance_email_enabled: true,
				low_balance_email_threshold_nanos: 5000000000,
			}]), { status: 200 });
		}
		return new Response(JSON.stringify([{
			privacy_zdr_only: true,
			provider_restriction_mode: "allow",
		}]), { status: 200 });
	}
	if (url.includes("/wallets")) {
		return new Response(JSON.stringify([{
			workspace_id: "workspace-1", stripe_customer_id: "cus_test",
			balance_nanos: 12500000000, reserved_nanos: 0, auto_top_up_enabled: false,
		}]), { status: 200 });
	}
	if (url.includes("credit_ledger")) {
		return new Response(JSON.stringify([{
			event_time: "2026-07-13T00:00:00Z", status: "paid", amount_nanos: 10000000000,
		}]), { status: 200 });
	}
	if (url.includes("data_api_providers")) {
		return new Response(JSON.stringify([{
			api_provider_id: "openai-eu",
			api_provider_name: "OpenAI",
			offer_label: "OpenAI EU",
			offer_scope: "regional",
		}]), { status: 200 });
	}
	if (url.includes("data_api_provider_models")) {
		return new Response(JSON.stringify([{
			provider_id: "openai-eu",
			api_model_id: "gpt-test",
			model_id: "openai/gpt-test",
			internal_model_id: "openai/gpt-test",
			is_active_gateway: true,
		}]), { status: 200 });
	}
	if (url.includes("data_models")) {
		return new Response(JSON.stringify([{
			model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai",
		}]), { status: 200 });
	}
	if (url.includes("workspace_broadcast_destinations")) {
		return new Response(JSON.stringify([{
			id: "destination-row-1",
			destination_id: "destination-1",
			name: "Primary",
			enabled: true,
			sampling_rate: 0.5,
			destination_config: { url: "https://example.com" },
			updated_at: "2026-07-14T00:00:00Z",
		}]), { status: 200 });
	}
	if (url.includes("api_apps")) {
		return new Response(JSON.stringify([
			{
				id: "app-1", title: "Customer App", app_key: "customer-app",
				category: "chat,invalid,research", docs_url: "https://docs.example.com",
				url: "https://example.com", image_url: null, is_public: true,
				is_active: true, last_seen: "2026-07-14T00:00:00Z",
				created_at: "2026-01-01T00:00:00Z",
			},
			{ id: "internal", title: "Phaseo Chat", app_key: "phaseo-chat", is_active: true },
		]), { status: 200 });
	}
	if (url.includes("oauth_authorizations")) {
		return new Response(JSON.stringify([{
			id: "authorization-1", client_id: "client-1", workspace_id: "workspace-1",
			scopes: ["models:read"], created_at: "2026-01-01T00:00:00Z",
			last_used_at: "2026-07-14T00:00:00Z",
		}]), { status: 200 });
	}
	if (url.includes("oauth_app_metadata")) {
		return new Response(JSON.stringify([{
			client_id: "client-1", name: "Example OAuth App", description: "Example",
			logo_url: null, homepage_url: "https://example.com",
			allowed_scopes: ["models:read", "usage:read"],
		}]), { status: 200 });
	}
	if (url.includes("oauth_apps_with_stats")) {
		return new Response(JSON.stringify([{
			client_id: "client-1", workspace_id: "workspace-1", name: "Example OAuth App",
		}]), { status: 200 });
	}
	if (url.includes("gateway_requests")) {
		if (url.includes("request_id")) {
			return new Response(JSON.stringify([{
				request_id: "request-1", created_at: "2026-07-14T00:00:00Z",
				oauth_user_id: "user-1", endpoint: "chat/completions", model_id: "openai/gpt-test",
				provider: "openai", success: true, status_code: 200, error_code: null,
				cost_nanos: 1000, latency_ms: 120,
			}]), { status: 200 });
		}
		return new Response(JSON.stringify([{
			created_at: "2026-07-14T00:00:00Z", success: true, cost_nanos: 1000,
		}]), { status: 200 });
	}
	if (url.includes("management_keys")) {
		return new Response(JSON.stringify([{
			id: "management-key-1", workspace_id: "workspace-1", name: "Automation",
			created_at: "2026-01-01T00:00:00Z",
		}]), { status: 200 });
	}
	if (url.includes("/rest/v1/keys?")) {
		return new Response(JSON.stringify([{
			id: "key-1", workspace_id: "workspace-1", name: "Production",
			status: "active", last_used_at: null,
		}]), { status: 200 });
	}
	if (url.includes("/rpc/get_workspace_key_usage")) {
		return new Response(JSON.stringify([{
			key_id: "key-1", daily_request_count: 3, weekly_request_count: 20,
			monthly_request_count: 80, daily_cost_nanos: 100, weekly_cost_nanos: 500,
			monthly_cost_nanos: 2000, last_used_at: "2026-07-14T00:00:00Z",
		}]), { status: 200 });
	}
	if (url.includes("byok_keys")) {
		return new Response(JSON.stringify([
			{
				id: "byok-new", provider_id: "openai", name: "OpenAI key", prefix: "sk-",
				suffix: "1234", created_at: "2026-07-01T00:00:00Z", enabled: true, always_use: true,
			},
			{
				id: "byok-old", provider_id: "openai", name: "Old key", prefix: "sk-",
				suffix: "0000", created_at: "2026-01-01T00:00:00Z", enabled: false, always_use: false,
			},
		]), { status: 200 });
	}
	if (url.includes("workspace_byok_monthly_usage")) {
		return new Response(JSON.stringify([{ request_count: 100_250 }]), { status: 200 });
	}
	if (url.includes("workspace_invoice_profiles")) {
		return new Response(JSON.stringify([{
			enabled: true, billing_day: 15, payment_terms_days: 14,
		}]), { status: 200 });
	}
	if (url.includes("workspace_invoices")) {
		return new Response(JSON.stringify([{
			id: "invoice-1", period_start: "2026-06-01", period_end: "2026-06-30",
			amount_nanos: 12000000000, currency: "USD", status: "issued",
		}]), { status: 200 });
	}
	if (url.includes("select=id%2Cname")) {
		return new Response(JSON.stringify([{ id: "workspace-1", name: "Team One" }]), { status: 200 });
	}
	if (url.includes("/workspaces") && url.includes("select=id") && url.includes("owner_user_id")) {
		return new Response(JSON.stringify([{ id: "workspace-1" }]), { status: 200 });
	}
	return new Response(JSON.stringify([]), { status: 200 });
}

describe("account settings routes", () => {
	it("returns private layout, beta, and privacy bootstrap data", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => authenticatedFetch(input)));
		const init = {
			headers: { authorization: "Bearer session-token" },
		};
		const [layout, beta, privacy, broadcast, danger, details, mfa, apps, authorizedApps, oauthApps, managementKeys, byok, keys, onboarding, transactions, credits, paymentMethods, oauthAppDetail, observability, workspacePrivacy] = await Promise.all([
			app.request("https://phaseo.app/api/account/settings/layout?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/beta", init, env),
			app.request("https://phaseo.app/api/account/settings/privacy?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/broadcast?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/account/danger", init, env),
			app.request("https://phaseo.app/api/account/settings/account/details?obfuscateInfo=1", init, env),
			app.request("https://phaseo.app/api/account/settings/account/mfa", init, env),
			app.request("https://phaseo.app/api/account/settings/apps?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/authorized-apps", init, env),
			app.request("https://phaseo.app/api/account/settings/oauth-apps?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/management-api-keys?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/byok?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/keys?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/credits/onboarding?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/credits/transactions?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/credits?workspaceId=workspace-1&obfuscateInfo=1", init, env),
			app.request("https://phaseo.app/api/account/settings/payment-methods?workspaceId=workspace-1&obfuscateInfo=1", init, env),
			app.request("https://phaseo.app/api/account/settings/oauth-apps/client-1", init, env),
			app.request("https://phaseo.app/api/account/settings/observability/destinations/new/sentry?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/workspace/privacy-settings?workspaceId=workspace-1", init, env),
		]);

		for (const response of [layout, beta, privacy, broadcast, danger, details, mfa, apps, authorizedApps, oauthApps, managementKeys, byok, keys, onboarding, transactions, credits, paymentMethods, oauthAppDetail, observability, workspacePrivacy]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-control")).toBe("private, no-store");
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
		}
		await expect(layout.json()).resolves.toEqual({
			isEnterpriseInvoiceMode: true,
			showBroadcast: true,
			signedIn: true,
		});
		await expect(beta.json()).resolves.toMatchObject({
			signedIn: true,
			profile: { betaOptIn: true, betaFeatures: { models_catalogue_v2: true } },
		});
		await expect(privacy.json()).resolves.toMatchObject({
			workspaceId: "workspace-1",
			teamName: "Team One",
			initialGlobal: { privacy_zdr_only: true },
			providers: [{ id: "openai-eu", name: "OpenAI (EU)" }],
			activeProviderModels: [{
				apiModelId: "gpt-test",
				internalModelId: "openai/gpt-test",
				providerId: "openai-eu",
			}],
		});
		await expect(broadcast.json()).resolves.toMatchObject({
			workspaceId: "workspace-1",
			teamName: "Team One",
			configuredDestinations: [{
				id: "destination-row-1",
				destinationId: "destination-1",
				samplingRate: 0.5,
			}],
		});
		await expect(danger.json()).resolves.toEqual({ signedIn: true });
		await expect(details.json()).resolves.toEqual({
			hasPassword: true,
			teams: [{ id: "workspace-1", name: "Team One" }],
			user: {
				id: "user-1",
				displayName: "Test User",
				email: "user@example.com",
				defaultWorkspaceId: "workspace-1",
				obfuscateInfo: true,
				createdAt: "2025-01-01T00:00:00Z",
			},
		});
		await expect(mfa.json()).resolves.toEqual({
			hasPassword: true,
			mfaEnabled: true,
			mfaFactorId: "factor-1",
			signedIn: true,
		});
		await expect(apps.json()).resolves.toMatchObject({
			apps: [{
				id: "app-1",
				category: "chat,research",
				title: "Customer App",
			}],
		});
		await expect(authorizedApps.json()).resolves.toMatchObject({
			signedIn: true,
			userId: "user-1",
			authorizedApps: [{
				authorization_id: "authorization-1",
				app_name: "Example OAuth App",
				additional_scopes: ["usage:read"],
				team_name: "Team One",
			}],
		});
		await expect(oauthApps.json()).resolves.toMatchObject({
			initialTeamId: "workspace-1",
			signedIn: true,
			oauthApps: [{ client_id: "client-1" }],
		});
		await expect(managementKeys.json()).resolves.toMatchObject({
			currentUserId: "user-1",
			workspace: { id: "workspace-1", name: "Team One" },
			teamsWithKeys: [{ keys: [{ id: "management-key-1" }] }],
		});
		await expect(byok.json()).resolves.toMatchObject({
			fallbackEnabled: false,
			freeRemaining: 0,
			keyEntries: [
				{ id: "byok-new", providerId: "openai", suffix: "1234" },
				{ id: "byok-old", providerId: "openai", suffix: "0000" },
			],
			legacyHiddenTotal: 0,
			monthlyRequestCount: 100250,
			paidTierRequests: 250,
			workspaceId: "workspace-1",
		});
		await expect(keys.json()).resolves.toMatchObject({
			currentUserId: "user-1",
			initialWorkspaceId: "workspace-1",
			workspaces: [{ id: "workspace-1", name: "Team One" }],
			teamsWithKeys: [{
				id: "workspace-1",
				keys: [{
					id: "key-1",
					current_usage_daily: 3,
					current_usage_monthly_cost_nanos: 2000,
					last_used_at: "2026-07-14T00:00:00Z",
				}],
			}],
		});
		await expect(onboarding.json()).resolves.toMatchObject({
			canAccessOnboarding: true,
			canManageBilling: true,
			currentBillingMode: "invoice",
			initialBillingDay: 15,
			initialPaymentTermsDays: 14,
			invoiceProfileEnabled: true,
			signedIn: true,
			workspaceId: "workspace-1",
		});
		await expect(transactions.json()).resolves.toMatchObject({
			billingMode: "invoice",
			isEnterpriseInvoiceMode: true,
			teamTier: "enterprise",
			invoices: [{ id: "invoice-1", amount_nanos: 12000000000 }],
			transactions: [],
			workspaceId: "workspace-1",
		});
		await expect(credits.json()).resolves.toMatchObject({
			initialBalance: 12.5,
			latestPaymentSuccessAt: "2026-07-13T00:00:00Z",
			lowBalanceEmailEnabled: true,
			lowBalanceEmailThresholdUsd: 5,
			obfuscateInfo: true,
			stripeInfo: {
				customer: { id: null, email: null },
				defaultPaymentMethodId: null,
				hasPaymentMethod: false,
				paymentMethods: [],
			},
		});
		await expect(paymentMethods.json()).resolves.toMatchObject({
			customerId: null,
			obfuscateInfo: true,
			initialData: {
				customer: { id: "", email: null },
				defaultPaymentMethodId: null,
				paymentMethods: [],
			},
		});
		await expect(oauthAppDetail.json()).resolves.toMatchObject({
			currentUserId: "user-1",
			signedIn: true,
			oauthApp: { client_id: "client-1", workspace_id: "workspace-1" },
			recentRequests: [{ request_id: "request-1", success: true }],
			usageStats: [{ success: true, cost_nanos: 1000 }],
		});
		await expect(observability.json()).resolves.toMatchObject({
			destinationFound: true,
			teamName: "Team One",
			workspaceId: "workspace-1",
			keys: [{ id: "key-1", name: "Production" }],
			providerOptions: [{ value: "openai-eu", label: "OpenAI" }],
			modelOptions: [{ value: "gpt-test", label: "GPT Test", logoId: "openai" }],
		});
		await expect(workspacePrivacy.json()).resolves.toMatchObject({
			isAuthenticated: true,
			privacyZdrOnly: true,
			providerRestrictionMode: "none",
		});
	});

	it("returns an anonymous private danger response without caching", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("Unauthorized", { status: 401 })));
		const response = await app.request(
			"https://phaseo.app/api/account/settings/account/danger",
			{},
			env,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await expect(response.json()).resolves.toEqual({ signedIn: false });
	});

	it("rejects a workspace that is not accessible to the authenticated user", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/auth/v1/user")) {
				return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const response = await app.request(
			"https://phaseo.app/api/account/settings/privacy?workspaceId=workspace-2",
			{ headers: { authorization: "Bearer session-token" } },
			env,
		);
		expect(response.status).toBe(403);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});
});
