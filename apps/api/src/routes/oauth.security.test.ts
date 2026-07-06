import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	deviceRow: null as Record<string, unknown> | null,
	authorizationRow: null as Record<string, unknown> | null,
	updateResult: null as Record<string, unknown> | null,
	updatePayloads: [] as Array<Record<string, unknown>>,
	updateFilters: [] as Array<Array<{ column: string; value: unknown }>>,
	issuedTokenPairs: [] as Array<Record<string, unknown>>,
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
	getSupabaseAdmin: () => ({
		from(table: string) {
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
	CLI_CLIENT_ID: "aistats_cli",
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
	issueTokenPair: vi.fn(async (input: Record<string, unknown>) => {
		state.issuedTokenPairs.push(input);
		return { access_token: "token" };
	}),
	loadOAuthClient: vi.fn(async () => ({ id: "aistats_cli", name: "Phaseo CLI", client_type: "public" })),
	makeAuthCodeExpiry: vi.fn(() => "2026-06-10T16:00:00.000Z"),
	makeDeviceCodeExpiry: vi.fn(() => "2026-06-10T16:00:00.000Z"),
	normalizeScopes: vi.fn((raw, fallback) => fallback ?? []),
	normalizeUserCode: vi.fn((value: string) => value.trim().toUpperCase()),
	parseTokenRequestBody: vi.fn((raw: string) => (raw ? JSON.parse(raw) : {})),
	revokeToken: vi.fn(async () => undefined),
	rotateRefreshToken: vi.fn(async () => ({ ok: false, reason: "invalid_grant" })),
	validateLocalAccessToken: vi.fn(async () => ({ valid: false })),
	verificationUriFor: vi.fn(() => "https://ai-stats.com/activate"),
	verifyPkce: vi.fn(async () => true),
	ensureGrant: vi.fn(async () => undefined),
	ensureGrants: vi.fn(async () => undefined),
	verifyClientSecret: vi.fn(async () => true),
}));

describe("OAuth route security", () => {
	beforeEach(() => {
		state.deviceRow = null;
		state.authorizationRow = null;
		state.updateResult = null;
		state.updatePayloads.length = 0;
		state.updateFilters.length = 0;
		state.issuedTokenPairs.length = 0;
		vi.resetModules();
	});

	it("does not let device-code denial overwrite a code that is no longer pending", async () => {
		state.deviceRow = {
			id: "device_1",
			client_id: "aistats_cli",
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

	it("does not issue a device token when the approval grant is missing", async () => {
		state.deviceRow = {
			id: "device_1",
			client_id: "aistats_cli",
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
				client_id: "aistats_cli",
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
			client_id: "aistats_cli",
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
				client_id: "aistats_cli",
			}),
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ access_token: "token" });
		expect(state.issuedTokenPairs).toEqual([
			{
				userId: "user_1",
				workspaceId: "ws_1",
				clientId: "aistats_cli",
				scopes: ["openid"],
			},
		]);
	});
});
