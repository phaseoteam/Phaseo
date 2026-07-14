import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ManagementKeyRow = {
	id: string;
	workspace_id: string;
	status: string;
	hash: string;
	expires_at?: string | null;
	soft_blocked?: boolean | null;
	scopes?: unknown;
};

const runtime = vi.hoisted(() => {
	const backgroundTasks: Promise<unknown>[] = [];
	const dbRow = { value: null as ManagementKeyRow | null };
	const oauthAuthorizationRow = {
		value: null as { revoked_at: string | null } | null,
	};
	const updatePayloads: Array<Record<string, unknown>> = [];

	const maybeSingle = vi.fn(async () => ({
		data: dbRow.value,
		error: null,
	}));
	const oauthMaybeSingle = vi.fn(async () => ({
		data: oauthAuthorizationRow.value,
		error: null,
	}));
	const updateEq = vi.fn(async () => ({ error: null }));
	const oauthUpdateEq = vi.fn(() => ({
		eq: vi.fn(() => ({
			eq: vi.fn(async () => ({ error: null })),
		})),
	}));

	const supabase = {
		from: vi.fn((table: string) => {
			if (table === "oauth_authorizations") {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								eq: () => ({
									maybeSingle: oauthMaybeSingle,
								}),
							}),
						}),
					}),
					update: (payload: Record<string, unknown>) => {
						updatePayloads.push(payload);
						return {
							eq: oauthUpdateEq,
						};
					},
				};
			}
			if (table === "management_keys") {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle,
						}),
					}),
					update: (payload: Record<string, unknown>) => {
						updatePayloads.push(payload);
						return {
							eq: updateEq,
						};
					},
				};
			}
			throw new Error(`Unexpected table: ${table}`);
		}),
	};

	return {
		backgroundTasks,
		dbRow,
		maybeSingle,
		oauthAuthorizationRow,
		oauthMaybeSingle,
		updateEq,
		supabase,
		updatePayloads,
		bindings: {
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			KEY_PEPPER_ACTIVE: "pepper_test_value",
			KEY_PEPPER_PREVIOUS: undefined as string | undefined,
		},
	};
});

vi.mock("@/runtime/env", () => ({
	getBindings: () => runtime.bindings,
	getCache: () => ({}) as KVNamespace,
	getSupabaseAdmin: () => runtime.supabase,
	dispatchBackground: (promise: Promise<unknown>) => {
		runtime.backgroundTasks.push(promise.catch(() => undefined));
	},
	configureRuntime: () => undefined,
	clearRuntime: () => undefined,
}));

vi.mock("@/lib/oauth/service", () => ({
	hasActiveOAuthWorkspaceAccess: vi.fn(async () => true),
	validateLocalAccessToken: vi.fn(async () => ({
		valid: true,
		claims: {
			user_id: "u1",
			workspace_id: "w1",
			client_id: "c1",
			scope: "keys:read keys:write",
		},
	})),
}));

function buildRequest(token: string): Request {
	return new Request("https://example.com/v1/credits", {
		headers: {
			authorization: `Bearer ${token}`,
		},
	});
}

function hashSecret(secret: string): string {
	const pepper = runtime.bindings.KEY_PEPPER_ACTIVE;
	return createHmac("sha256", pepper).update(secret).digest("hex");
}

async function flushBackground(): Promise<void> {
	while (runtime.backgroundTasks.length) {
		const batch = runtime.backgroundTasks.splice(0);
		await Promise.allSettled(batch);
	}
}

