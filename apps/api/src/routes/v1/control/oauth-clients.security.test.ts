import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	thirdPartyOAuthEnabled: false,
	metadataRows: [] as Array<Record<string, unknown> | null>,
	insertPayloads: [] as Array<Record<string, unknown>>,
	operations: [] as string[],
	createClient: vi.fn(async () => ({ data: { client_id: "client_1" }, error: null })),
	updateClient: vi.fn(async () => ({ error: null })),
	deleteClient: vi.fn(async () => {
		state.operations.push("delete-upstream");
		return { error: null };
	}),
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
						deleteClient: state.deleteClient,
				},
			},
		},
		from(table: string) {
			if (table === "oauth_authorizations") {
				return {
					update: () => ({
						eq: () => ({
							is: () => {
								state.operations.push("revoke-authorizations");
								return { error: null };
							},
						}),
					}),
				};
			}
			if (table !== "oauth_app_metadata") throw new Error(`Unexpected table: ${table}`);
			return {
				insert: (payload: Record<string, unknown>) => {
					state.insertPayloads.push(payload);
					return {
						select: () => ({
							single: async () => ({ data: payload, error: null }),
						}),
					};
				},
				select: () => ({
					eq: () => ({
						eq: () => {
							const result = async () => ({
								data: state.metadataRows.shift() ?? null,
								error: null,
							});
							return { maybeSingle: result, single: result };
						},
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
				delete: () => ({
					eq: () => ({
						eq: () => {
							state.operations.push("delete-metadata");
							return { error: null };
						},
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
			userId: "user_1",
			apiKeyId: "mgmt_1",
			authMethod: "api_key",
			scopes: ["oauth_clients:write", "oauth_clients:delete"],
		},
	})),
}));

describe("OAuth client management security", () => {
	beforeEach(() => {
		state.thirdPartyOAuthEnabled = false;
		state.metadataRows.length = 0;
		state.insertPayloads.length = 0;
		state.operations.length = 0;
		state.createClient.mockClear();
		state.updateClient.mockClear();
		state.deleteClient.mockClear();
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

	it("includes explicit gateway access in new third-party client defaults", async () => {
		state.thirdPartyOAuthEnabled = true;
		const { default: oauthClientsRoutes } = await import("./oauth-clients");
		const response = await oauthClientsRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: "Partner App",
				redirect_uris: ["https://partner.example/callback"],
			}),
		});

		expect(response.status).toBe(201);
		expect(state.insertPayloads).toHaveLength(1);
		expect(state.insertPayloads[0]?.allowed_scopes).toContain("gateway:access");
	});

	it("revokes delegated authorizations before deleting an OAuth client", async () => {
		state.thirdPartyOAuthEnabled = true;
		state.metadataRows.push({ client_id: "owned_client" });
		const { default: oauthClientsRoutes } = await import("./oauth-clients");
		const response = await oauthClientsRoutes.request("https://example.com/owned_client", {
			method: "DELETE",
		});

		expect(response.status).toBe(200);
		expect(state.operations).toEqual([
			"revoke-authorizations",
			"delete-upstream",
			"delete-metadata",
		]);
	});
});
