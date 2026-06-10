import { beforeEach, describe, expect, it, vi } from "vitest";

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
	workspaceRows: [] as Array<Record<string, unknown> | null>,
	updatePayloads: [] as Array<Record<string, unknown>>,
	insertPayloads: [] as Array<Record<string, unknown>>,
	membershipRows: [] as Array<Record<string, unknown> | null>,
	updateFilters: [] as Array<Array<{ column: string; value: unknown }>>,
	deleteFilters: [] as Array<{ table: string; column: string; value: unknown }>,
	enforceWorkspaceKeyLimit: vi.fn(async (_workspaceId: string) => undefined),
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
		from(table: string) {
			if (table !== "keys" && table !== "workspaces" && table !== "workspace_members" && table !== "key_guardrails" && table !== "broadcast_destination_keys") {
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

			if (table === "workspace_members") {
				return {
					select: () => ({
						eq: () => ({
							eq: () => ({
								maybeSingle: async () => ({
									data: state.membershipRows.shift() ?? null,
									error: null,
								}),
							}),
						}),
					}),
				};
			}

			let updatePayload: Record<string, unknown> | null = null;
			const query: any = {
				select: () => query,
				eq: () => query,
				neq: () => query,
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
	getCache: () => ({ delete: vi.fn(async () => undefined) }),
	getBindings: () => ({ GATEWAY_CONTROL_SECRET: "secret", KEY_PEPPER_ACTIVE: "pepper" }),
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardAuth: vi.fn(async () => state.guardAuthResult),
	guardManagementAuth: vi.fn(async () => state.guardManagementAuthResult),
}));

vi.mock("@/routes/utils", () => ({
	json,
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

vi.mock("@/core/kv", () => ({
	setKeyVersion: vi.fn(async () => undefined),
}));

vi.mock("@/routes/auth.helpers", () => ({
	generateGatewayKey: vi.fn(() => ({
		kid: "kid_123",
		secret: "secret_123",
		plaintext: "aistats_v1_sk_kid_123_secret_123",
		prefix: "aistats_v1_sk_kid_123",
	})),
	hmacSecret: vi.fn(async () => "hashed_secret"),
	timingSafeEqual: vi.fn((a: string, b: string) => a === b),
}));

vi.mock("@/lib/security/keyPepper", () => ({
	resolveActiveKeyPepper: vi.fn(() => "pepper"),
}));

vi.mock("./management-helpers", () => ({
	CHAT_MANAGED_KEY_NAME: "__chat_route_managed_key__",
	enforceWorkspaceKeyLimit: state.enforceWorkspaceKeyLimit,
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
		state.workspaceRows.length = 0;
		state.membershipRows.length = 0;
		state.updatePayloads.length = 0;
		state.updateFilters.length = 0;
		state.deleteFilters.length = 0;
		state.insertPayloads.length = 0;
		state.enforceWorkspaceKeyLimit.mockReset();
		state.enforceWorkspaceKeyLimit.mockResolvedValue(undefined);
		vi.resetModules();
	});

	it("returns current key metadata with hash and computed limit window", async () => {
		state.keyRows.push({
			id: "key_1",
			hash: "hash_1",
			workspace_id: "ws_1",
			name: "Primary Key",
			prefix: "aistats_v1_sk_abc",
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

		const { currentKeyRoutes } = await import("./keys");
		const response = await currentKeyRoutes.request("https://example.com/");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({
			id: "key_1",
			hash: "hash_1",
			label: "Primary Key",
			limit: 25,
			limit_reset: "monthly",
			include_byok_in_limit: false,
		});
	});

	it("creates a key and applies OpenRouter-style limit fields", async () => {
		state.workspaceRows.push({ owner_user_id: "user_1" });
		state.keyRows.push({
			id: "key_new",
			hash: "hash_new",
			workspace_id: "ws_1",
			name: "Analytics Key",
			prefix: "aistats_v1_sk_kid_123",
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
				expires_at: "2027-12-31T23:59:59Z",
			}),
		});
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(state.enforceWorkspaceKeyLimit).toHaveBeenCalledWith("ws_1");
		expect(state.insertPayloads[0]).toMatchObject({
			workspace_id: "ws_1",
			name: "Analytics Key",
			scopes: "[]",
			weekly_limit_cost_nanos: 5_000_000_000,
			daily_limit_cost_nanos: 0,
			monthly_limit_cost_nanos: 0,
		});
		expect(body.data).toMatchObject({
			hash: "hash_new",
			limit: 5,
			limit_reset: "weekly",
			key: "aistats_v1_sk_kid_123_secret_123",
		});
	});

	it("blocks OAuth workspace members from creating API keys", async () => {
		state.guardManagementAuthResult = {
			ok: true,
			value: {
				workspaceId: "ws_1",
				apiKeyId: "oauth_1",
				internal: false,
				authMethod: "oauth",
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
			prefix: "aistats_v1_sk_abc",
			status: "active",
		});

		const { keysRoutes } = await import("./keys");
		const response = await keysRoutes.request("https://example.com/hash_1");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({
			id: "key_1",
			hash: "hash_1",
			name: "Primary Key",
		});
	});

	it("updates a key by hash and remaps limit_reset using the existing limit", async () => {
		state.keyRows.push(
			{
				id: "key_1",
				hash: "hash_1",
				workspace_id: "ws_1",
				kid: "kid_1",
				name: "Primary Key",
				prefix: "aistats_v1_sk_abc",
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
				prefix: "aistats_v1_sk_abc",
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
			hash: "hash_1",
			limit: 10,
			limit_reset: "daily",
		});
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
});
