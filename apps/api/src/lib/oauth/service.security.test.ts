import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	refreshRow: null as Record<string, unknown> | null,
	rotationRow: null as Record<string, unknown> | null,
	fromCalls: [] as string[],
	insertedRefreshTokens: [] as Array<Record<string, unknown>>,
	refreshInsertError: null as { message?: string } | null,
	rotationStatus: "invalid" as string,
	rpcError: null as { message?: string } | null,
	rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
	refreshLookupHashes: [] as string[],
	authorizationRow: { id: "auth_1", scopes: ["openid"], revoked_at: null } as Record<string, unknown> | null,
	authorizationUpdateError: null as { message?: string } | null,
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		SUPABASE_URL: "https://example.supabase.co",
		SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
		GATEWAY_CACHE: {} as KVNamespace,
		KEY_PEPPER_ACTIVE: "test-pepper",
		PHASEO_OAUTH_TOKEN_PEPPER_ACTIVE: "active-oauth-pepper",
		PHASEO_OAUTH_TOKEN_PEPPER_PREVIOUS: "previous-oauth-pepper",
	}),
	getSupabaseAdmin: () => ({
		auth: { admin: { getUserById: async () => ({ data: { user: { email: "user@example.com", user_metadata: {} } } }) } },
		rpc: async (name: string, args: Record<string, unknown>) => {
			state.rpcCalls.push({ name, args });
			return { data: state.rotationStatus, error: state.rpcError };
		},
		from(table: string) {
			state.fromCalls.push(table);
			if (table === "oauth_refresh_tokens") {
				return {
					select: () => ({
						in: (_column: string, hashes: string[]) => {
							state.refreshLookupHashes.push(...hashes);
							return {
							maybeSingle: async () => ({
								data: state.refreshRow,
								error: null,
							}),
							};
						},
						eq: () => ({
							maybeSingle: async () => ({
								data: state.refreshRow,
								error: null,
							}),
						}),
					}),
					update: () => ({
						in: () => ({
							is: () => ({
								select: () => ({
									maybeSingle: async () => ({
										data: state.rotationRow,
										error: null,
									}),
								}),
							}),
						}),
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
										data: state.authorizationRow,
										error: null,
									}),
								}),
							}),
						}),
					}),
					update: () => ({
						eq: async () => ({ error: state.authorizationUpdateError }),
					}),
					insert: async () => ({ error: null }),
				};
			}
			if (table === "workspace_members") {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								maybeSingle: async () => ({ data: { workspace_id: "ws_1" }, error: null }),
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
			token_hash: "stored-refresh-hash",
			user_id: "user_1",
			workspace_id: "ws_1",
			client_id: "phaseo_cli",
			scopes: ["openid"],
			expires_at: new Date(Date.now() + 60_000).toISOString(),
			revoked_at: null,
		};
		state.rotationRow = null;
		state.refreshInsertError = null;
		state.rotationStatus = "invalid";
		state.rpcError = null;
		state.fromCalls.length = 0;
		state.insertedRefreshTokens.length = 0;
		state.rpcCalls.length = 0;
		state.refreshLookupHashes.length = 0;
		state.authorizationRow = { id: "auth_1", scopes: ["openid"], revoked_at: null };
		state.authorizationUpdateError = null;
		vi.resetModules();
	});

	it("does not load third-party OAuth clients while the CLI-only beta gate is closed", async () => {
		const { loadOAuthClient } = await import("./service");

		await expect(loadOAuthClient("partner_client")).resolves.toBeNull();
		expect(state.fromCalls).toEqual([]);
	});

	it("rejects rotation when the atomic database transition fails", async () => {
		const { rotateRefreshToken } = await import("./service");

		await expect(rotateRefreshToken("refresh-token")).resolves.toEqual({
			ok: false,
			reason: "invalid_grant",
		});
		expect(state.insertedRefreshTokens).toEqual([]);
		expect(state.rpcCalls).toHaveLength(1);
		expect(state.rpcCalls[0]?.name).toBe("rotate_oauth_refresh_token");
	});

	it("returns the new pair only after atomic rotation succeeds", async () => {
		state.rotationStatus = "rotated";
		const { rotateRefreshToken } = await import("./service");

		const result = await rotateRefreshToken("refresh-token");

		expect(result.ok).toBe(true);
		expect(state.insertedRefreshTokens).toEqual([]);
		expect(state.rpcCalls[0]?.args).toMatchObject({
			p_scopes: ["openid"],
		});
	});

	it("fails closed when revoking a replayed refresh-token family fails", async () => {
		state.refreshRow = { ...state.refreshRow!, revoked_at: new Date().toISOString() };
		state.rpcError = { message: "rotation failed" };
		const { rotateRefreshToken } = await import("./service");

		await expect(rotateRefreshToken("refresh-token")).rejects.toThrow("rotation failed");
	});

	it("looks up refresh tokens with active and previous OAuth peppers", async () => {
		state.rotationStatus = "rotated";
		const { rotateRefreshToken } = await import("./service");

		const result = await rotateRefreshToken("refresh-token");

		expect(result.ok).toBe(true);
		expect(state.refreshLookupHashes).toHaveLength(2);
		expect(state.rpcCalls.at(-1)?.args.p_current_token_hash).toBe("stored-refresh-hash");
		expect(state.rpcCalls.at(-1)?.args.p_next_token_hash).not.toBe("stored-refresh-hash");
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

	it("only returns a token pair after the database atomically consumes its grant", async () => {
		state.rotationStatus = "issued";
		const { issueTokenPairForGrant } = await import("./service");

		const result = await issueTokenPairForGrant(
			{ type: "device_code", id: "00000000-0000-0000-0000-000000000001" },
			{ userId: "user_1", workspaceId: "ws_1", clientId: "phaseo_cli", scopes: ["openid"] },
		);

		expect(result?.access_token).toBeTruthy();
		expect(state.rpcCalls.at(-1)).toMatchObject({
			name: "consume_oauth_grant_and_issue_refresh_token",
			args: { p_grant_type: "device_code", p_grant_id: "00000000-0000-0000-0000-000000000001" },
		});
	});

	it("only returns an OAuth-managed key after the database atomically consumes its code", async () => {
		state.rotationStatus = "issued";
		const { issueOAuthManagedKeyForAuthorizationCode } = await import("./service");

		const result = await issueOAuthManagedKeyForAuthorizationCode(
			"00000000-0000-0000-0000-000000000002",
			{ userId: "user_1", workspaceId: "ws_1", clientId: "phaseo_cli", scopes: ["gateway:access", "models:read"] },
		);

		expect(result?.access_token).toMatch(/^phaseo_v1_sk_/);
		const rpcCall = state.rpcCalls.at(-1);
		expect(rpcCall).toMatchObject({
			name: "consume_oauth_code_and_issue_managed_key",
			args: {
				p_code_id: "00000000-0000-0000-0000-000000000002",
				p_user_id: "user_1",
				p_workspace_id: "ws_1",
				p_client_id: "phaseo_cli",
				p_scopes: ["gateway:access", "models:read"],
			},
		});
		expect(rpcCall?.args).toMatchObject({
			p_key_kid: expect.any(String),
			p_key_prefix: expect.stringMatching(/^[A-Za-z0-9]{6}$/),
			p_key_name: "OAuth: phaseo_cli",
			p_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
		expect(rpcCall?.args.p_key_hash).not.toBe(result?.access_token);
	});

	it("refuses to mint an OAuth-managed key without gateway access consent", async () => {
		const { issueOAuthManagedKeyForAuthorizationCode } = await import("./service");
		const rpcCallCount = state.rpcCalls.length;

		const result = await issueOAuthManagedKeyForAuthorizationCode(
			"00000000-0000-0000-0000-000000000003",
			{ userId: "user_1", workspaceId: "ws_1", clientId: "third_party", scopes: ["openid"] },
		);

		expect(result).toBeNull();
		expect(state.rpcCalls).toHaveLength(rpcCallCount);
	});

	it("fails authorization approval when the grant cannot be persisted", async () => {
		state.authorizationUpdateError = { message: "grant update failed" };
		const { ensureGrant } = await import("./service");

		await expect(ensureGrant({
			userId: "user_1",
			workspaceId: "ws_1",
			clientId: "phaseo_cli",
			scopes: ["openid"],
		})).rejects.toThrow("grant update failed");
	});
});
