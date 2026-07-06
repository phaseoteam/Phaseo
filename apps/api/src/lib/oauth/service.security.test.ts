import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	refreshRow: null as Record<string, unknown> | null,
	rotationRow: null as Record<string, unknown> | null,
	fromCalls: [] as string[],
	insertedRefreshTokens: [] as Array<Record<string, unknown>>,
	refreshInsertError: null as { message?: string } | null,
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		SUPABASE_URL: "https://example.supabase.co",
		SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
		GATEWAY_CACHE: {} as KVNamespace,
		KEY_PEPPER_ACTIVE: "test-pepper",
	}),
	getSupabaseAdmin: () => ({
		from(table: string) {
			state.fromCalls.push(table);
			if (table === "oauth_refresh_tokens") {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({
								data: state.refreshRow,
								error: null,
							}),
						}),
					}),
					update: () => ({
						eq: () => ({
							is: () => ({
								select: () => ({
									maybeSingle: async () => ({
										data: state.rotationRow,
										error: null,
									}),
								}),
							}),
						}),
					}),
					insert: async (payload: Record<string, unknown>) => {
						state.insertedRefreshTokens.push(payload);
						return { error: state.refreshInsertError };
					},
				};
			}
			if (table === "oauth_clients") {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								maybeSingle: async () => ({
									data: {
										id: "phaseo_cli",
										name: "Phaseo CLI",
										client_type: "public",
										redirect_uris: [],
										allowed_scopes: ["openid"],
										is_first_party: true,
										beta_status: "private",
										status: "active",
									},
									error: null,
								}),
							}),
						}),
					}),
				};
			}
			if (table === "oauth_authorizations") {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								eq: () => ({
									maybeSingle: async () => ({
										data: { scopes: ["openid"], revoked_at: null },
										error: null,
									}),
								}),
							}),
						}),
					}),
				};
			}
			throw new Error(`Unexpected table: ${table}`);
		},
	}),
}));

describe("OAuth refresh rotation security", () => {
	beforeEach(() => {
		state.refreshRow = {
			id: "refresh_1",
			user_id: "user_1",
			workspace_id: "ws_1",
			client_id: "phaseo_cli",
			scopes: ["openid"],
			expires_at: new Date(Date.now() + 60_000).toISOString(),
			revoked_at: null,
		};
		state.rotationRow = null;
		state.refreshInsertError = null;
		state.fromCalls.length = 0;
		state.insertedRefreshTokens.length = 0;
		vi.resetModules();
	});

	it("does not load third-party OAuth clients while the CLI-only beta gate is closed", async () => {
		const { loadOAuthClient } = await import("./service");

		await expect(loadOAuthClient("partner_client")).resolves.toBeNull();
		expect(state.fromCalls).toEqual([]);
	});

	it("rejects replay when the refresh-token revoke transition updates no row", async () => {
		const { rotateRefreshToken } = await import("./service");

		await expect(rotateRefreshToken("refresh-token")).resolves.toEqual({
			ok: false,
			reason: "invalid_grant",
		});
		expect(state.insertedRefreshTokens).toEqual([]);
	});

	it("fails token issuance when refresh-token persistence fails", async () => {
		state.refreshInsertError = { message: "insert failed" };
		const { issueTokenPair } = await import("./service");

		await expect(
			issueTokenPair({
				userId: "user_1",
				workspaceId: "ws_1",
				clientId: "phaseo_cli",
				scopes: ["openid"],
				email: "user@example.com",
				name: "Test User",
			}),
		).rejects.toThrow("insert failed");
		expect(state.insertedRefreshTokens).toHaveLength(1);
	});
});
