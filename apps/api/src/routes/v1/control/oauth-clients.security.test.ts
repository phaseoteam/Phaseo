import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	metadataRows: [] as Array<Record<string, unknown> | null>,
	updateClient: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/runtime/env", () => ({
	configureRuntime: () => undefined,
	clearRuntime: () => undefined,
	getSupabaseAdmin: () => ({
		auth: {
			admin: {
				oauth: {
					updateClient: state.updateClient,
				},
			},
		},
		from(table: string) {
			if (table !== "oauth_app_metadata") {
				throw new Error(`Unexpected table: ${table}`);
			}
			return {
				select: () => ({
					eq: () => ({
						eq: () => ({
							maybeSingle: async () => ({
								data: state.metadataRows.shift() ?? null,
								error: null,
							}),
						}),
					}),
				}),
				update: () => ({
					eq: () => ({
						eq: () => ({
							select: () => ({
								single: async () => ({
									data: state.metadataRows.shift() ?? null,
									error: null,
								}),
							}),
						}),
					}),
				}),
			};
		},
	}),
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: vi.fn(async () => ({
		ok: true,
		value: {
			workspaceId: "ws_attacker",
			apiKeyId: "mgmt_1",
			authMethod: "api_key",
			scopes: ["oauth_clients:write"],
		},
	})),
}));

describe("OAuth client management security", () => {
	beforeEach(() => {
		state.metadataRows.length = 0;
		state.updateClient.mockClear();
		vi.resetModules();
	});

	it("does not update upstream redirect URIs before local client ownership is proven", async () => {
		const { default: oauthClientsRoutes } = await import("./oauth-clients");
		const response = await oauthClientsRoutes.request("https://example.com/victim_client", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				redirect_uris: ["https://attacker.example/callback"],
			}),
		});
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe("OAuth app not found");
		expect(state.updateClient).not.toHaveBeenCalled();
	});
});
