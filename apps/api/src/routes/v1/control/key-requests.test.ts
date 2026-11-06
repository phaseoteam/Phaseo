import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// API key requests on the gateway: any OAuth token with keys:write (the CLI's, a third-party app's) can ask
// for a key, but nothing here can approve one; only the requester with the verifier collects it, once.

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const OTHER_WORKSPACE = "00000000-0000-4000-8000-000000000002";
const REQUEST = "00000000-0000-4000-8000-0000000000aa";
const KEY = "00000000-0000-4000-8000-0000000000bb";
const USER = "00000000-0000-4000-8000-000000000011";
const VERIFIER = "verifier-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFG";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
// apps/web-api/src/lib/keyRequestSecret.test.ts encrypts the same plaintext to this with the same pepper,
// request id and IV, so the two copies of the code stay compatible.
const SEALED = "v1.AQIDBAUGBwgJCgsM.EdZB0EFDmv5c4NO1SBsCw7B3XvwtxPzlPHB2WJwIgouzPZl_OZEsv1p0tWpS_mqi2qlsQcTU3d_4jP9PQ-8U9PCnRmiK2SWyqpO2SsKKMrGGrw";
const PLAINTEXT = "phaseo_v1_sk_abcdefghijkl_0123456789abcdefghijABCDEFGHIJ0123456789";
// What collect_api_key_request returns for an approved request: the sealed secret and the key's details,
// in one call.
const APPROVED_ROW = {
	workspace_id: WORKSPACE, key_id: KEY, secret_ciphertext: SEALED, key_name: "Phaseo CLI: Codex API Key", key_prefix: "abcdef",
	key_expires_at: "2027-02-04T00:00:00.000Z", daily_cost_nanos: 0, monthly_cost_nanos: 100_000_000_000,
};

type Row = Record<string, any>;

const state = vi.hoisted(() => ({
	auth: null as any,
	rpc: null as any,
	audit: null as any,
	keys: [] as Row[],
	keysReadFails: false,
	bindings: {} as Record<string, string>,
	clients: {} as Record<string, Row>,
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		rpc: (...args: unknown[]) => state.rpc(...args),
		from: (table: string) => {
			const filters: Array<(row: Row) => boolean> = [];
			const builder: any = {
				select: () => builder,
				eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
				maybeSingle: async () => state.keysReadFails
					? { data: null, error: { message: "connection reset" } }
					: { data: (table === "keys" ? state.keys : []).find((row) => filters.every((f) => f(row))) ?? null, error: null },
			};
			return builder;
		},
	}),
	getBindings: () => state.bindings,
}));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: (...args: unknown[]) => state.audit(...args) }));
vi.mock("@/lib/oauth/service", () => ({ loadOAuthClient: async (id: string) => state.clients[id] ?? null }));
// #3552 makes rejectThirdPartyOAuthSpendingChange refuse CLI and desktop sign-ins too, so POST /v1/keys
// refuses them. Simulate that here: key requests must not go through the refusal, or CLI setup breaks.
vi.mock("./route-helpers", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./route-helpers")>();
	return {
		...actual,
		rejectThirdPartyOAuthSpendingChange: (auth: { authMethod?: string }) => auth.authMethod === "oauth"
			? new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })
			: null,
	};
});
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

function oauth(clientId: string, extra: Row = {}) {
	return { ok: true, value: { workspaceId: WORKSPACE, authMethod: "oauth", userId: USER, oauthClientId: clientId, scopes: [], oauthScopes: ["keys:read", "keys:write"], requestId: "req-1", ...extra } };
}

