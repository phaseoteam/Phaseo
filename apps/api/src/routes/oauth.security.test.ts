import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	deviceRow: null as Record<string, unknown> | null,
	authorizationRow: null as Record<string, unknown> | null,
	authorizationCodeRow: null as Record<string, unknown> | null,
	client: { id: "phaseo_cli", name: "Phaseo CLI", client_type: "public" } as Record<string, unknown>,
	updateResult: null as Record<string, unknown> | null,
	updatePayloads: [] as Array<Record<string, unknown>>,
	updateFilters: [] as Array<Array<{ column: string; value: unknown }>>,
	issuedTokenPairs: [] as Array<Record<string, unknown>>,
	issuedManagedKeys: [] as Array<Record<string, unknown>>,
	pollStatus: "ok" as string,
}));

const FUTURE_EXPIRES_AT = "2999-01-01T00:00:00.000Z";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
	});
}

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({}),
	getSupabaseAdmin: () => ({
		rpc: async () => ({ data: state.pollStatus, error: null }),
		from(table: string) {
			if (table === "oauth_authorization_codes") {
				return {
					select: () => ({
						in: () => ({
							eq: () => ({
								maybeSingle: async () => ({ data: state.authorizationCodeRow, error: null }),
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
									maybeSingle: async () => ({ data: state.authorizationRow, error: null }),
								}),
							}),
						}),
					}),
				};
			}
			if (table !== "oauth_device_codes") throw new Error(`Unexpected table: ${table}`);
			return {
				select: () => ({
					in: () => ({
						eq: () => ({
							maybeSingle: async () => ({ data: state.deviceRow, error: null }),
						}),
						maybeSingle: async () => ({ data: state.deviceRow, error: null }),
					}),
					eq: () => ({
						eq: () => ({
							maybeSingle: async () => ({ data: state.deviceRow, error: null }),
						}),
						maybeSingle: async () => ({ data: state.deviceRow, error: null }),
					}),
				}),
				update: (payload: Record<string, unknown>) => {
					state.updatePayloads.push(payload);
					const filters: Array<{ column: string; value: unknown }> = [];
					state.updateFilters.push(filters);
					return {
						eq(column: string, value: unknown) {
							filters.push({ column, value });
							return this;
						},
						is(column: string, value: unknown) {
							filters.push({ column, value });
							return this;
						},
						select() {
							return this;
						},
						maybeSingle: async () => ({ data: state.updateResult, error: null }),
					};
				},
			};
		},
	}),
}));

