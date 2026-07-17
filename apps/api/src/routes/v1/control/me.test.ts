import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	auth: {
		ok: true,
		workspaceId: "workspace_1",
		apiKeyId: "key_1",
		apiKeyRef: "oauth_client_1",
		apiKeyKid: "kid_1",
		userId: "user_1",
		authMethod: "oauth" as const,
		oauthClientId: "client_1",
		oauthScopes: ["openid", "me:read"],
	},
}));

vi.mock("@/pipeline/before/auth", () => ({
	authenticateManagement: vi.fn(async () => state.auth),
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		auth: {
			admin: {
				getUserById: async () => ({
					data: {
						user: {
							id: "user_1",
							email: "user@example.com",
							user_metadata: { full_name: "Phaseo User" },
						},
					},
				}),
			},
		},
		from: () => ({
			select: () => ({
				eq: async () => ({
					data: [{
						role: "owner",
						workspace_id: "workspace_1",
						workspaces: { id: "workspace_1", name: "Example", slug: "example" },
					}],
					error: null,
				}),
			}),
		}),
	}),
}));

vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json", ...headers },
		}),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

describe("GET /v1/me", () => {
	beforeEach(() => {
		state.auth.oauthScopes = ["openid", "me:read"];
	});

	it("accepts an OAuth delegated key identity", async () => {
		const { meRoutes } = await import("./me");
		const response = await meRoutes.request("https://api.phaseo.app/", {
			headers: { Authorization: "Bearer phaseo_v1_sk_example" },
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			data: {
				user: { id: "user_1", email: "user@example.com", name: "Phaseo User" },
				oauth: { client_id: "client_1", scopes: ["openid", "me:read"] },
				current_workspace_id: "workspace_1",
			},
		});
	});

	it("enforces me:read for both JWT and opaque OAuth tokens", async () => {
		state.auth.oauthScopes = ["openid"];
		const { meRoutes } = await import("./me");
		const response = await meRoutes.request("https://api.phaseo.app/", {
			headers: { Authorization: "Bearer phaseo_v1_sk_example" },
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "insufficient_scope" });
	});
});