describe("authenticateManagement", () => {
	beforeEach(() => {
		runtime.backgroundTasks.length = 0;
		runtime.dbRow.value = null;
		runtime.oauthAuthorizationRow.value = null;
		runtime.updatePayloads.length = 0;
		runtime.bindings.KEY_PEPPER_ACTIVE = "pepper_test_value";
		runtime.bindings.KEY_PEPPER_PREVIOUS = undefined;
		runtime.supabase.from.mockClear();
		runtime.maybeSingle.mockClear();
		runtime.oauthMaybeSingle.mockClear();
		runtime.updateEq.mockClear();
		vi.resetModules();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("accepts active typed management keys", async () => {
		const kid = "MGMTKEY12345";
		const secret = "secret_management_key";
		runtime.dbRow.value = {
			id: "mgmt_1",
			workspace_id: "team_1",
			status: "active",
			hash: hashSecret(secret),
			scopes: "[\"workspaces:read\"]",
		};

		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(
			buildRequest(`phaseo_v1_mk_${kid}_${secret}`),
		);
		await flushBackground();

		expect(result).toMatchObject({
			ok: true,
			workspaceId: "team_1",
			apiKeyId: "mgmt_1",
			apiKeyKid: kid,
			scopes: ["workspaces:read"],
		});
		expect(runtime.updatePayloads).toContainEqual(
			expect.objectContaining({
				last_used_at: expect.any(String),
			}),
		);
	});

	it("accepts typed management keys and rejects them for gateway authentication", async () => {
		const kid = "MGMTTYPED123";
		const secret = "secret_typed_management_key";
		runtime.dbRow.value = {
			id: "mgmt_typed",
			workspace_id: "team_typed",
			status: "active",
			hash: hashSecret(secret),
			scopes: "[\"credits:read\",\"activity:read\"]",
		};

		const { authenticate, authenticateManagement } = await import("./auth");
		const managementResult = await authenticateManagement(
			buildRequest(`phaseo_v1_mk_${kid}_${secret}`),
		);
		expect(managementResult).toMatchObject({
			ok: true,
			apiKeyId: "mgmt_typed",
			scopes: ["credits:read", "activity:read"],
		});
		await flushBackground();

		runtime.supabase.from.mockClear();
		const gatewayResult = await authenticate(buildRequest(`phaseo_v1_mk_${kid}_${secret}`));
		expect(gatewayResult).toEqual({
			ok: false,
			reason: "management_key_not_valid_for_gateway",
		});
		expect(runtime.supabase.from).not.toHaveBeenCalled();
	});

	it("rejects inference and legacy management key formats before querying the database", async () => {
		const kid = "MGMTLEGACY1";
		const secret = "secret_legacy_management_key";
		const { authenticateManagement } = await import("./auth");

		for (const token of [
			`phaseo_v1_sk_${kid}_${secret}`,
			`aistats_v1_sk_${kid}_${secret}`,
			`aistats_v1_mk_${kid}_${secret}`,
		]) {
			const result = await authenticateManagement(buildRequest(token));
			expect(result).toEqual({ ok: false, reason: "management_key_required" });
		}

		expect(runtime.supabase.from).not.toHaveBeenCalled();
	});

	it("rejects soft-blocked management keys", async () => {
		const kid = "MGMTSOFT1234";
		const secret = "secret_soft_blocked";
		runtime.dbRow.value = {
			id: "mgmt_2",
			workspace_id: "team_2",
			status: "active",
			hash: hashSecret(secret),
			soft_blocked: true,
		};

		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(
			buildRequest(`phaseo_v1_mk_${kid}_${secret}`),
		);

		expect(result).toEqual({ ok: false, reason: "key_soft_blocked" });
	});

	it("rejects management keys with no scopes", async () => {
		const kid = "MGMTNOSCOPE1";
		const secret = "secret_without_scopes";
		runtime.dbRow.value = {
			id: "mgmt_legacy",
			workspace_id: "team_legacy",
			status: "active",
			hash: hashSecret(secret),
			scopes: "[]",
		};

		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(
			buildRequest(`phaseo_v1_mk_${kid}_${secret}`),
		);

		expect(result).toEqual({ ok: false, reason: "management_key_scopes_required" });
	});

	it("rejects expired management keys", async () => {
		const kid = "MGMTEXP12345";
		const secret = "secret_expired_key";
		runtime.dbRow.value = {
			id: "mgmt_3",
			workspace_id: "team_3",
			status: "active",
			hash: hashSecret(secret),
			expires_at: new Date(Date.now() - 60_000).toISOString(),
		};

		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(
			buildRequest(`phaseo_v1_mk_${kid}_${secret}`),
		);

		expect(result).toEqual({ ok: false, reason: "key_expired" });
	});

	it("accepts active OAuth bearer tokens for management auth", async () => {
		const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoidTEiLCJ3b3Jrc3BhY2VfaWQiOiJ3MSIsImNsaWVudF9pZCI6ImMxIn0.sig";
		runtime.oauthAuthorizationRow.value = { revoked_at: null };
		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(buildRequest(jwt));
		await flushBackground();

		expect(result).toMatchObject({
			ok: true,
			workspaceId: "w1",
			apiKeyId: "c1",
			authMethod: "oauth",
			oauthClientId: "c1",
			oauthScopes: ["keys:read", "keys:write"],
		});
		expect(runtime.updatePayloads).toContainEqual(
			expect.objectContaining({
				last_used_at: expect.any(String),
			}),
		);
	});

	it("rejects non-gateway JWT bearer tokens for management auth", async () => {
		const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.sig";
		const { authenticateManagement } = await import("./auth");
		const result = await authenticateManagement(buildRequest(jwt));

		expect(result).toEqual({ ok: false, reason: "management_key_required" });
	});
});