async function call(path: string, body: Row, method = "POST") {
	const { keyRequestsRoutes } = await import("./key-requests");
	return keyRequestsRoutes.request(`https://api.phaseo.app${path}`, {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

const validRequest = (extra: Row = {}) => ({
	name: "Phaseo CLI: Codex API Key",
	agent: "codex",
	limits: { monthly_cost_usd: 100 },
	expires_in_days: 90,
	code_challenge: CHALLENGE,
	code_challenge_method: "S256",
	...extra,
});

function rpcCalls(name: string) {
	return state.rpc.mock.calls.filter(([called]: [string]) => called === name).map(([, args]: [string, Row]) => args);
}

describe("POST /v1/key-requests", () => {
	beforeEach(() => {
		state.auth = oauth("phaseo_cli");
		state.bindings = { PHASEO_WEB_BASE_URL: "https://phaseo.test", KEY_PEPPER_ACTIVE: "test-pepper-active" };
		state.clients = { partner_app: { id: "partner_app", name: "Partner Agent" } };
		state.keys = [];
		state.audit = vi.fn(async () => true);
		state.rpc = vi.fn(async (name: string) => name === "create_api_key_request"
			? { data: [{ id: REQUEST, expires_at: "2026-11-06T20:10:00.000Z" }], error: null }
			: { data: null, error: null });
	});

	it("records a pending request for a CLI sign-in and returns where to approve it", async () => {
		const response = await call("/", validRequest({ limits: { daily_cost_usd: 5, monthly_cost_usd: 100 } }));
		expect(response.status).toBe(201);
		const body = await response.json() as Row;
		expect(body).toMatchObject({
			request_id: REQUEST,
			status: "pending",
			approval_url: `https://phaseo.test/settings/keys/requests/${REQUEST}`,
			poll_interval: 3,
			expires_in: 600,
			limits: { daily_cost_usd: 5, monthly_cost_usd: 100 },
			expires_in_days: 90,
		});
		expect(body).not.toHaveProperty("key");
		expect(rpcCalls("create_api_key_request")).toEqual([{
			p_workspace_id: WORKSPACE,
			p_user_id: USER,
			p_requested_via: "oauth",
			p_oauth_client_id: "phaseo_cli",
			p_client_name: "Phaseo CLI",
			p_agent: "codex",
			p_key_name: "Phaseo CLI: Codex API Key",
			p_daily_cost_nanos: 5_000_000_000,
			p_monthly_cost_nanos: 100_000_000_000,
			p_key_lifetime_days: 90,
			p_code_challenge: CHALLENGE,
			p_requester_credential: "oauth:phaseo_cli",
			p_requester_workspace_id: WORKSPACE,
			p_ttl_seconds: 600,
			p_max_open: 5,
		}]);
		// Only the request: no key, no other write.
		expect(state.rpc.mock.calls.map(([name]: [string]) => name)).toEqual(["create_api_key_request"]);
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "api_key_request.created", targetId: REQUEST }));
	});

	it("stays open to CLI and desktop sign-ins when key creation refuses every OAuth client (#3552)", async () => {
		const { rejectThirdPartyOAuthSpendingChange } = await import("./route-helpers");
		expect(rejectThirdPartyOAuthSpendingChange(oauth("phaseo_cli").value as any, "")?.status).toBe(403);
		for (const client of ["phaseo_cli", "aistats_cli", "phaseo_desktop"]) {
			state.auth = oauth(client);
			expect((await call("/", validRequest())).status).toBe(201);
		}
		expect(rpcCalls("create_api_key_request").map((args: Row) => args.p_client_name)).toEqual(["Phaseo CLI", "Phaseo CLI", "Phaseo desktop app"]);
	});

	it("lets a third-party app ask, named as itself on the approval page", async () => {
		state.auth = oauth("partner_app");
		const response = await call("/", validRequest());
		expect(response.status).toBe(201);
		expect(rpcCalls("create_api_key_request")[0]).toMatchObject({ p_client_name: "Partner Agent", p_oauth_client_id: "partner_app" });
	});

	it("keeps a third-party app in its own workspace; the CLI may name another of the person's workspaces", async () => {
		state.auth = oauth("partner_app");
		expect((await call("/", validRequest({ workspace_id: OTHER_WORKSPACE }))).status).toBe(403);
		state.auth = oauth("phaseo_cli");
		expect((await call("/", validRequest({ workspace_id: OTHER_WORKSPACE }))).status).toBe(201);
		expect(rpcCalls("create_api_key_request").at(-1)?.p_workspace_id).toBe(OTHER_WORKSPACE);
	});

	it("needs keys:write and a person behind the token", async () => {
		state.auth = oauth("phaseo_cli", { oauthScopes: ["keys:read"] });
		expect((await call("/", validRequest())).status).toBe(403);
		state.auth = oauth("phaseo_cli", { userId: null });
		expect((await call("/", validRequest())).status).toBe(403);
		expect(state.rpc).not.toHaveBeenCalled();
	});

	it.each([
		["no spending limit", { limits: {} }],
		["an unknown limit", { limits: { monthly_cost_usd: 100, requests: 10 } }],
		["a negative cap", { limits: { monthly_cost_usd: -1 } }],
		["a huge cap", { limits: { monthly_cost_usd: 1_000_000 } }],
		["a plain challenge", { code_challenge: "not-a-challenge" }],
		["the plain method", { code_challenge_method: "plain" }],
		["a long lifetime", { expires_in_days: 400 }],
		["no name", { name: " " }],
		["the chat's managed key name", { name: "__chat_route_managed_key__" }],
		["the Slack agent's managed key name", { name: "__slack_agent_managed_key__" }],
		["another reserved name", { name: " __phaseo_internal__ " }],
	])("refuses %s", async (_label, extra) => {
		const response = await call("/", validRequest(extra));
		expect(response.status).toBe(400);
		expect(state.rpc).not.toHaveBeenCalled();
	});

	it("maps the database's role and open-request checks", async () => {
		state.rpc = vi.fn(async () => ({ data: null, error: { message: "api_key_request_forbidden" } }));
		expect((await call("/", validRequest())).status).toBe(403);
		state.rpc = vi.fn(async () => ({ data: null, error: { message: "api_key_request_limit" } }));
		expect((await call("/", validRequest())).status).toBe(429);
	});

	it("has no way to approve or deny a request through the gateway API, whatever the token", async () => {
		for (const auth of [oauth("phaseo_cli"), oauth("partner_app"), { ok: true, value: { workspaceId: WORKSPACE, authMethod: "api_key", userId: USER, scopes: ["keys:write"], requestId: "r" } }]) {
			state.auth = auth;
			for (const action of ["approve", "deny", ""]) {
				const response = await call(`/${REQUEST}${action ? `/${action}` : ""}`, {}, action ? "POST" : "PATCH");
				expect(response.status).toBe(404);
			}
		}
		expect(state.rpc).not.toHaveBeenCalled();
	});
});

