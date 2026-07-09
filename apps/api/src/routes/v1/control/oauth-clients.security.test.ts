import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	thirdPartyOAuthEnabled: false,
	metadataRows: [] as Array<Record<string, unknown> | null>,
	createClient: vi.fn(async () => ({ data: { client_id: "client_1" }, error: null })),
	updateClient: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/runtime/env", () => ({
	configureRuntime: () => undefined,
	clearRuntime: () => undefined,
	getBindings: () => ({
		PHASEO_THIRD_PARTY_OAUTH_ENABLED: state.thirdPartyOAuthEnabled ? "true" : undefined,
	}),
	getSupabaseAdmin: () => ({
		auth: {
			admin: {
				oauth: {
					createClient: state.createClient,
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
		state.thirdPartyOAuthEnabled = false;
		state.metadataRows.length = 0;
		state.createClient.mockClear();
		state.updateClient.mockClear();
		vi.resetModules();
	});

	it("keeps third-party OAuth client creation closed during the CLI beta", async () => {
		const { default: oauthClientsRoutes } = await import("./oauth-clients");
		const response = await oauthClientsRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: "Partner App",
				redirect_uris: ["https://partner.example/callback"],
			}),
		});
		const body = await response.json();

		expect(response.status).toBe(403);
		expect(body.error).toBe("third_party_oauth_disabled");
		expect(body.message).toContain("coming soon");
		expect(state.createClient).not.toHaveBeenCalled();
	});

	it("does not update upstream redirect URIs before local client ownership is proven", async () => {
		state.thirdPartyOAuthEnabled = true;
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
