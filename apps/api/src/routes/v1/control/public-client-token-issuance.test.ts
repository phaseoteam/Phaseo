import { beforeEach, describe, expect, it, vi } from "vitest";

// Issuance to route: anyone can start the CLI's device sign-in with the public client ID phaseo_cli, and
// once the person approves, the token endpoint issues a genuine CLI token. Sent to a control route, that
// token must authenticate (reads work) but get no exemption on changes to where workspace data goes or
// what can spend. Real token endpoint, real token validation and real management authentication; only
// the database and rate limiter are faked.

const WS = "00000000-0000-4000-8000-000000000010";
const USER = "00000000-0000-4000-8000-000000000020";
const SCOPES = ["settings:read", "settings:write", "keys:read", "keys:write"];

const state = vi.hoisted(() => ({
	writes: [] as Array<{ table: string; op: string }>,
	rpcs: [] as string[],
}));

const ROWS: Record<string, Record<string, unknown> | null> = {
	oauth_device_codes: { id: "device_1", client_id: "phaseo_cli", user_id: USER, workspace_id: WS, scopes: SCOPES, status: "approved", expires_at: "2999-01-01T00:00:00Z", consumed_at: null },
	oauth_authorizations: { scopes: SCOPES, revoked_at: null },
	workspace_members: { workspace_id: WS, user_id: USER, role: "owner" },
	oauth_clients: { id: "phaseo_cli", name: "Phaseo CLI", client_type: "public", redirect_uris: [], allowed_scopes: SCOPES, is_first_party: true, beta_status: "ga", status: "active" },
	workspace_settings: { workspace_id: WS, routing_mode: "balanced", io_logging_enabled: false },
};

function query(table: string) {
	const q: any = {};
	for (const method of ["select", "eq", "neq", "in", "is", "or", "order", "range", "limit", "not", "gt", "lt"]) q[method] = () => q;
	for (const op of ["insert", "update", "upsert", "delete"]) q[op] = () => { state.writes.push({ table, op }); return q; };
	q.maybeSingle = async () => ({ data: ROWS[table] ?? null, error: null });
	q.single = q.maybeSingle;
	q.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
		Promise.resolve({ data: ROWS[table] ? [ROWS[table]] : [], count: 0, error: null }).then(resolve, reject);
	return q;
}

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	configureRuntime: vi.fn(),
	clearRuntime: vi.fn(),
	getBindings: () => ({ NODE_ENV: "test", PHASEO_OAUTH_TOKEN_PEPPER_ACTIVE: "test-pepper", GATEWAY_PUBLIC_BASE_URL: "https://api.phaseo.app" }),
	getSupabaseAdmin: () => ({
		from: (table: string) => query(table),
		rpc: vi.fn(async (name: string) => {
			state.rpcs.push(name);
			return { data: name === "consume_oauth_grant_and_issue_refresh_token" ? "issued" : true, error: null };
		}),
		auth: { admin: { getUserById: async () => ({ data: { user: { id: USER, email: "person@example.com", user_metadata: {} } } }) } },
	}),
}));
vi.mock("@/lib/oauth/rateLimit", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/oauth/rateLimit")>()),
	checkOAuthRateLimit: vi.fn(async () => true),
}));
vi.mock("@/core/kv", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/core/kv")>()), setKeyVersion: vi.fn(async () => 1) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: vi.fn(async () => true) }));
vi.mock("@/pipeline/before/workspacePolicy", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/pipeline/before/workspacePolicy")>()),
	bumpWorkspacePolicyVersion: vi.fn(async () => undefined),
}));

const executionCtx = { waitUntil: (promise: Promise<unknown>) => { void promise.catch(() => undefined); }, passThroughOnException: () => undefined, props: {} } as any;

async function deviceToken(): Promise<string> {
	const { oauthRouter } = await import("@/routes/oauth");
	const response = await oauthRouter.request("https://api.phaseo.app/token", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: "device-code", client_id: "phaseo_cli" }),
	}, {}, executionCtx);
	const body = await response.json() as Record<string, unknown>;
	expect(response.status, JSON.stringify(body)).toBe(200);
	expect(state.rpcs).toContain("consume_oauth_grant_and_issue_refresh_token");
	return String(body.access_token);
}

async function control(routes: "settings" | "keys", method: string, path: string, token: string, body?: unknown) {
	const router = routes === "settings" ? (await import("./settings")).settingsRoutes : (await import("./keys")).keysRoutes;
	const response = await router.request(`https://api.phaseo.app${path}`, {
		method,
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	}, {}, executionCtx);
	return { status: response.status, body: await response.json().catch(() => null) as any };
}

describe("a device-code token for the public CLI client ID", () => {
	beforeEach(() => {
		state.writes.length = 0;
		state.rpcs.length = 0;
		vi.resetModules();
	});

	it("is issued, authenticates and reads, but can't turn on I/O logging or create a key", async () => {
		const token = await deviceToken();
		const { PUBLIC_NATIVE_CLIENT_REFUSAL } = await import("./route-helpers");

		const read = await control("settings", "GET", "/", token);
		expect(read.status, JSON.stringify(read.body)).toBe(200);

		state.writes.length = 0;
		const logging = await control("settings", "PATCH", "/", token, { ioLoggingEnabled: true });
		expect(logging.status, JSON.stringify(logging.body)).toBe(403);
		expect(logging.body).toMatchObject({ error: "forbidden", message: PUBLIC_NATIVE_CLIENT_REFUSAL });

		const key = await control("keys", "POST", "/", token, { name: "Minted" });
		expect(key.status, JSON.stringify(key.body)).toBe(403);
		expect(key.body).toMatchObject({ error: "forbidden", message: PUBLIC_NATIVE_CLIENT_REFUSAL });

		expect(state.writes.filter((write) => !["oauth_authorizations"].includes(write.table))).toEqual([]);
	});
});
