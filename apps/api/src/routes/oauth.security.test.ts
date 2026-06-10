import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	deviceRow: null as Record<string, unknown> | null,
	updateResult: null as Record<string, unknown> | null,
	updatePayloads: [] as Array<Record<string, unknown>>,
	updateFilters: [] as Array<Array<{ column: string; value: unknown }>>,
}));

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
			if (table !== "oauth_device_codes") throw new Error(`Unexpected table: ${table}`);
			return {
				select: () => ({
					eq: () => ({
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
	issueTokenPair: vi.fn(async () => ({ access_token: "token" })),
	loadOAuthClient: vi.fn(async () => ({ id: "aistats_cli", name: "AI Stats CLI", client_type: "public" })),
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
		state.updateResult = null;
		state.updatePayloads.length = 0;
		state.updateFilters.length = 0;
		vi.resetModules();
	});

	it("does not let device-code denial overwrite a code that is no longer pending", async () => {
		state.deviceRow = {
			id: "device_1",
			client_id: "aistats_cli",
			scopes: ["openid"],
			status: "approved",
			expires_at: new Date(Date.now() + 60_000).toISOString(),
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
		expect(state.updatePayloads[0]).toMatchObject({ status: "denied", user_id: "user_1" });
		expect(state.updateFilters[0]).toEqual([
			{ column: "id", value: "device_1" },
			{ column: "status", value: "pending" },
		]);
	});
});
