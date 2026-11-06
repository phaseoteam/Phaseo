import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_NATIVE_CLIENT_REFUSAL } from "./route-helpers";

vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: vi.fn(async () => true) }));

type GuardOk = {
	ok: true;
	value: {
		workspaceId: string;
		apiKeyId: string;
		internal?: boolean;
	};
};

type KeyRow = Record<string, unknown> | null;

const state = vi.hoisted(() => ({
	guardAuthResult: null as GuardOk | { ok: false; response: Response } | null,
	guardManagementAuthResult: null as GuardOk | { ok: false; response: Response } | null,
	keyRows: [] as KeyRow[],
	keyUsageRows: [] as Array<Record<string, unknown>>,
	workspaceRows: [] as Array<Record<string, unknown> | null>,
	updatePayloads: [] as Array<Record<string, unknown>>,
	insertPayloads: [] as Array<Record<string, unknown>>,
	membershipRows: [] as Array<Record<string, unknown> | null>,
	membershipLookups: [] as Array<Array<{ column: string; value: unknown }>>,
	keyWorkspaceFilters: [] as unknown[],
	departmentRows: [] as Array<Record<string, unknown> | null>,
	departmentLookups: [] as Array<Array<{ column: string; value: unknown }>>,
	updateFilters: [] as Array<Array<{ column: string; value: unknown }>>,
	deleteFilters: [] as Array<{ table: string; column: string; value: unknown }>,
	nameFilters: [] as unknown[][],
	enforceWorkspaceKeyLimit: vi.fn(async (_workspaceId: string, _keyType: string, _excludeKeyId?: string) => undefined),
	isUsableWorkspaceKey: vi.fn((key: Record<string, unknown>) => {
		if (key.status !== "active" || key.soft_blocked !== false) return false;
		if (key.expires_at === null || key.expires_at === undefined) return true;
		return new Date(String(key.expires_at)).getTime() > Date.now();
	}),
	setKeyVersion: vi.fn(async () => undefined),
	copyRateLimit: vi.fn(async (_args: Record<string, unknown>) => false),
	publishRateLimitPlan: vi.fn(async (_workspaceId: string) => true),
	deletedKeyIds: [] as unknown[],
    cacheDelete: vi.fn(async (_key: string) => undefined),
    invalidated: vi.fn(async (..._args: unknown[]) => undefined),
	bindings: { PHASEO_CONTROL_SECRET: "secret", KEY_PEPPER_ACTIVE: "pepper" } as Record<string, unknown>,
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

function buildKeysSupabaseMock() {
	return {
		rpc: async () => ({ data: state.keyUsageRows, error: null }),
		from(table: string) {
			if (table !== "keys" && table !== "workspaces" && table !== "workspace_members" && table !== "workspace_departments" && table !== "key_guardrails" && table !== "broadcast_destination_keys") {
				throw new Error(`Unexpected table: ${table}`);
			}

			if (table === "key_guardrails" || table === "broadcast_destination_keys") {
				return {
					delete: () => ({
						eq: async (column: string, value: unknown) => {
							state.deleteFilters.push({ table, column, value });
							return { error: null };
						},
					}),
				};
			}

			if (table === "workspaces") {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({
								data: state.workspaceRows.shift() ?? null,
								error: null,
							}),
						}),
					}),
				};
			}

			if (table === "workspace_departments") {
				const filters: Array<{ column: string; value: unknown }> = [];
				state.departmentLookups.push(filters);
				const lookup: any = {
					select: () => lookup,
					eq: (column: string, value: unknown) => { filters.push({ column, value }); return lookup; },
					maybeSingle: async () => ({ data: state.departmentRows.shift() ?? null, error: null }),
				};
				return lookup;
			}

			if (table === "workspace_members") {
				const filters: Array<{ column: string; value: unknown }> = [];
				state.membershipLookups.push(filters);
				const lookup: any = {
					select: () => lookup,
					eq: (column: string, value: unknown) => { filters.push({ column, value }); return lookup; },
					maybeSingle: async () => ({ data: state.membershipRows.shift() ?? null, error: null }),
				};
				return lookup;
			}

			let updatePayload: Record<string, unknown> | null = null;
			const query: any = {
				delete: () => ({ eq: async (_column: string, value: unknown) => { state.deletedKeyIds.push(value); return { error: null }; } }),
				select: () => query,
				eq: (column: string, value: unknown) => {
					if (column === "workspace_id") state.keyWorkspaceFilters.push(value);
					return query;
				},
				neq: () => query,
				not: (...args: unknown[]) => { state.nameFilters.push(args); return query; },
				or: () => query,
				order: () => query,
				range: () => query,
				maybeSingle: async () => ({
					data: state.keyRows.shift() ?? null,
					error: null,
				}),
				update: (payload: Record<string, unknown>) => {
					updatePayload = payload;
					state.updatePayloads.push(payload);
					const filters: Array<{ column: string; value: unknown }> = [];
					state.updateFilters.push(filters);
					const updater: any = {
						eq: (column: string, value: unknown) => {
							filters.push({ column, value });
							return filters.length >= 2 ? Promise.resolve({ error: null }) : updater;
						},
					};
					return updater;
				},
				insert: (payload: Record<string, unknown>) => {
					state.insertPayloads.push(payload);
					return {
						select: () => ({
							maybeSingle: async () => ({
								data: state.keyRows.shift() ?? null,
								error: null,
							}),
						}),
					};
				},
			};
			return query;
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => buildKeysSupabaseMock(),
	getCache: () => ({ delete: state.cacheDelete }),
	getBindings: () => state.bindings,
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardAuth: vi.fn(async () => state.guardAuthResult),
	guardManagementAuth: vi.fn(async () => state.guardManagementAuthResult),
}));