describe("POST /v1/key-requests/:id/token", () => {
	beforeEach(() => {
		state.auth = oauth("phaseo_cli");
		state.bindings = { KEY_PEPPER_ACTIVE: "test-pepper-active" };
		state.keys = [{ id: KEY, workspace_id: WORKSPACE, name: "Phaseo CLI: Codex API Key", prefix: "abcdef", expires_at: "2027-02-04T00:00:00.000Z", daily_limit_cost_nanos: 0, monthly_limit_cost_nanos: 100_000_000_000 }];
		state.keysReadFails = false;
		state.audit = vi.fn(async () => true);
	});

	const collect = (outcome: string, extra: Row = {}) => {
		state.rpc = vi.fn(async () => ({ data: [{ outcome, workspace_id: null, key_id: null, secret_ciphertext: null, ...extra }], error: null }));
		return call(`/${REQUEST}/token`, { code_verifier: VERIFIER });
	};

	it("returns the secret to the requester holding the verifier, with the key's limits", async () => {
		const response = await collect("approved", APPROVED_ROW);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			request_id: REQUEST, status: "approved", final: true, key: PLAINTEXT, key_id: KEY, workspace_id: WORKSPACE,
			name: "Phaseo CLI: Codex API Key", prefix: "abcdef", expires_at: "2027-02-04T00:00:00.000Z",
			limits: { daily_cost_usd: null, monthly_cost_usd: 100 },
		});
		// The database compares the S256 challenge of the verifier, for this user.
		expect(rpcCalls("collect_api_key_request")).toEqual([{
			p_request_id: REQUEST, p_user_id: USER, p_requester_credential: "oauth:phaseo_cli", p_requester_workspace_id: WORKSPACE, p_code_challenge: CHALLENGE,
		}]);
	});

	it("binds pickup to the client and token workspace that asked; a refreshed token of the same client still matches", async () => {
		const callers = [
			oauth("phaseo_cli", { requestId: "refreshed-token" }),
			oauth("partner_app"),
			oauth("phaseo_cli", { workspaceId: OTHER_WORKSPACE }),
			{ ok: true, value: { workspaceId: WORKSPACE, authMethod: "api_key", apiKeyId: "mk_1", userId: USER, scopes: ["keys:write"], requestId: "r" } },
		];
		const seen: Row[] = [];
		for (const auth of callers) {
			state.auth = auth;
			expect((await collect("not_found")).status).toBe(404);
			seen.push(...rpcCalls("collect_api_key_request"));
		}
		expect(seen.map((args) => [args.p_requester_credential, args.p_requester_workspace_id])).toEqual([
			["oauth:phaseo_cli", WORKSPACE],
			["oauth:partner_app", WORKSPACE],
			["oauth:phaseo_cli", OTHER_WORKSPACE],
			["api_key:mk_1", WORKSPACE],
		]);
	});

	it("records the management key that asked, so only it can collect", async () => {
		state.auth = { ok: true, value: { workspaceId: WORKSPACE, authMethod: "api_key", apiKeyId: "mk_1", userId: USER, scopes: ["keys:write"], requestId: "r" } };
		state.rpc = vi.fn(async () => ({ data: [{ id: REQUEST, expires_at: "2026-11-06T20:10:00.000Z" }], error: null }));
		expect((await call("/", validRequest())).status).toBe(201);
		expect(rpcCalls("create_api_key_request")[0]).toMatchObject({ p_requested_via: "management_key", p_requester_credential: "api_key:mk_1", p_requester_workspace_id: WORKSPACE });
	});

	it("hands over the key even when a later database read or the audit write would fail: the secret is already wiped", async () => {
		state.keysReadFails = true;
		state.audit = vi.fn(async () => { throw new Error("audit insert failed"); });
		const response = await collect("approved", APPROVED_ROW);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "approved", key: PLAINTEXT, key_id: KEY, name: "Phaseo CLI: Codex API Key", prefix: "abcdef",
			expires_at: "2027-02-04T00:00:00.000Z", limits: { daily_cost_usd: null, monthly_cost_usd: 100 },
		});
	});

	it("opens a secret sealed before a pepper rotation", async () => {
		state.bindings = { KEY_PEPPER_ACTIVE: "new-pepper", KEY_PEPPER_PREVIOUS: "test-pepper-active" };
		const response = await collect("approved", APPROVED_ROW);
		expect((await response.json() as Row).key).toBe(PLAINTEXT);
	});

	it("never returns a secret sealed for another request or with another pepper", async () => {
		state.bindings = { KEY_PEPPER_ACTIVE: "other-pepper" };
		const response = await collect("approved", APPROVED_ROW);
		expect(response.status).toBe(500);
		expect(await response.text()).not.toContain("phaseo_v1_sk");
	});

	it.each([
		["pending", 200, { status: "pending", final: false, poll_interval: 3 }],
		["denied", 200, { status: "denied", final: true }],
		["expired", 200, { status: "expired", final: true }],
		["collected", 200, { status: "collected", final: true }],
		["slow_down", 429, { error: "slow_down", poll_interval: 3 }],
		["invalid_verifier", 400, { error: "invalid_verifier" }],
		["not_found", 404, { error: "not_found" }],
	])("reports %s without a secret", async (outcome, status, expected) => {
		const response = await collect(outcome);
		expect(response.status).toBe(status);
		const body = await response.json() as Row;
		expect(body).toMatchObject(expected);
		expect(body).not.toHaveProperty("key");
	});

	it("refuses a malformed verifier before touching the request", async () => {
		state.rpc = vi.fn();
		const response = await call(`/${REQUEST}/token`, { code_verifier: "short" });
		expect(response.status).toBe(400);
		expect(state.rpc).not.toHaveBeenCalled();
	});

	it("needs a person behind the token, so the database can match the requester", async () => {
		state.auth = oauth("phaseo_cli", { userId: "" });
		state.rpc = vi.fn();
		expect((await call(`/${REQUEST}/token`, { code_verifier: VERIFIER })).status).toBe(403);
		expect(state.rpc).not.toHaveBeenCalled();
	});
});
