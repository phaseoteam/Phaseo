import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("account auth routes", () => {
	it.each(["status", "header", "statsig"])(
		"returns an anonymous private response for %s",
		async (resource) => {
			const response = await app.request(
				`https://phaseo.app/api/account/auth/${resource}`,
				{},
				{ ENV: "development" },
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-control")).toBe("private, no-store");
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
		},
	);

	it("keeps the workspace directory private", async () => {
		const response = await app.request(
			"https://phaseo.app/api/account/auth/workspaces",
			{},
			{ ENV: "development" },
		);
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
	});

	it("returns workspace names for the activation selector", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/auth/v1/user")) {
				return new Response(JSON.stringify({ id: "user-1", email: "user@example.com" }), { status: 200 });
			}
			return new Response(JSON.stringify([{
				role: "owner",
				workspace_id: "workspace-uuid",
				workspaces: {
					id: "workspace-uuid",
					name: "Acme Platform",
					slug: "acme-platform",
				},
			}]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/account/auth/workspaces",
			{ headers: { authorization: "Bearer session-token" } },
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			workspaces: [{ id: "workspace-uuid", name: "Acme Platform", role: "owner" }],
		});
	});

	it.each([
		"phaseo_v1_sk_abcdefghijkl_12345678901234567890",
		"aistats_v1_sk_abcdefghijkl_12345678901234567890",
	])("tests %s keys against the gateway", async (apiKey) => {
		const gatewayRequests: Array<{ url: string; authorization: string | null }> = [];
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes("/auth/v1/user")) {
				return new Response(JSON.stringify({ id: "user-1", email: "user@example.com" }), { status: 200 });
			}
			if (url.includes("/models?endpoints=chat/completions")) {
				const headers = new Headers(init?.headers);
				gatewayRequests.push({ url, authorization: headers.get("authorization") });
				return new Response(JSON.stringify({ data: [] }), { status: 200 });
			}
			return new Response(JSON.stringify({ error: "unexpected request" }), { status: 404 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/account/auth/test-key",
			{
				method: "POST",
				headers: {
					authorization: "Bearer session-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({ apiKey }),
			},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ ok: true, modelCount: 0 });
		expect(gatewayRequests).toEqual([{
			url: "https://api.phaseo.app/v1/models?endpoints=chat/completions",
			authorization: `Bearer ${apiKey}`,
		}]);
	});

	it("builds authenticated header data from verified workspace access", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/auth/v1/user")) {
				return new Response(JSON.stringify({
					id: "user-1",
					email: "user@example.com",
					user_metadata: { avatar_url: "https://example.com/avatar.png" },
				}), { status: 200 });
			}
			if (url.includes("users")) {
				return new Response(JSON.stringify([{
					default_workspace_id: "workspace-1",
					role: "admin",
					display_name: "Test User",
				}]), { status: 200 });
			}
			if (url.includes("workspace_members")) {
				return new Response(JSON.stringify([{ workspace_id: "workspace-1" }]), { status: 200 });
			}
			if (url.includes("owner_user_id")) {
				return new Response(JSON.stringify([]), { status: 200 });
			}
			return new Response(JSON.stringify([{
				id: "workspace-1",
				name: "Personal Workspace",
			}]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/account/auth/header",
			{
				headers: {
					authorization: "Bearer session-token",
					cookie: "activeWorkspaceId=workspace-1",
				},
			},
			env,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			isLoggedIn: true,
			user: {
				id: "user-1",
				email: "user@example.com",
				displayName: "Test User",
				avatarUrl: "https://example.com/avatar.png",
			},
			teams: [{ id: "workspace-1", name: "Personal Workspace" }],
			currentTeamId: "workspace-1",
			userRole: "admin",
		});
	});

	it("normalizes authenticated Statsig profile flags", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/auth/v1/user")) {
				return new Response(JSON.stringify({ id: "user-1", email: "user@example.com" }), { status: 200 });
			}
			return new Response(JSON.stringify([{
				beta_opt_in: true,
				beta_features: { models_catalogue_v2: true, invalid: "yes" },
			}]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/account/auth/statsig",
			{ headers: { authorization: "Bearer session-token" } },
			env,
		);
		await expect(response.json()).resolves.toMatchObject({
			signedIn: true,
			profile: {
				betaOptIn: true,
				betaFeatures: { models_catalogue_v2: true },
			},
		});
	});
});