vi.mock("@/routes/utils", () => ({
	json,
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

vi.mock("@/pipeline/before/privateModelCache", () => ({ invalidatePrivateRoutes: (...args: unknown[]) => state.invalidated(...args) }));
vi.mock("@/core/kv", () => ({
	setKeyVersion: state.setKeyVersion,
}));

vi.mock("@/routes/auth.helpers", () => ({
	generateGatewayKey: vi.fn(() => ({
		kid: "kid_123",
		secret: "secret_123",
		plaintext: "phaseo_v1_sk_kid_123_secret_123",
		prefix: "phaseo_v1_sk_kid_123",
	})),
	hmacSecret: vi.fn(async () => "hashed_secret"),
	timingSafeEqual: vi.fn((a: string, b: string) => a === b),
}));

vi.mock("@/lib/security/keyPepper", () => ({
	resolveActiveKeyPepper: vi.fn(() => "pepper"),
}));

vi.mock("@/lib/audit/workspaceAudit", () => ({
	recordWorkspaceAuditEvent: vi.fn(async () => true),
}));

vi.mock("@core/rate-limit-policies", () => ({
	copyKeyRateLimitAssignment: state.copyRateLimit,
	publishRateLimitPlan: state.publishRateLimitPlan,
}));

vi.mock("./management-helpers", async (importOriginal) => ({
	...(await importOriginal<typeof import("./management-helpers")>()),
	enforceWorkspaceKeyLimit: state.enforceWorkspaceKeyLimit,
	isUsableWorkspaceKey: state.isUsableWorkspaceKey,
}));

describe("management key routes", () => {
	beforeEach(() => {
		state.guardAuthResult = {
			ok: true,
			value: { workspaceId: "ws_1", apiKeyId: "key_1" },
		};
		state.guardManagementAuthResult = {
			ok: true,
			value: { workspaceId: "ws_1", apiKeyId: "mgmt_1", internal: false },
		};
		state.keyRows.length = 0;
        state.cacheDelete.mockClear();
		state.keyUsageRows.length = 0;
		state.workspaceRows.length = 0;
		state.membershipRows.length = 0;
		state.membershipLookups.length = 0;
		state.keyWorkspaceFilters.length = 0;
		state.departmentRows.length = 0;
		state.departmentLookups.length = 0;
		state.updatePayloads.length = 0;
		state.updateFilters.length = 0;
		state.deleteFilters.length = 0;
		state.nameFilters.length = 0;
		state.setKeyVersion.mockClear();
		state.copyRateLimit.mockReset().mockResolvedValue(false);
		state.publishRateLimitPlan.mockClear();
		state.deletedKeyIds.length = 0;
		state.bindings = { PHASEO_CONTROL_SECRET: "secret", KEY_PEPPER_ACTIVE: "pepper" };
		state.insertPayloads.length = 0;
		state.enforceWorkspaceKeyLimit.mockReset();
		state.enforceWorkspaceKeyLimit.mockResolvedValue(undefined);
		vi.resetModules();
	});

	it("returns current key metadata, without the hash, with the computed limit window", async () => {
		state.keyRows.push({
			id: "key_1",
			hash: "hash_1",
			workspace_id: "ws_1",
			name: "Primary Key",
			prefix: "phaseo_v1_sk_abc",
			status: "active",
			scopes: "[\"chat.completions\"]",
			created_by: "user_1",
			created_at: "2026-04-28T10:00:00Z",
			updated_at: "2026-04-28T10:30:00Z",
			last_used_at: "2026-04-28T11:00:00Z",
			soft_blocked: false,
			expires_at: null,
			daily_limit_cost_nanos: 0,
			weekly_limit_cost_nanos: 0,
			monthly_limit_cost_nanos: 25_000_000_000,
		});
		state.keyUsageRows.push({
			key_id: "key_1",
			total_request_count: 120,
			daily_request_count: 4,
			weekly_request_count: 30,
			monthly_request_count: 90,
			total_cost_nanos: 12_000_000_000,
			daily_cost_nanos: 500_000_000,
			weekly_cost_nanos: 3_000_000_000,
			monthly_cost_nanos: 8_000_000_000,
		});

		const { currentKeyRoutes } = await import("./keys");
		const response = await currentKeyRoutes.request("https://example.com/");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({
			id: "key_1",
			label: "Primary Key",
			limit: 25,
			limit_reset: "monthly",
			include_byok_in_limit: false,
			usage: 12,
			usage_monthly: 8,
			limit_remaining: 17,
			usage_details: { monthly: { requests: 90, cost: 8 } },
		});
		expect(body.data).not.toHaveProperty("hash");
		expect(body.data).not.toHaveProperty("kid");
	});

	it("creates a key and applies compatibility limit fields", async () => {
		state.workspaceRows.push({ owner_user_id: "user_1" });
		state.keyRows.push({
			id: "key_new",
			hash: "hash_new",
			workspace_id: "ws_1",
			name: "Analytics Key",
			prefix: "phaseo_v1_sk_kid_123",
			status: "active",
			scopes: "[\"responses\"]",
			created_by: "user_1",
			created_at: "2026-04-28T12:00:00Z",
			updated_at: "2026-04-28T12:00:00Z",
			last_used_at: null,
			soft_blocked: false,
			expires_at: "2027-12-31T23:59:59Z",
			daily_limit_cost_nanos: 0,
			weekly_limit_cost_nanos: 5_000_000_000,
			monthly_limit_cost_nanos: 0,
		});

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: "Analytics Key",
				limit: 5,
				limit_reset: "weekly",
				limits: { daily: { requests: 100 } },
				expires_at: "2027-12-31T23:59:59Z",
			}),
		});
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(state.enforceWorkspaceKeyLimit).toHaveBeenCalledWith("ws_1", "api");
		expect(state.insertPayloads[0]).toMatchObject({
			workspace_id: "ws_1",
			name: "Analytics Key",
			scopes: "[]",
			weekly_limit_cost_nanos: 5_000_000_000,
			daily_limit_cost_nanos: 0,
			monthly_limit_cost_nanos: 0,
			daily_limit_requests: 100,
		});
		expect(body.data).toMatchObject({
			limit: 5,
			limit_reset: "weekly",
			key: "phaseo_v1_sk_kid_123_secret_123",
		});
		expect(body.data).not.toHaveProperty("hash");
		expect(body.data).not.toHaveProperty("kid");
	});

	it("credits a key minted with a management key to that key's creator, falling back to the owner", async () => {
		const keyRow = { id: "key_new", hash: "hash_new", workspace_id: "ws_1", name: "Minted", prefix: "p", status: "active", scopes: "[]", created_by: "user_admin", created_at: "2026-04-28T12:00:00Z" };
		const create = async () => {
			const { keysRoutes } = await import("./keys");
			return keysRoutes.request("https://example.com/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Minted" }) });
		};
		state.workspaceRows.push({ owner_user_id: "user_1" });
		state.keyRows.push(keyRow);
		// Removing user_admin from the workspace revokes the keys they created, including these.
		state.guardManagementAuthResult = { ok: true, value: { workspaceId: "ws_1", apiKeyId: "mgmt_1", internal: false, userId: "user_admin" } };
		expect((await create()).status).toBe(201);
		expect(state.insertPayloads[0]).toMatchObject({ created_by: "user_admin" });

		state.guardManagementAuthResult = { ok: true, value: { workspaceId: "ws_1", apiKeyId: "mgmt_1", internal: false, userId: null } };
		state.workspaceRows.push({ owner_user_id: "user_1" });
		state.keyRows.push({ ...keyRow, created_by: "user_1" });
		expect((await create()).status).toBe(201);
		expect(state.insertPayloads[1]).toMatchObject({ created_by: "user_1" });
	});

	it("returns the new secret at the top level as well as in data.key, and keeps it out of the audit event", async () => {
		state.workspaceRows.push({ owner_user_id: "user_1" });
		state.keyRows.push({
			id: "key_new", hash: "hash_new", workspace_id: "ws_1", name: "Top Level Key", prefix: "phaseo_v1_sk_kid_123",
			status: "active", scopes: "[]", created_by: "user_1", created_at: "2026-04-28T12:00:00Z",
			updated_at: "2026-04-28T12:00:00Z", last_used_at: null, soft_blocked: false, expires_at: null,
			daily_limit_cost_nanos: 0, weekly_limit_cost_nanos: 0, monthly_limit_cost_nanos: 0,
		});
		const { recordWorkspaceAuditEvent } = await import("@/lib/audit/workspaceAudit");
		const audit = vi.mocked(recordWorkspaceAuditEvent);
		audit.mockClear();

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Top Level Key" }),
		});
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body.key).toBe("phaseo_v1_sk_kid_123_secret_123");
		expect(body.data.key).toBe(body.key);
		expect(audit).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(audit.mock.calls)).not.toContain("secret_123");
	});

	it("blocks OAuth workspace members from creating API keys", async () => {
		state.guardManagementAuthResult = {
			ok: true,
			value: {
				workspaceId: "ws_1",
				apiKeyId: "oauth_1",
				internal: false,
				authMethod: "oauth",
				oauthClientId: null,
				apiKeyRef: "dashboard",
				userId: "user_member",
				scopes: ["keys:write"],
			} as any,
		};
		state.membershipRows.push({ role: "member" });

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Member Key" }),
		});
		const body = await response.json();

		expect(response.status).toBe(403);
		expect(body).toMatchObject({
			error: "forbidden",
			message: "Workspace owner or admin role is required",
		});
		expect(state.insertPayloads).toEqual([]);
	});

	it("blocks OAuth workspace members from reading individual API keys", async () => {
		state.guardManagementAuthResult = {
			ok: true,
			value: {
				workspaceId: "ws_1",
				apiKeyId: "oauth_1",
				internal: false,
				authMethod: "oauth",
				userId: "user_member",
				scopes: ["keys:read"],
			} as any,
		};
		state.membershipRows.push({ role: "member" });

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/hash_1");
		const body = await response.json();

		expect(response.status).toBe(403);
		expect(body).toMatchObject({
			error: "forbidden",
			message: "Workspace owner or admin role is required",
		});
		expect(state.keyRows).toEqual([]);
	});

	it("allows OAuth workspace admins to read individual API keys", async () => {
		state.guardManagementAuthResult = {
			ok: true,
			value: {
				workspaceId: "ws_1",
				apiKeyId: "oauth_1",
				internal: false,
				authMethod: "oauth",
				userId: "user_admin",
				scopes: ["keys:read"],
			} as any,
		};
		state.membershipRows.push({ role: "admin" });
		state.keyRows.push({
			id: "key_1",
			hash: "hash_1",
			workspace_id: "ws_1",
			name: "Primary Key",
			prefix: "phaseo_v1_sk_abc",
			status: "active",
		});

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/hash_1");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({
			id: "key_1",
			name: "Primary Key",
		});
		expect(body.data).not.toHaveProperty("hash");
		expect(body.data).not.toHaveProperty("kid");
	});

	describe("apps that use Sign in with Phaseo", () => {
		const oauthAuth = (oauthClientId: string) => ({
			ok: true,
			value: {
				workspaceId: "ws_1", apiKeyId: "key_app", internal: false, authMethod: "oauth",
				oauthClientId, userId: "user_admin", scopes: ["keys:write"], oauthScopes: ["keys:write"],
			} as any,
		} as GuardOk);
		const appKey = {
			id: "key_app", hash: "hash_app", workspace_id: "ws_1", kid: "kid_app", name: "OAuth: partner_app", prefix: "phaseo_v1_sk_app",
			status: "active", scopes: "[]", soft_blocked: false, expires_at: null, monthly_limit_cost_nanos: 20_000_000_000,
			key_kind: "oauth_delegated", oauth_client_id: "partner_app",
		};
		const personKey = { ...appKey, id: "key_person", hash: "hash_person", name: "Production", key_kind: "standard", oauth_client_id: null };
		const request = async (url: string, method: string, body?: Record<string, unknown>) => {
			const { keysRoutes } = await import("./keys");
			return keysRoutes.request(url, {
				method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
			});
		};

		it("can't create a key, even with keys:write", async () => {
			state.guardManagementAuthResult = oauthAuth("partner_app");
			state.membershipRows.push({ role: "owner" });

			const response = await request("https://example.com/", "POST", { name: "Unlimited" });

			expect(response.status).toBe(403);
			expect(await response.json()).toMatchObject({ error: "forbidden", message: expect.stringContaining("can't create API keys") });
			expect(state.insertPayloads).toEqual([]);
		});

		it("can't rotate its own key or any other key into a fresh one", async () => {
			for (const key of [appKey, personKey]) {
				state.guardManagementAuthResult = oauthAuth("partner_app");
				state.membershipRows.push({ role: "owner" });
				state.keyRows.push({ ...key });

				const response = await request(`https://example.com/${key.hash}/rotate`, "POST");

				expect(response.status, key.id).toBe(403);
				expect(await response.json()).toMatchObject({ error: "forbidden", message: expect.stringContaining("can't rotate or replace API keys") });
			}
			expect(state.insertPayloads).toEqual([]);
			expect(state.updatePayloads).toEqual([]);
		});

		it("can only rename a key: no limits, status or expiry, on its own key or another's", async () => {
			for (const key of [appKey, personKey]) {
				for (const body of [
					{ limit: null }, { limit: 500, limit_reset: "monthly" }, { limits: { monthly: { cost: 1000 } } }, { soft_blocked: false },
					{ disabled: false }, { disabled: true }, { expires_at: "2099-01-01T00:00:00.000Z" }, { name: "Renamed", expires_at: null },
				]) {
					state.guardManagementAuthResult = oauthAuth("partner_app");
					state.membershipRows.push({ role: "admin" });
					state.keyRows.push({ ...key });

					const response = await request(`https://example.com/${key.hash}`, "PATCH", body);

					expect(response.status, `${key.id} ${JSON.stringify(body)}`).toBe(403);
					expect(await response.json()).toMatchObject({ error: "forbidden", message: expect.stringContaining("can only rename API keys") });
				}
			}
			expect(state.updatePayloads).toEqual([]);

			// Renaming follows the usual keys:write rules.
			state.guardManagementAuthResult = oauthAuth("partner_app");
			state.membershipRows.push({ role: "admin" });
			state.keyRows.push({ ...appKey }, { ...appKey, name: "Renamed" });
			expect((await request("https://example.com/hash_app", "PATCH", { name: "Renamed" })).status).toBe(200);
			expect(state.updatePayloads).toEqual([{ name: "Renamed" }]);
		});

		it("refuses CLI and desktop sign-ins too, because their client IDs are public", async () => {
			for (const clientId of ["phaseo_cli", "aistats_cli", "phaseo_desktop"]) {
				state.guardManagementAuthResult = oauthAuth(clientId);
				state.membershipRows.push({ role: "owner" });
				const created = await request("https://example.com/", "POST", { name: "From the CLI" });
				expect(created.status, clientId).toBe(403);
				expect(await created.json(), clientId).toMatchObject({ error: "forbidden", message: PUBLIC_NATIVE_CLIENT_REFUSAL });

				state.guardManagementAuthResult = oauthAuth(clientId);
				state.membershipRows.push({ role: "owner" });
				state.keyRows.push({ ...personKey });
				const changed = await request("https://example.com/hash_person", "PATCH", { limit: null });
				expect(changed.status, clientId).toBe(403);
				expect(await changed.json(), clientId).toMatchObject({ message: PUBLIC_NATIVE_CLIENT_REFUSAL });
			}
			expect(state.insertPayloads).toEqual([]);
			expect(state.updatePayloads).toEqual([]);
		});

		it("leaves the person's dashboard session able to create keys and change limits", async () => {
			const dashboard = { ok: true, value: { ...oauthAuth("").value, oauthClientId: null, apiKeyRef: "dashboard" } } as GuardOk;
			state.guardManagementAuthResult = dashboard;
			state.membershipRows.push({ role: "owner" });
			state.keyRows.push({ ...personKey, id: "key_new", hash: "hash_new", name: "From the dashboard" });
			expect((await request("https://example.com/", "POST", { name: "From the dashboard" })).status).toBe(201);
			expect(state.insertPayloads).toHaveLength(1);

			state.guardManagementAuthResult = dashboard;
			state.membershipRows.push({ role: "admin" });
			state.keyRows.push({ ...personKey }, { ...personKey, monthly_limit_cost_nanos: 0 });
			expect((await request("https://example.com/hash_person", "PATCH", { limit: null })).status).toBe(200);
			expect(state.updatePayloads).toEqual([{ daily_limit_cost_nanos: 0, weekly_limit_cost_nanos: 0, monthly_limit_cost_nanos: 0 }]);
		});

		it("leaves API keys and other management tokens as they were", async () => {
			state.keyRows.push({ ...personKey }, { ...personKey, monthly_limit_cost_nanos: 0 });
			expect((await request("https://example.com/hash_person", "PATCH", { limit: null })).status).toBe(200);
		});
	});

	describe("another workspace of the signed-in person", () => {
		const cliAuth = (overrides: Record<string, unknown> = {}) => ({
			ok: true,
			value: {
				workspaceId: "ws_1", apiKeyId: "phaseo_cli", internal: false, authMethod: "oauth", oauthClientId: "phaseo_cli", userId: "user_1",
				scopes: ["keys:read", "keys:write", "keys:delete"], oauthScopes: ["keys:read", "keys:write", "keys:delete"], ...overrides,
			} as any,
		} as GuardOk);
		const key = {
			id: "key_2", hash: "hash_2", workspace_id: "ws_2", kid: "kid_2", name: "Cache test", prefix: "phaseo_v1_sk_kid_2",
			status: "active", scopes: "[]", soft_blocked: false, expires_at: null, key_kind: "standard",
		};
		type Call = { name: string; url: string; method: string; body?: Record<string, unknown>; status: number };
		const calls: Call[] = [
			{ name: "list", url: "https://example.com/?workspace_id=ws_2", method: "GET", status: 200 },
			{ name: "create", url: "https://example.com/", method: "POST", body: { name: "Cache test", workspace_id: "ws_2" }, status: 201 },
			{ name: "get", url: "https://example.com/hash_2?workspace_id=ws_2", method: "GET", status: 200 },
			{ name: "update", url: "https://example.com/hash_2?workspace_id=ws_2", method: "PATCH", body: { name: "Renamed" }, status: 200 },
			{ name: "delete", url: "https://example.com/hash_2?workspace_id=ws_2", method: "DELETE", status: 200 },
			{ name: "rotate", url: "https://example.com/hash_2/rotate?workspace_id=ws_2", method: "POST", status: 200 },
		];
		const send = async (call: Call) => {
			const { keysRoutes } = await import("./keys");
			return keysRoutes.request(call.url, {
				method: call.method, headers: { "content-type": "application/json" }, ...(call.body ? { body: JSON.stringify(call.body) } : {}),
			});
		};
		// Listing, reading, renaming and deleting don't raise what a key can spend, so the CLI may do them in another
		// workspace too. Creating, rotating and changing a key's limits are made in the dashboard or with a management key.
		const reads = calls.filter((call) => ["list", "get", "update", "delete"].includes(call.name));
		const writes: Call[] = [
			...calls.filter((call) => !reads.includes(call)),
			{ name: "limit", url: "https://example.com/hash_2?workspace_id=ws_2", method: "PATCH", body: { limit: 5 }, status: 403 },
		];
		const expectNothingTouched = () => {
			expect(state.keyWorkspaceFilters).toEqual([]);
			expect(state.insertPayloads).toEqual([]);
			expect(state.updatePayloads).toEqual([]);
		};

		it("lets Phaseo's CLI list, read, rename and delete keys where the person is an owner or admin", async () => {
			const { recordWorkspaceAuditEvent } = await import("@/lib/audit/workspaceAudit");
			const audit = vi.mocked(recordWorkspaceAuditEvent);
			for (const call of reads) {
				state.guardManagementAuthResult = cliAuth();
				state.membershipRows.push({ role: call.name === "get" ? "admin" : "owner" });
				state.keyRows.length = 0;
				state.keyRows.push({ ...key }, { ...key, id: "key_3", hash: "hash_3" });
				state.keyWorkspaceFilters.length = 0;
				state.membershipLookups.length = 0;
				audit.mockClear();

				const response = await send(call);

				expect(response.status, call.name).toBe(call.status);
				// The role is checked in the named workspace, for the signed-in person.
				expect(state.membershipLookups, call.name).toEqual([[{ column: "workspace_id", value: "ws_2" }, { column: "user_id", value: "user_1" }]]);
				expect(state.keyWorkspaceFilters.every((value) => value === "ws_2"), `${call.name} ${JSON.stringify(state.keyWorkspaceFilters)}`).toBe(true);
				for (const [, event] of audit.mock.calls) expect(event, call.name).toMatchObject({ workspaceId: "ws_2" });
				if (call.name === "update" || call.name === "delete") expect(audit, call.name).toHaveBeenCalled();
			}
			expect(state.insertPayloads).toEqual([]);
			expect(state.updateFilters.flat().filter((filter) => filter.column === "workspace_id").map((filter) => filter.value).every((value) => value === "ws_2")).toBe(true);
		});

		it("refuses the CLI's key changes in any workspace: they're made in the dashboard or with a management key", async () => {
			for (const call of writes) {
				for (const workspace of ["ws_1", "ws_2"]) {
					state.guardManagementAuthResult = cliAuth();
					state.membershipRows.length = 0;
					state.membershipRows.push({ role: "owner" });
					state.keyRows.length = 0;
					state.keyRows.push({ ...key, workspace_id: workspace });

					const response = await send({ ...call, url: call.url.replace("ws_2", workspace), ...(call.body ? { body: { ...call.body, workspace_id: workspace } } : {}) });

					expect(response.status, `${call.name} ${workspace}`).toBe(403);
					expect(await response.json(), `${call.name} ${workspace}`).toMatchObject({ error: "forbidden", message: PUBLIC_NATIVE_CLIENT_REFUSAL });
				}
			}
			expect(state.insertPayloads).toEqual([]);
			expect(state.updatePayloads).toEqual([]);
		});

		it("refuses a person who isn't a member of the named workspace", async () => {
			for (const call of reads) {
				state.guardManagementAuthResult = cliAuth();
				state.membershipRows.push(null);

				const response = await send(call);

				expect(response.status, call.name).toBe(403);
				expect(await response.json(), call.name).toEqual({ error: "forbidden", message: "Workspace membership is required" });
			}
			expectNothingTouched();
		});

		it("refuses a member of the named workspace who isn't an owner or admin", async () => {
			for (const call of reads) {
				state.guardManagementAuthResult = cliAuth();
				state.membershipRows.push({ role: "member" });

				const response = await send(call);

				expect(response.status, call.name).toBe(403);
				expect(await response.json(), call.name).toEqual({ error: "forbidden", message: "Workspace owner or admin role is required" });
			}
			expectNothingTouched();
		});

		it("keeps API keys, management keys and dashboard sessions in their own workspace", async () => {
			const callers = {
				"API key": { workspaceId: "ws_1", apiKeyId: "key_1", internal: false },
				"management key": { workspaceId: "ws_1", apiKeyId: "mgmt_1", internal: false, authMethod: "api_key", userId: "user_1", scopes: ["keys:read", "keys:write", "keys:delete"] },
				"dashboard session": { workspaceId: "ws_1", apiKeyId: "dashboard", apiKeyRef: "dashboard", internal: false, authMethod: "oauth", oauthClientId: null, userId: "user_1", scopes: ["keys:read", "keys:write", "keys:delete"] },
				"OAuth token without a person": { ...cliAuth({ userId: null }).value },
			};
			for (const [caller, value] of Object.entries(callers)) {
				for (const call of calls) {
					state.guardManagementAuthResult = { ok: true, value: value as any };
					state.membershipRows.push({ role: "owner" });

					const response = await send(call);

					expect(response.status, `${caller} ${call.name}`).toBe(403);
					// A CLI token is refused key changes before the workspace is looked at.
					const refusedAsCli = caller === "OAuth token without a person" && writes.includes(call);
					expect(await response.json(), `${caller} ${call.name}`).toMatchObject(refusedAsCli
						? { error: "forbidden", message: PUBLIC_NATIVE_CLIENT_REFUSAL }
						: { ok: false, error: "forbidden", message: "workspace_id must match authenticated workspace" });
					state.membershipRows.length = 0;
				}
			}
			expect(state.membershipLookups).toEqual([]);
			expectNothingTouched();

			// Naming its own workspace is still fine.
			state.guardManagementAuthResult = { ok: true, value: callers["API key"] as any };
			state.keyRows.push({ ...key, workspace_id: "ws_1" });
			expect((await send({ name: "get", url: "https://example.com/hash_2?workspace_id=ws_1", method: "GET", status: 200 })).status).toBe(200);
			expect(state.keyWorkspaceFilters).toEqual(["ws_1"]);
		});

		it("keeps apps that use Sign in with Phaseo in the workspace the person chose for them", async () => {
			for (const call of calls) {
				state.guardManagementAuthResult = cliAuth({ oauthClientId: "partner_app" });
				state.membershipRows.push({ role: "owner" });

				const response = await send(call);

				expect(response.status, call.name).toBe(403);
				expect((await response.json()).error, call.name).toBe("forbidden");
				state.membershipRows.length = 0;
			}
			expect(state.membershipLookups).toEqual([]);
			expectNothingTouched();
		});
	});

	it("rechecks the API key limit before reactivating a paused key", async () => {
		state.keyRows.push({
			id: "key_paused",
			hash: "hash_1",
			workspace_id: "ws_1",
			kid: "kid_1",
			name: "Paused Key",
			status: "paused",
			soft_blocked: false,
			expires_at: null,
		});
		state.enforceWorkspaceKeyLimit.mockRejectedValueOnce(
			new Error("Key limit reached (5) for this workspace. Delete an existing API key to create a new one."),
		);

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/hash_1", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ disabled: false }),
		});
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body).toMatchObject({ error: "key_limit_reached" });
		expect(state.enforceWorkspaceKeyLimit).toHaveBeenCalledWith("ws_1", "api", "key_paused");
		expect(state.updatePayloads).toEqual([]);
	});

	it("records pausing and resuming a key as such, like the dashboard, only when the status changes", async () => {
		// Each update reads the key, then reads it back. The third request retries the resume.
		for (const status of ["active", "paused", "paused", "active", "active", "active", "active", "active"]) {
			state.keyRows.push({
				id: "key_live", hash: "hash_1", workspace_id: "ws_1", kid: "kid_1", name: "Live Key", prefix: "phaseo_v1_sk_abc", status, scopes: "[]",
				created_by: "user_1", created_at: "2026-04-28T10:00:00Z", updated_at: "2026-04-28T10:30:00Z", last_used_at: null, soft_blocked: false,
				expires_at: null, daily_limit_cost_nanos: 0, weekly_limit_cost_nanos: 0, monthly_limit_cost_nanos: 0,
			});
		}
		const { recordWorkspaceAuditEvent } = await import("@/lib/audit/workspaceAudit");
		const audit = vi.mocked(recordWorkspaceAuditEvent);
		audit.mockClear();
		const { keysRoutes } = await import("./keys");
		for (const body of [{ disabled: true }, { disabled: false }, { disabled: false }, { name: "Renamed" }]) {
			const response = await keysRoutes.request("https://example.com/hash_1", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			expect(response.status).toBe(200);
		}

		expect(audit.mock.calls.map(([, event]) => event.action)).toEqual(["api_key.paused", "api_key.resumed", "api_key.updated", "api_key.updated"]);
	});

	it("updates a key by hash and remaps limit_reset using the existing limit", async () => {
		state.keyRows.push(
			{
				id: "key_1",
				hash: "hash_1",
				workspace_id: "ws_1",
				kid: "kid_1",
				name: "Primary Key",
				prefix: "phaseo_v1_sk_abc",
				status: "active",
				scopes: "[]",
				created_by: "user_1",
				created_at: "2026-04-28T10:00:00Z",
				updated_at: "2026-04-28T10:30:00Z",
				last_used_at: "2026-04-28T11:00:00Z",
				soft_blocked: false,
				expires_at: null,
				daily_limit_cost_nanos: 0,
				weekly_limit_cost_nanos: 0,
				monthly_limit_cost_nanos: 10_000_000_000,
			},
			{
				id: "key_1",
				hash: "hash_1",
				workspace_id: "ws_1",
				name: "Primary Key",
				prefix: "phaseo_v1_sk_abc",
				status: "active",
				scopes: "[]",
				created_by: "user_1",
				created_at: "2026-04-28T10:00:00Z",
				updated_at: "2026-04-28T10:45:00Z",
				last_used_at: "2026-04-28T11:00:00Z",
				soft_blocked: false,
				expires_at: null,
				daily_limit_cost_nanos: 10_000_000_000,
				weekly_limit_cost_nanos: 0,
				monthly_limit_cost_nanos: 0,
			},
		);

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/hash_1", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ limit_reset: "daily" }),
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(state.updatePayloads[0]).toMatchObject({
			daily_limit_cost_nanos: 10_000_000_000,
			weekly_limit_cost_nanos: 0,
			monthly_limit_cost_nanos: 0,
		});
		expect(state.updateFilters[0]).toEqual([
			{ column: "id", value: "key_1" },
			{ column: "workspace_id", value: "ws_1" },
		]);
		expect(body.data).toMatchObject({
			limit: 10,
			limit_reset: "daily",
		});
		expect(body.data).not.toHaveProperty("hash");
		expect(body.data).not.toHaveProperty("kid");
	});

	describe("department link", () => {
		const DEPARTMENT_ID = "4b1f0c7e-2d3a-4c5b-8e6f-7a8b9c0d1e2f";
		const keyRow = (overrides: Record<string, unknown> = {}) => ({
			id: "key_1",
			hash: "hash_1",
			workspace_id: "ws_1",
			kid: "kid_1",
			name: "Primary Key",
			prefix: "phaseo_v1_sk_abc",
			status: "active",
			scopes: "[]",
			created_by: "user_1",
			created_at: "2026-04-28T10:00:00Z",
			updated_at: "2026-04-28T10:30:00Z",
			soft_blocked: false,
			expires_at: null,
			department_id: null,
			...overrides,
		});
		const patch = async (body: Record<string, unknown>) => {
			const { keysRoutes } = await import("./keys");
			return keysRoutes.request("https://example.com/hash_1", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
		};

		it("links a key to a department in its workspace", async () => {
			state.keyRows.push(keyRow(), keyRow({ department_id: DEPARTMENT_ID }));
			state.departmentRows.push({ id: DEPARTMENT_ID });

			const response = await patch({ department_id: DEPARTMENT_ID.toUpperCase() });
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(state.departmentLookups[0]).toEqual([
				{ column: "workspace_id", value: "ws_1" },
				{ column: "id", value: DEPARTMENT_ID },
			]);
			expect(state.updatePayloads[0]).toEqual({ department_id: DEPARTMENT_ID });
			expect(body.data.department_id).toBe(DEPARTMENT_ID);
			// The department's rate limit now applies to the key.
			expect(state.publishRateLimitPlan).toHaveBeenCalledWith("ws_1");
		});

		it("does not republish rate limits when the department is unchanged", async () => {
			state.keyRows.push(keyRow({ department_id: DEPARTMENT_ID }), keyRow({ department_id: DEPARTMENT_ID }));
			state.departmentRows.push({ id: DEPARTMENT_ID });
			expect((await patch({ department_id: DEPARTMENT_ID })).status).toBe(200);
			expect(state.publishRateLimitPlan).not.toHaveBeenCalled();
		});

		it("rejects a department outside the workspace or a malformed id", async () => {
			state.keyRows.push(keyRow());
			const foreign = await patch({ department_id: DEPARTMENT_ID });
			expect(foreign.status).toBe(400);
			await expect(foreign.json()).resolves.toMatchObject({ error: "bad_request", message: expect.stringContaining("department") });

			const malformed = await patch({ department_id: "sales" });
			expect(malformed.status).toBe(400);
			expect(state.updatePayloads).toHaveLength(0);
		});

		it("unlinks a key with null without a department lookup", async () => {
			state.keyRows.push(keyRow({ department_id: DEPARTMENT_ID }), keyRow());

			const response = await patch({ department_id: null });

			expect(response.status).toBe(200);
			expect(state.departmentLookups).toHaveLength(0);
			expect(state.updatePayloads[0]).toEqual({ department_id: null });
			await expect(response.json()).resolves.toMatchObject({ data: { department_id: null } });
			expect(state.publishRateLimitPlan).toHaveBeenCalledWith("ws_1");
		});
	});

	describe("storage locations", () => {
		const keyRow = (overrides: Record<string, unknown> = {}) => ({
			id: "key_1", hash: "hash_1", workspace_id: "ws_1", kid: "kid_1", name: "Primary Key", prefix: "phaseo_v1_sk_abc",
			status: "active", scopes: "[]", created_by: "user_1", created_at: "2026-04-28T10:00:00Z", updated_at: "2026-04-28T10:30:00Z",
			soft_blocked: false, expires_at: null, storage_locations: [], ...overrides,
		});
		const patch = async (body: Record<string, unknown>) => {
			const { keysRoutes } = await import("./keys");
			return keysRoutes.request("https://example.com/hash_1", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
		};

		it("sets, returns and clears where a key is stored", async () => {
			state.keyRows.push(keyRow(), keyRow({ storage_locations: ["railway", "github"] }));
			const response = await patch({ storage_locations: ["github", "railway"] });
			expect(response.status).toBe(200);
			expect(state.updatePayloads[0]).toEqual({ storage_locations: ["railway", "github"] });
			await expect(response.json()).resolves.toMatchObject({ data: { storage_locations: ["railway", "github"] } });

			state.keyRows.push(keyRow({ storage_locations: ["railway"] }), keyRow());
			expect((await patch({ storage_locations: null })).status).toBe(200);
			expect(state.updatePayloads[1]).toEqual({ storage_locations: [] });
		});

		it("sets an IP allowlist with the dashboard's rules and returns it", async () => {
			const allowlist = [{ label: "Office", address: "203.0.113.0/24" }, { label: "VPN", address: "2001:db8::1" }];
			state.keyRows.push(keyRow(), keyRow({ ip_allowlist: allowlist }));
			const response = await patch({ ip_allowlist: [{ label: " Office ", address: "203.0.113.0/24" }, allowlist[1]] });
			expect(response.status).toBe(200);
			expect(state.updatePayloads[0]).toEqual({ ip_allowlist: allowlist });
			await expect(response.json()).resolves.toMatchObject({ data: { ip_allowlist: allowlist } });
		});

		it("rejects an invalid IP allowlist", async () => {
			for (const ip_allowlist of [[{ label: "Office", address: "not-an-ip" }], [{ label: "", address: "203.0.113.1" }], "203.0.113.1"]) {
				state.keyRows.push(keyRow());
				const response = await patch({ ip_allowlist });
				expect(response.status).toBe(400);
				await expect(response.json()).resolves.toMatchObject({ error: "invalid_ip_allowlist" });
			}
			expect(state.updatePayloads).toHaveLength(0);
		});

		it("rejects unknown locations", async () => {
			state.keyRows.push(keyRow());
			const response = await patch({ storage_locations: ["my-laptop"] });
			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ error: "bad_request", message: expect.stringContaining("my-laptop") });
			expect(state.updatePayloads).toHaveLength(0);
		});

		it("never turns a revoked key back on", async () => {
			state.keyRows.push(keyRow({ status: "revoked" }));
			const response = await patch({ disabled: false });
			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({ error: "key_revoked" });
			expect(state.updatePayloads).toHaveLength(0);
		});

		it("still updates other fields of a revoked key when disabled: true is sent back", async () => {
			state.keyRows.push(keyRow({ status: "revoked" }), keyRow({ status: "revoked", name: "Renamed" }));
			const response = await patch({ disabled: true, name: "Renamed" });
			expect(response.status).toBe(200);
			expect(state.updatePayloads[0]).toEqual({ name: "Renamed" });
		});
	});

	it("never reads, changes, rotates or deletes keys Phaseo manages for Chat and the Slack agent", async () => {
		const { keysRoutes } = await import("./keys");
		const { MANAGED_KEY_NAMES_FILTER } = await import("./management-helpers");
		expect(MANAGED_KEY_NAMES_FILTER).toBe('("__chat_route_managed_key__","__slack_agent_managed_key__")');

		const calls: Array<[string, RequestInit]> = [
			["https://example.com/hash_managed", { method: "GET" }],
			["https://example.com/hash_managed", { method: "PATCH", body: JSON.stringify({ name: "Mine now" }), headers: { "Content-Type": "application/json" } }],
			["https://example.com/hash_managed", { method: "DELETE" }],
			["https://example.com/hash_managed/rotate", { method: "POST" }],
		];
		for (const [url, init] of calls) {
			state.nameFilters.length = 0;
			const response = await keysRoutes.request(url, init);
			expect(response.status, `${init.method} ${url}`).toBe(404);
			expect(state.nameFilters, `${init.method} ${url}`).toContainEqual(["name", "in", MANAGED_KEY_NAMES_FILTER]);
		}
		expect(state.updatePayloads).toEqual([]);
		expect(state.deletedKeyIds).toEqual([]);
	});

	it("refuses to create or rename a key with a name Phaseo reserves for its managed keys", async () => {
		const { keysRoutes } = await import("./keys");
		for (const name of ["__slack_agent_managed_key__", " __chat_route_managed_key__ "]) {
			const created = await keysRoutes.request("https://example.com/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			expect(created.status, name).toBe(400);
			expect(await created.json()).toMatchObject({ message: "This key name is reserved for keys Phaseo manages" });
		}

		state.keyRows.push({ id: "key_1", workspace_id: "ws_1", kid: "kid_1", hash: "hash_1", name: "Primary Key", status: "active" });
		const renamed = await keysRoutes.request("https://example.com/hash_1", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "__slack_agent_managed_key__" }),
		});
		expect(renamed.status).toBe(400);
		expect(state.insertPayloads).toEqual([]);
		expect(state.updatePayloads).toEqual([]);
	});

	it("deletes a key by hash and removes its dependent records", async () => {
		state.keyRows.push({
			id: "key_1",
			workspace_id: "ws_1",
			kid: "kid_1",
			hash: "hash_1",
			name: "Primary Key",
			status: "active",
		});

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/hash_1", {
			method: "DELETE",
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ deleted: true });
		expect(state.updatePayloads[0]).toMatchObject({
			status: "deleted",
			soft_blocked: true,
			hash: "deleted:key_1",
		});
		expect(state.updateFilters[0]).toEqual([
			{ column: "id", value: "key_1" },
			{ column: "workspace_id", value: "ws_1" },
		]);
		expect(state.deleteFilters).toEqual([
			{ table: "key_guardrails", column: "key_id", value: "key_1" },
			{ table: "broadcast_destination_keys", column: "key_id", value: "key_1" },
		]);
	});

	it("rotates a key while preserving limits and expiring the previous key", async () => {
		state.workspaceRows.push({ owner_user_id: "user_1" });
		state.keyRows.push(
			{
				id: "key_old",
				workspace_id: "ws_1",
				kid: "kid_old",
				name: "Primary Key",
				prefix: "old_prefix",
				status: "active",
				scopes: "[]",
				soft_blocked: false,
				daily_limit_requests: 10,
				monthly_limit_cost_nanos: 5_000_000_000,
			},
			{
				id: "key_new",
				hash: "hash_new",
				workspace_id: "ws_1",
				name: "Replacement",
				prefix: "phaseo_v1_sk_kid_123",
				status: "active",
				scopes: "[]",
				soft_blocked: false,
				monthly_limit_cost_nanos: 5_000_000_000,
			},
		);

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/key_old/rotate", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Replacement", previous_key_expires_at: "2026-09-01T00:00:00Z" }),
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(state.insertPayloads[0]).toMatchObject({
			workspace_id: "ws_1",
			name: "Replacement",
			daily_limit_requests: 10,
			monthly_limit_cost_nanos: 5_000_000_000,
		});
		expect(state.updatePayloads[0]).toEqual({ expires_at: "2026-09-01T00:00:00.000Z" });
		expect(body).toMatchObject({
			data: { id: "key_new", key: "phaseo_v1_sk_kid_123_secret_123", limit: 5 },
			previous_key_expires_at: "2026-09-01T00:00:00.000Z",
		});
	});

	it("refuses to rotate a workload identity key", async () => {
		state.workspaceRows.push({ owner_user_id: "user_1" });
		state.keyRows.push({ id: "key_old", workspace_id: "ws_1", kid: "kid_old", name: "Vercel production", prefix: "oidc", status: "active", scopes: "[]", soft_blocked: false, key_kind: "workload_identity" });
		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/key_old/rotate", { method: "POST" });
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: "key_not_rotatable" });
		expect(state.insertPayloads).toHaveLength(0);
	});

	function pushRotationRows() {
		state.workspaceRows.push({ owner_user_id: "user_1" });
		state.keyRows.push(
			{ id: "key_old", workspace_id: "ws_1", kid: "kid_old", name: "Primary Key", prefix: "old_prefix", status: "active", scopes: "[]", soft_blocked: false },
			{ id: "key_new", hash: "hash_new", workspace_id: "ws_1", name: "Replacement", prefix: "phaseo_v1_sk_kid_123", status: "active", scopes: "[]", soft_blocked: false },
		);
	}

	it("copies the rotated key's rate limit policy to the replacement and republishes", async () => {
		pushRotationRows();
		state.copyRateLimit.mockResolvedValue(true);
		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/key_old/rotate", { method: "POST" });
		expect(response.status).toBe(200);
		expect(state.copyRateLimit).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws_1", fromKeyId: "key_old", toKeyId: "key_new" }));
		expect(state.publishRateLimitPlan).toHaveBeenCalledWith("ws_1");
		expect(state.deletedKeyIds).toEqual([]);
	});

	it("republishes when the rotated key is linked to a department", async () => {
		pushRotationRows();
		state.keyRows[0].department_id = "dept_1";
		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/key_old/rotate", { method: "POST" });
		expect(response.status).toBe(200);
		expect(state.publishRateLimitPlan).toHaveBeenCalledWith("ws_1");
	});

	it("does not republish when the rotated key had no rate limit policy", async () => {
		pushRotationRows();
		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/key_old/rotate", { method: "POST" });
		expect(response.status).toBe(200);
		expect(state.publishRateLimitPlan).not.toHaveBeenCalled();
	});

	it("undoes the rotation when the rate limit policy cannot be copied", async () => {
		pushRotationRows();
		vi.spyOn(console, "error").mockImplementation(() => {});
		state.copyRateLimit.mockRejectedValue(new Error("copy failed"));
		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/key_old/rotate", { method: "POST" });
		expect(response.status).toBe(500);
		expect(state.deletedKeyIds).toEqual(["key_new"]);
		expect(state.updatePayloads).toEqual([]);
		expect(state.publishRateLimitPlan).not.toHaveBeenCalled();
	});

	it("accepts legacy control bindings while invalidating a cached key", async () => {
		state.bindings = {
			GATEWAY_CONTROL_SECRET: "legacy-secret",
			GATEWAY_CONTROL_KEY: "legacy-control-key",
			KEY_PEPPER_ACTIVE: "pepper",
		};
		state.guardManagementAuthResult = {
			ok: false,
			response: json({ error: "unauthorized" }, 401),
		};
		state.keyRows.push({
			id: "key_legacy",
			kid: "kid_legacy",
			workspace_id: "ws_legacy",
			status: "active",
		});

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/key_legacy/invalidate", {
			method: "POST",
			headers: {
				authorization: "Bearer legacy-control-key",
				"x-control-secret": "legacy-secret",
			},
		});

		expect(response.status).toBe(200);
		expect(state.setKeyVersion).toHaveBeenCalledWith("kid", "kid_legacy", expect.any(Number));
        // Key-level: drops this isolate's copy without clearing the whole workspace.
        expect(state.invalidated).toHaveBeenCalledWith("ws_legacy", { bumpVersion: false });
	});

	it("allows scoped management auth to invalidate without a shared control secret", async () => {
		state.bindings = { KEY_PEPPER_ACTIVE: "pepper" };
		state.keyRows.push({
			id: "key_scoped",
			kid: "kid_scoped",
			workspace_id: "ws_1",
			status: "active",
		});

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/key_scoped/invalidate", {
			method: "POST",
		});

		expect(response.status).toBe(200);
		expect(state.setKeyVersion).toHaveBeenCalledWith("kid", "kid_scoped", expect.any(Number));
        expect(state.invalidated).toHaveBeenCalledWith("ws_1", { bumpVersion: false });
	});
});
