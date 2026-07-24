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
