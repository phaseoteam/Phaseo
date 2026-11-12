import { beforeEach, describe, expect, it, vi } from "vitest";

// A key's `hash` is the HMAC the gateway checks its secret against, and `kid` is the lookup half of the key
// string. Neither belongs in an API response: list, detail, create, update, rotate, delete, cache
// invalidation and the current-key route must not return them, even though the rows behind them hold both.
// A hash is still accepted to find a key, for clients that kept one from older responses.

const WS = "00000000-0000-4000-8000-000000000010";
const USER = "00000000-0000-4000-8000-000000000020";
const KEY_ID = "00000000-0000-4000-8000-000000000001";
const SECRET_HASH = "a3f5b7c9d8e1f23456789abcdeffedcba9876543210fedcba1234567890abcd";
const KID = "kid0123456789";

const state = vi.hoisted(() => ({
	auth: null as any,
	lookups: [] as Array<{ column: string; value: unknown }>,
}));

// Rows as the database holds them, including the columns that must never reach a response.
function keyRow(overrides: Record<string, unknown> = {}) {
	return {
		id: KEY_ID, workspace_id: WS, name: "Production", prefix: "phaseo_v1_sk_kid012", status: "active", scopes: "[]",
		hash: SECRET_HASH, kid: KID, created_by: USER, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
		last_used_at: null, soft_blocked: false, expires_at: null, key_kind: "standard", department_id: null,
		daily_limit_requests: 0, weekly_limit_requests: 0, monthly_limit_requests: 0,
		daily_limit_cost_nanos: 0, weekly_limit_cost_nanos: 0, monthly_limit_cost_nanos: 0,
		storage_locations: [], ip_allowlist: [], never_store_content: false,
		...overrides,
	};
}

function query(table: string) {
	let wrote: Record<string, unknown> | null = null;
	const q: any = {};
	for (const method of ["select", "neq", "in", "is", "or", "order", "range", "limit", "not", "gt", "lt", "match"]) q[method] = () => q;
	q.eq = (column: string, value: unknown) => { if (table === "keys") state.lookups.push({ column, value }); return q; };
	for (const op of ["insert", "update", "upsert", "delete"]) {
		q[op] = (payload?: unknown) => { wrote = keyRow({ ...(payload && typeof payload === "object" ? payload as Record<string, unknown> : {}) }); return q; };
	}
	const row = () => {
		if (table === "workspace_members") return { workspace_id: WS, user_id: USER, role: "owner" };
		if (table === "workspaces") return { id: WS, owner_user_id: USER, tier: "enterprise" };
		if (table === "keys") return wrote ?? keyRow();
		return null;
	};
	q.maybeSingle = async () => ({ data: row(), error: null });
	q.single = q.maybeSingle;
	q.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
		Promise.resolve({ data: table === "keys" ? [wrote ?? keyRow()] : [], count: 1, error: null }).then(resolve, reject);
	return q;
}

vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth), guardAuth: vi.fn(async () => state.auth) }));
vi.mock("@/runtime/env", () => ({
	getBindings: () => ({ KEY_PEPPER_ACTIVE: "pepper", PHASEO_CONTROL_SECRET: "control" }),
	getCache: () => ({ delete: vi.fn(async () => undefined), get: vi.fn(async () => null), put: vi.fn(async () => undefined) }),
	getSupabaseAdmin: () => ({ from: (table: string) => query(table), rpc: vi.fn(async () => ({ data: [], error: null })) }),
}));
vi.mock("@/core/kv", () => ({ setKeyVersion: vi.fn(async () => 1) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: vi.fn(async () => true) }));
vi.mock("@/pipeline/before/privateModelCache", () => ({ invalidatePrivateRoutes: vi.fn(async () => undefined) }));
vi.mock("@core/rate-limit-policies", () => ({ copyKeyRateLimitAssignment: vi.fn(async () => false), publishRateLimitPlan: vi.fn(async () => true) }));
vi.mock("./management-helpers", async (importOriginal) => ({
	...(await importOriginal<typeof import("./management-helpers")>()),
	enforceWorkspaceKeyLimit: vi.fn(async () => undefined),
}));
vi.mock("@/lib/oauth/service", () => ({ loadOAuthClient: vi.fn(async () => ({ id: "acme_app", name: "Acme" })) }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

const MANAGEMENT_KEY = { ok: true, value: { workspaceId: WS, userId: USER, apiKeyId: "mgmt", apiKeyRef: "mgmt_kid_x", apiKeyKid: "x", internal: false, authMethod: "api_key", scopes: [], requestId: "request_1" } };

/** Every object key in a JSON value, at any depth. */
function keysIn(value: unknown, found = new Set<string>()): Set<string> {
	if (Array.isArray(value)) value.forEach((entry) => keysIn(entry, found));
	else if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) { found.add(key); keysIn(entry, found); }
	return found;
}

async function send(method: string, path: string, body?: unknown, routes: "keys" | "current" = "keys") {
	const module = await import("./keys");
	const router = routes === "keys" ? module.keysRoutes : module.currentKeyRoutes;
	const response = await router.request(`https://example.com${path}`, {
		method,
		headers: { "content-type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	}, {}, { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any);
	const text = await response.text();
	return { status: response.status, text, body: JSON.parse(text) as unknown };
}

describe("key responses never include the hash or kid", () => {
	beforeEach(() => {
		state.auth = MANAGEMENT_KEY;
		state.lookups.length = 0;
		vi.resetModules();
	});

	it.each([
		["list", "GET", "/", undefined],
		["detail by id", "GET", `/${KEY_ID}`, undefined],
		["detail by hash", "GET", `/${SECRET_HASH}`, undefined],
		["create", "POST", "/", { name: "New key" }],
		["update", "PATCH", `/${KEY_ID}`, { name: "Renamed" }],
		["rotate", "POST", `/${KEY_ID}/rotate`, {}],
		["delete", "DELETE", `/${KEY_ID}`, undefined],
		["cache invalidation", "POST", `/${KEY_ID}/invalidate`, undefined],
	] as const)("%s", async (_name, method, path, body) => {
		const response = await send(method, path, body);
		expect(response.status, response.text).toBeGreaterThanOrEqual(200);
		expect(response.status, response.text).toBeLessThan(300);
		const fields = keysIn(response.body);
		expect(fields.has("hash"), response.text).toBe(false);
		expect(fields.has("kid"), response.text).toBe(false);
		expect(response.text).not.toContain(SECRET_HASH);
		expect(response.text).not.toContain(`"${KID}"`);
	});

	it("still finds a key by a hash a client kept from an older response", async () => {
		const response = await send("GET", `/${SECRET_HASH}`);
		expect(response.status).toBe(200);
		expect(state.lookups).toContainEqual({ column: "hash", value: SECRET_HASH });
		expect(response.body).toMatchObject({ data: { id: KEY_ID } });
	});

	it.each([
		["an API key", { ok: true, value: { workspaceId: WS, userId: USER, apiKeyId: KEY_ID, apiKeyRef: `kid_${KID}`, apiKeyKid: KID, internal: false, authMethod: "api_key", scopes: [] } }],
		["an OAuth token", { ok: true, value: { workspaceId: WS, userId: USER, apiKeyId: "acme_app", apiKeyRef: "oauth_acme_app", apiKeyKid: "acme_app", internal: false, authMethod: "oauth", oauthClientId: "acme_app", oauthScopes: ["keys:read"], scopes: ["keys:read"] } }],
	])("the current-key route for %s", async (_name, auth) => {
		state.auth = auth;
		const response = await send("GET", "/", undefined, "current");
		expect(response.status, response.text).toBe(200);
		const fields = keysIn(response.body);
		expect(fields.has("hash"), response.text).toBe(false);
		expect(fields.has("kid"), response.text).toBe(false);
		expect(response.text).not.toContain(SECRET_HASH);
	});
});
