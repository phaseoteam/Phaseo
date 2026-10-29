import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	refreshRow: null as Record<string, unknown> | null,
	rotationRow: null as Record<string, unknown> | null,
	fromCalls: [] as string[],
	insertedRefreshTokens: [] as Array<Record<string, unknown>>,
	refreshInsertError: null as { message?: string } | null,
	rotationStatus: "invalid" as unknown,
	rpcError: null as { message?: string } | null,
	rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
	refreshLookupHashes: [] as string[],
	authorizationRow: { id: "auth_1", scopes: ["openid"], revoked_at: null } as Record<string, unknown> | null,
	authorizationUpdateError: null as { message?: string } | null,
	delegatedKeyRow: null as Record<string, unknown> | null,
	revokedDelegatedKeyIds: [] as string[],
	revokedRefreshKeyRows: [] as Array<{ key_id: string | null }>,
	auditEvents: [] as Array<Record<string, unknown>>,
	keyUpdates: [] as Array<{ payload: Record<string, unknown>; filters: unknown[][] }>,
	renewedKeyRow: null as Record<string, unknown> | null,
	clientRowOverrides: {} as Record<string, unknown>,
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
								select: () => Object.assign(Promise.resolve({ data: state.revokedRefreshKeyRows, error: null }), {
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
										...state.clientRowOverrides,
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
			if (table === "keys") {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({ data: state.delegatedKeyRow, error: null }),
						}),
					}),
					update: (payload: Record<string, unknown>) => {
						const filters: unknown[][] = [];
						const chain = {
							eq(column: string, value: unknown) {
								if (column === "id") state.revokedDelegatedKeyIds.push(String(value));
								filters.push([column, "eq", value]);
								return chain;
							},
							in(column: string, values: unknown[]) {
								if (column === "id") state.revokedDelegatedKeyIds.push(...values.map(String));
								filters.push([column, "in", values]);
								return chain;
							},
							gt(column: string, value: unknown) { filters.push([column, "gt", value]); return chain; },
							select: () => chain,
							maybeSingle: async () => {
								state.keyUpdates.push({ payload, filters });
								return { data: state.renewedKeyRow, error: null };
							},
						};
						return chain;
					},
				};
			}
			if (table === "workspace_audit_events") {
				return {
					insert: async (row: Record<string, unknown>) => {
						state.auditEvents.push(row);
						return { error: null };
					},
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
		state.clientRowOverrides = {};
		state.authorizationUpdateError = null;
		state.delegatedKeyRow = null;
		state.revokedDelegatedKeyIds.length = 0;
		state.revokedRefreshKeyRows = [];
		state.auditEvents.length = 0;
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

	it("never refreshes a dynamic client into MCP management scopes added by a later consent", async () => {
		state.rotationStatus = "rotated";
		// A dynamically registered client whose read-only refresh token predates an MCP management consent.
		state.clientRowOverrides = { is_first_party: false };
		state.refreshRow = { ...state.refreshRow!, scopes: ["openid", "models:read"] };
		state.authorizationRow = { id: "auth_1", scopes: ["openid", "models:read", "keys:write"], revoked_at: null };
		const { rotateRefreshToken } = await import("./service");

		await expect(rotateRefreshToken("refresh-token")).resolves.toEqual({ ok: false, reason: "invalid_grant" });
		expect(state.rpcCalls).toEqual([]);
	});

	it("refuses a refresh whose narrowed scopes are empty instead of storing an empty list", async () => {
		state.rotationStatus = "rotated";
		// A CLI session with models:read; a later login replaced the authorization with keys:delete only.
		state.refreshRow = { ...state.refreshRow!, scopes: ["models:read"] };
		state.authorizationRow = { id: "auth_1", scopes: ["keys:delete"], revoked_at: null };
		const { rotateRefreshToken } = await import("./service");

		await expect(rotateRefreshToken("refresh-token")).resolves.toEqual({ ok: false, reason: "invalid_grant" });
		expect(state.rpcCalls).toEqual([]);
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
		expect(result?.expires_in).toBe(7 * 24 * 60 * 60);
		const rpcCall = state.rpcCalls.at(-1);
		expect(rpcCall).toMatchObject({
			name: "consume_oauth_code_and_issue_delegated_grant",
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

	it("returns a refresh token with the delegated key, stored hashed in the same transaction", async () => {
		state.rotationStatus = "issued";
		const { issueOAuthManagedKeyForAuthorizationCode, hashOAuthSecret } = await import("./service");

		const before = Date.now();
		const result = await issueOAuthManagedKeyForAuthorizationCode(
			"00000000-0000-0000-0000-000000000005",
			{ userId: "user_1", workspaceId: "ws_1", clientId: "partner_app", scopes: ["gateway:access"] },
		);

		expect(result?.refresh_token).toMatch(/^[A-Za-z0-9_-]{64}$/);
		const args = state.rpcCalls.at(-1)?.args ?? {};
		expect(args.p_refresh_token_hash).toBe(await hashOAuthSecret(String(result?.refresh_token)));
		const refreshExpiresAt = Date.parse(String(args.p_refresh_expires_at));
		expect(refreshExpiresAt - before).toBeGreaterThanOrEqual(90 * 24 * 60 * 60 * 1000 - 1000);
		expect(refreshExpiresAt - before).toBeLessThanOrEqual(90 * 24 * 60 * 60 * 1000 + 1000);
		// Seven-day access tokens, as before.
		expect(result?.expires_in).toBe(7 * 24 * 60 * 60);
	});

	it("refreshes a delegated key in place: same key ID, new secret, new refresh token, no new key event", async () => {
		const kid = "AbCdEf123456";
		state.refreshRow = { ...state.refreshRow!, scopes: ["gateway:access"], key_id: "delegated_key_1" };
		state.rotationStatus = { status: "rotated", kid, scopes: ["gateway:access"], resource: null };
		const { rotateRefreshToken } = await import("./service");
		const { hmacSecret } = await import("@/routes/auth.helpers");

		const result = await rotateRefreshToken("refresh-token");

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("refresh failed");
		const secret = result.tokens.access_token.match(new RegExp(`^phaseo_v1_sk_${kid}_([A-Za-z0-9]{40})$`))?.[1];
		expect(secret).toBeTruthy();
		expect(result.tokens).toMatchObject({ token_type: "Bearer", expires_in: 7 * 24 * 60 * 60, scope: "gateway:access" });
		expect(result.tokens.refresh_token).not.toBe("refresh-token");
		expect(state.rpcCalls).toHaveLength(1);
		expect(state.rpcCalls[0]).toMatchObject({
			name: "rotate_oauth_delegated_refresh_token",
			args: { p_current_token_hash: "stored-refresh-hash", p_key_hash: await hmacSecret(secret!, "test-pepper") },
		});
		expect(state.insertedRefreshTokens).toEqual([]);
		expect(state.auditEvents).toEqual([]);
	});

	it("leaves a reused delegated refresh token to the database, which ends its chain and key", async () => {
		state.refreshRow = { ...state.refreshRow!, revoked_at: new Date().toISOString(), key_id: "delegated_key_1" };
		state.rotationStatus = { status: "reused" };
		const { rotateRefreshToken } = await import("./service");

		await expect(rotateRefreshToken("refresh-token")).resolves.toEqual({ ok: false, reason: "invalid_grant" });
		expect(state.rpcCalls.map((call) => call.name)).toEqual(["rotate_oauth_delegated_refresh_token"]);
	});

	it("refuses a delegated refresh the database rejects, such as for a revoked key", async () => {
		state.refreshRow = { ...state.refreshRow!, key_id: "delegated_key_1" };
		state.rotationStatus = { status: "invalid" };
		const { rotateRefreshToken } = await import("./service");

		await expect(rotateRefreshToken("refresh-token")).resolves.toEqual({ ok: false, reason: "invalid_grant" });
	});

	it("fails closed when the delegated rotation errors", async () => {
		state.refreshRow = { ...state.refreshRow!, key_id: "delegated_key_1" };
		state.rpcError = { message: "rotation failed" };
		const { rotateRefreshToken } = await import("./service");

		await expect(rotateRefreshToken("refresh-token")).rejects.toThrow("rotation failed");
	});

	it("revokes the delegated key when its refresh token is revoked", async () => {
		state.revokedRefreshKeyRows = [{ key_id: "delegated_key_1" }];
		const { revokeToken } = await import("./service");

		await revokeToken("some-refresh-token");

		expect(state.revokedDelegatedKeyIds).toEqual(["delegated_key_1"]);
	});

	it("records an OAuth-managed key as a new API key, so owners and admins are alerted", async () => {
		state.rotationStatus = "issued";
		state.delegatedKeyRow = { id: "key_1", name: "OAuth: partner_app", prefix: "abc123" };
		const { issueOAuthManagedKeyForAuthorizationCode } = await import("./service");

		const result = await issueOAuthManagedKeyForAuthorizationCode(
			"00000000-0000-0000-0000-000000000003",
			{ userId: "user_1", workspaceId: "ws_1", clientId: "partner_app", scopes: ["gateway:access"] },
			{ clientName: "Partner App" },
		);

		expect(result?.access_token).toMatch(/^phaseo_v1_sk_/);
		expect(state.auditEvents).toEqual([{
			workspace_id: "ws_1",
			actor_user_id: "user_1",
			action: "api_key.created",
			target_type: "api_key",
			target_id: "key_1",
			target_name: "OAuth: partner_app",
			metadata: { prefix: "abc123", status: "active", source: "oauth", oauthClientId: "partner_app", appName: "Partner App" },
			request_id: null,
		}]);
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

	it("refuses to mint a Gateway API resource key without gateway access consent", async () => {
		const { issueOAuthManagedKeyForAuthorizationCode } = await import("./service");
		const rpcCallCount = state.rpcCalls.length;

		const result = await issueOAuthManagedKeyForAuthorizationCode(
			"00000000-0000-0000-0000-000000000004",
			{
				userId: "user_1",
				workspaceId: "ws_1",
				clientId: "third_party",
				scopes: ["models:read"],
				resource: "https://api.phaseo.app:443/v1/",
			},
		);

		expect(result).toBeNull();
		expect(state.rpcCalls).toHaveLength(rpcCallCount);
	});

	it("mints a least-privilege OAuth-managed key for an MCP resource", async () => {
		state.rotationStatus = "issued";
		const { issueOAuthManagedKeyForAuthorizationCode } = await import("./service");

		const result = await issueOAuthManagedKeyForAuthorizationCode(
			"00000000-0000-0000-0000-000000000004",
			{
				userId: "user_1",
				workspaceId: "ws_1",
				clientId: "mcp_client",
				scopes: ["models:read", "pricing:read"],
				resource: "https://mcp.phaseo.app/mcp",
			},
		);

		expect(result?.access_token).toMatch(/^phaseo_v1_sk_/);
		expect(state.rpcCalls.at(-1)).toMatchObject({
			name: "consume_oauth_code_and_issue_delegated_grant",
			args: {
				p_scopes: ["models:read", "pricing:read"],
				p_resource: "https://mcp.phaseo.app/mcp",
			},
		});
	});

	it("revokes a delegated access token after verifying its secret", async () => {
		const kid = "AbCdEf123456";
		const secret = "AbCdEf123456AbCdEf123456AbCdEf123456AbCd";
		const { hmacSecret } = await import("@/routes/auth.helpers");
		state.delegatedKeyRow = {
			id: "delegated_key_1",
			hash: await hmacSecret(secret, "test-pepper"),
			key_kind: "oauth_delegated",
			status: "active",
		};
		const { revokeToken } = await import("./service");

		await revokeToken(`phaseo_v1_sk_${kid}_${secret}`);

		expect(state.revokedDelegatedKeyIds).toEqual(["delegated_key_1"]);
	});

	it("does not revoke a delegated key for the wrong secret", async () => {
		const kid = "AbCdEf123456";
		const secret = "AbCdEf123456AbCdEf123456AbCdEf123456AbCd";
		const { hmacSecret } = await import("@/routes/auth.helpers");
		state.delegatedKeyRow = {
			id: "delegated_key_1",
			hash: await hmacSecret("Z".repeat(40), "test-pepper"),
			key_kind: "oauth_delegated",
			status: "active",
		};
		const { revokeToken } = await import("./service");

		await revokeToken(`phaseo_v1_sk_${kid}_${secret}`);

		expect(state.revokedDelegatedKeyIds).toEqual([]);
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

describe("Desktop key renewal", () => {
	beforeEach(() => { state.keyUpdates = []; state.renewedKeyRow = null; });

	it("extends only the desktop's own active, unexpired delegated key by 30 days", async () => {
		const { renewDesktopKey } = await import("./service");
		const before = Date.now();
		state.renewedKeyRow = { expires_at: "2026-11-25T12:00:00.000Z" };
		await expect(renewDesktopKey("key_1")).resolves.toEqual({ expiresAt: "2026-11-25T12:00:00.000Z" });
		const [{ payload, filters }] = state.keyUpdates;
		const days = (Date.parse(String(payload.expires_at)) - before) / 86_400_000;
		expect(days).toBeGreaterThan(29.99); expect(days).toBeLessThan(30.01);
		expect(filters).toEqual(expect.arrayContaining([
			["id", "eq", "key_1"], ["key_kind", "eq", "oauth_delegated"], ["oauth_client_id", "eq", "phaseo_desktop"], ["status", "eq", "active"],
			["expires_at", "gt", expect.any(String)],
		]));
	});

	it("doesn't bring back a key that has expired or been revoked", async () => {
		const { renewDesktopKey } = await import("./service");
		await expect(renewDesktopKey("key_1")).resolves.toBeNull();
	});
});

describe("Desktop key for a Phaseo login", () => {
	beforeEach(() => { state.rpcCalls.length = 0; state.rpcError = null; state.auditEvents.length = 0; state.delegatedKeyRow = null; });

	it("issues a gateway key for the desktop client, 30 days long, and tells owners like any new key", async () => {
		state.rotationStatus = "2026-11-25T12:00:00+00:00";
		state.delegatedKeyRow = { id: "key_9", name: "Phaseo desktop", prefix: "abc123" };
		const { issueDesktopSessionKey } = await import("./service");
		const issued = await issueDesktopSessionKey({ userId: "user_1", workspaceId: "ws_1" });
		expect(issued).toEqual({ key: expect.stringMatching(/^phaseo_v1_sk_/), expiresAt: "2026-11-25T12:00:00.000Z", scopes: ["gateway:access", "models:read"] });
		const rpcCall = state.rpcCalls.at(-1);
		expect(rpcCall).toMatchObject({
			name: "issue_desktop_session_key",
			args: { p_user_id: "user_1", p_workspace_id: "ws_1", p_key_name: "Phaseo desktop", p_resource: "https://api.phaseo.app/v1", p_ttl_seconds: 30 * 24 * 60 * 60, p_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/) },
		});
		expect(rpcCall?.args.p_key_hash).not.toBe(issued?.key);
		expect(state.auditEvents).toEqual([expect.objectContaining({ action: "api_key.created", target_id: "key_9", metadata: expect.objectContaining({ oauthClientId: "phaseo_desktop", appName: "Phaseo desktop" }) })]);
	});

	it("gives no key outside the person's workspaces, and fails loudly when the database does", async () => {
		const { issueDesktopSessionKey } = await import("./service");
		state.rotationStatus = null as unknown as string;
		await expect(issueDesktopSessionKey({ userId: "user_1", workspaceId: "ws_other" })).resolves.toBeNull();
		expect(state.auditEvents).toEqual([]);
		state.rpcError = { message: "issue failed" };
		await expect(issueDesktopSessionKey({ userId: "user_1", workspaceId: "ws_1" })).rejects.toThrow("issue failed");
	});
});