vi.mock("@/routes/utils", () => ({
	json,
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

vi.mock("@/lib/oauth/service", () => ({
	CLI_CLIENT_ID: "phaseo_cli",
	CLI_DEFAULT_SCOPES: ["openid"],
	assertRedirectAllowed: vi.fn(() => true),
	authorizationConsentUrl: vi.fn(() => "https://example.com/consent"),
	bearerToken: vi.fn(() => "user-session"),
	claimsScopes: vi.fn(() => []),
	createOpaqueCode: vi.fn(() => "opaque-code"),
	createUserCode: vi.fn(() => "ABCD-EFGH"),
	defaultDeviceIntervalSeconds: vi.fn(() => 5),
	deviceExpiresInSeconds: vi.fn(() => 600),
	filterAllowedScopes: vi.fn((_client, scopes) => scopes),
	getApiBaseUrl: vi.fn(() => "https://api.example.com"),
	getIssuer: vi.fn(() => "https://api.example.com/oauth"),
	getLocalJwks: vi.fn(async () => ({ keys: [] })),
	getSupabaseActor: vi.fn(async () => ({ userId: "user_1" })),
	hashOAuthSecret: vi.fn(async (value: string) => `hash:${value}`),
	hashOAuthSecretCandidates: vi.fn(async (value: string) => [`hash:${value}`]),
	hasActiveOAuthWorkspaceAccess: vi.fn(async () => Boolean(
		state.authorizationRow && state.authorizationRow.revoked_at == null,
	)),
	issueTokenPairForGrant: vi.fn(async (_grant: Record<string, unknown>, input: Record<string, unknown>) => {
		state.issuedTokenPairs.push(input);
		return { access_token: "token" };
	}),
	issueOAuthManagedKeyForAuthorizationCode: vi.fn(async (_grantId: string, input: Record<string, unknown>) => {
		state.issuedManagedKeys.push(input);
		return { access_token: "phaseo_v1_sk_test", token_type: "Bearer" };
	}),
	isFirstPartyCliClient: vi.fn((clientId: string) => clientId === "phaseo_cli" || clientId === "aistats_cli"),
	loadOAuthClient: vi.fn(async () => state.client),
	makeAuthCodeExpiry: vi.fn(() => "2026-06-10T16:00:00.000Z"),
	makeDeviceCodeExpiry: vi.fn(() => "2026-06-10T16:00:00.000Z"),
	normalizeScopes: vi.fn((raw, fallback) => fallback ?? []),
	normalizeUserCode: vi.fn((value: string) => value.trim().toUpperCase()),
	parseTokenRequestBody: vi.fn((raw: string) => (raw ? JSON.parse(raw) : {})),
	revokeToken: vi.fn(async () => undefined),
	rotateRefreshToken: vi.fn(async () => ({ ok: false, reason: "invalid_grant" })),
	validateLocalAccessToken: vi.fn(async () => ({ valid: false })),
	verificationUriFor: vi.fn(() => "https://phaseo.app/activate"),
	verifyPkce: vi.fn(async () => true),
	ensureGrant: vi.fn(async () => undefined),
	ensureGrants: vi.fn(async () => undefined),
	verifyClientSecret: vi.fn(async () => true),
}));

describe("OAuth route security", () => {
	beforeEach(() => {
		state.deviceRow = null;
		state.authorizationRow = null;
		state.authorizationCodeRow = null;
		state.client = { id: "phaseo_cli", name: "Phaseo CLI", client_type: "public" };
		state.updateResult = null;
		state.updatePayloads.length = 0;
		state.updateFilters.length = 0;
		state.issuedTokenPairs.length = 0;
		state.issuedManagedKeys.length = 0;
		state.pollStatus = "ok";
		vi.resetModules();
	});

	it("does not let device-code denial overwrite a code that is no longer pending", async () => {
		state.deviceRow = {
			id: "device_1",
			client_id: "phaseo_cli",
			scopes: ["openid"],
			status: "approved",
			expires_at: FUTURE_EXPIRES_AT,
		};

		const { oauthRouter } = await import("./oauth");
		const response = await oauthRouter.request("https://example.com/device/activate", {
			method: "POST",
			headers: {
				authorization: "Bearer user-session",
				"content-type": "application/json",
			},
			body: JSON.stringify({ user_code: "ABCD-EFGH", action: "deny" }),
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toMatchObject({ error: "invalid_grant" });
		expect(state.updatePayloads).toEqual([]);
		expect(state.updateFilters).toEqual([]);
	});

	it("rejects oversized OAuth request bodies before parsing them", async () => {
		const { oauthRouter } = await import("./oauth");
		const response = await oauthRouter.request("https://example.com/token", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"content-length": "16385",
			},
			body: "{}",
		});

		expect(response.status).toBe(413);
		await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
	});

	it("reserves device authorization for the first-party CLI", async () => {
		state.client = { id: "third_party", name: "Third Party", client_type: "public" };

		const { oauthRouter } = await import("./oauth");
		const response = await oauthRouter.request("https://example.com/device/code", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ client_id: "third_party", scope: "openid" }),
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({
			error: "invalid_client",
			error_description: "Device authorization is only available to the Phaseo CLI",
		});
	});

	it("returns slow_down when the atomic device poll check rejects the cadence", async () => {
		state.deviceRow = {
			id: "device_1",
			client_id: "phaseo_cli",
			status: "pending",
			expires_at: FUTURE_EXPIRES_AT,
		};
		state.pollStatus = "slow_down";

		const { oauthRouter } = await import("./oauth");
		const response = await oauthRouter.request("https://example.com/token", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				client_id: "phaseo_cli",
				device_code: "device-code",
			}),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "slow_down" });
	});

	it("does not issue a device token when the approval grant is missing", async () => {
		state.deviceRow = {
			id: "device_1",
			client_id: "phaseo_cli",
			user_id: "user_1",
			workspace_id: "ws_1",
			scopes: ["openid"],
			status: "approved",
			expires_at: FUTURE_EXPIRES_AT,
			consumed_at: null,
		};

		const { oauthRouter } = await import("./oauth");
		const response = await oauthRouter.request("https://example.com/token", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code: "device-code",
				client_id: "phaseo_cli",
			}),
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toMatchObject({ error: "invalid_grant" });
		expect(state.issuedTokenPairs).toEqual([]);
		expect(state.updatePayloads).toEqual([]);
	});

	it("issues a device token when the approved code has an active grant", async () => {
		state.deviceRow = {
			id: "device_1",
			client_id: "phaseo_cli",
			user_id: "user_1",
			workspace_id: "ws_1",
			scopes: ["openid"],
			status: "approved",
			expires_at: FUTURE_EXPIRES_AT,
			consumed_at: null,
		};
		state.authorizationRow = { id: "auth_1", revoked_at: null };
		state.updateResult = { id: "device_1" };

		const { oauthRouter } = await import("./oauth");
		const response = await oauthRouter.request("https://example.com/token", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code: "device-code",
				client_id: "phaseo_cli",
			}),
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ access_token: "token" });
		expect(state.issuedTokenPairs).toEqual([
			{
				userId: "user_1",
				workspaceId: "ws_1",
				clientId: "phaseo_cli",
				scopes: ["openid"],
			},
		]);
	});

	it("does not exchange a legacy third-party device code for a refreshable session", async () => {
		state.client = { id: "third_party", name: "Third Party", client_type: "public" };
		state.deviceRow = {
			id: "device_third_party",
			client_id: "third_party",
			user_id: "user_1",
			workspace_id: "ws_1",
			scopes: ["openid"],
			status: "approved",
			expires_at: FUTURE_EXPIRES_AT,
			consumed_at: null,
		};
		state.authorizationRow = { id: "auth_1", revoked_at: null };

		const { oauthRouter } = await import("./oauth");
		const response = await oauthRouter.request("https://example.com/token", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code: "device-code",
				client_id: "third_party",
			}),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "invalid_grant",
			error_description: "Device authorization is only available to the Phaseo CLI",
		});
		expect(state.issuedTokenPairs).toEqual([]);
	});

	it("keeps browser-based CLI login on a refreshable token pair", async () => {
		state.authorizationCodeRow = {
			id: "authorization_code_1",
			client_id: "phaseo_cli",
			user_id: "user_1",
			workspace_id: "ws_1",
			redirect_uri: "http://127.0.0.1:8976/callback",
			scopes: ["openid"],
			code_challenge: "challenge",
			code_challenge_method: "S256",
			expires_at: FUTURE_EXPIRES_AT,
			used_at: null,
		};
		state.authorizationRow = { id: "auth_1", revoked_at: null };

		const { oauthRouter } = await import("./oauth");
		const response = await oauthRouter.request("https://example.com/token", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				grant_type: "authorization_code",
				client_id: "phaseo_cli",
				code: "authorization-code",
				redirect_uri: "http://127.0.0.1:8976/callback",
				code_verifier: "verifier",
			}),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ access_token: "token" });
		expect(state.issuedTokenPairs).toContainEqual({
			userId: "user_1",
			workspaceId: "ws_1",
			clientId: "phaseo_cli",
			scopes: ["openid"],
		});
		expect(state.issuedManagedKeys).toEqual([]);
	});

	it("issues a managed key only for a third-party PKCE client", async () => {
		state.client = { id: "third_party", name: "Third Party", client_type: "confidential" };
		state.authorizationCodeRow = {
			id: "authorization_code_2",
			client_id: "third_party",
			user_id: "user_1",
			workspace_id: "ws_1",
			redirect_uri: "https://example.com/callback",
			scopes: ["gateway:access", "models:read"],
			code_challenge: "challenge",
			code_challenge_method: "S256",
			expires_at: FUTURE_EXPIRES_AT,
			used_at: null,
		};
		state.authorizationRow = { id: "auth_1", revoked_at: null };

		const { oauthRouter } = await import("./oauth");
		const response = await oauthRouter.request("https://example.com/token", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				grant_type: "authorization_code",
				client_id: "third_party",
				code: "authorization-code",
				redirect_uri: "https://example.com/callback",
				code_verifier: "verifier",
			}),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ access_token: "phaseo_v1_sk_test" });
		expect(state.issuedTokenPairs).toEqual([]);
		expect(state.issuedManagedKeys).toContainEqual({
			userId: "user_1",
			workspaceId: "ws_1",
			clientId: "third_party",
			scopes: ["gateway:access", "models:read"],
		});
	});

	it("does not issue a delegated key from identity-only consent", async () => {
		state.client = { id: "third_party", name: "Third Party", client_type: "confidential" };
		state.authorizationCodeRow = {
			id: "authorization_code_identity_only",
			client_id: "third_party",
			user_id: "user_1",
			workspace_id: "ws_1",
			redirect_uri: "https://example.com/callback",
			scopes: ["openid"],
			code_challenge: "challenge",
			code_challenge_method: "S256",
			expires_at: FUTURE_EXPIRES_AT,
			used_at: null,
		};
		state.authorizationRow = { id: "auth_1", revoked_at: null };

		const { oauthRouter } = await import("./oauth");
		const response = await oauthRouter.request("https://example.com/token", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				grant_type: "authorization_code",
				client_id: "third_party",
				code: "authorization-code",
				redirect_uri: "https://example.com/callback",
				code_verifier: "verifier",
			}),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "invalid_scope",
			error_description: "gateway:access consent is required for a delegated key",
		});
		expect(state.issuedManagedKeys).toEqual([]);
	});
});
