import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTROL_CAPABILITIES } from "@/lib/authz/capabilities";
import { guardManagementAuth } from "@/pipeline/before/guards";
import { getSupabaseActor } from "@/lib/oauth/service";
import { isThirdPartyOAuthApp } from "./route-helpers";

// Every control-API write that could create, re-enable or reshape something that spends the workspace's
// money, or change a limit on that spending, refuses an app that signs in with Phaseo, and only such an app.
// Supabase is a recording fake: the guard must refuse before anything is written. Its auth accepts any
// JWT-shaped token as user_1's, as the auth provider accepts the tokens its OAuth server issues to apps.

const state = vi.hoisted(() => ({
	auth: null as Record<string, unknown> | null,
	writes: [] as Array<{ table: string; op: string }>,
}));

const ROWS: Record<string, Record<string, unknown>> = {
	workspace_members: { workspace_id: "ws_1", user_id: "user_1", role: "owner" },
	workspaces: { id: "ws_1", slug: "ws", name: "Workspace", owner_user_id: "user_1" },
	keys: {
		id: "key_1", workspace_id: "ws_1", kid: "kid_1", hash: "hash_1", name: "OAuth: partner_app", prefix: "phaseo_v1_sk_1",
		status: "active", scopes: "[]", soft_blocked: false, expires_at: null, storage_locations: [], ip_allowlist: [],
		monthly_limit_cost_nanos: 20_000_000_000, key_kind: "oauth_delegated", oauth_client_id: "partner_app",
	},
	management_keys: { id: "mk_1", workspace_id: "ws_1", name: "Terraform", status: "active", scopes: "[\"keys:read\"]" },
	workload_identity_policies: {
		id: "00000000-0000-4000-8000-000000000001", workspace_id: "ws_1", key_id: "key_wi", name: "CI", provider: "github_actions",
		issuer: "https://token.actions.githubusercontent.com", pinned_owner_id: "1", claim_conditions: {}, max_token_lifetime_seconds: 3600,
		status: "disabled", keys: null,
	},
};

function query(table: string) {
	const row = ROWS[table] ?? null;
	const builder: any = new Proxy(function () {}, {
		get(_target, prop) {
			if (prop === "then") {
				return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
					Promise.resolve({ data: row ? [row] : [], error: null, count: 0 }).then(resolve, reject);
			}
			if (prop === "maybeSingle" || prop === "single") return async () => ({ data: row, error: null });
			if (prop === "insert" || prop === "update" || prop === "upsert" || prop === "delete") {
				return () => {
					state.writes.push({ table, op: String(prop) });
					return builder;
				};
			}
			return () => builder;
		},
	});
	return builder;
}

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindings: () => ({}),
	getSupabaseAdmin: () => ({
		auth: {
			getUser: async (token: string) => token.split(".").length === 3
				? { data: { user: { id: "user_1", factors: [], user_metadata: {} } }, error: null }
				: { data: { user: null }, error: { message: "invalid JWT" } },
		},
		from: (table: string) => query(table),
		rpc: async (name: string) => {
			state.writes.push({ table: name, op: "rpc" });
			return { data: null, error: null };
		},
	}),
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: vi.fn(async () => ({ ok: true, value: state.auth })),
}));

vi.mock("@/routes/utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/routes/utils")>()),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

vi.mock("@core/feature-flags", async (importOriginal) => ({
	...(await importOriginal<typeof import("@core/feature-flags")>()),
	isWorkloadIdentityAccessEnabled: vi.fn(async () => true),
}));

vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: vi.fn(async () => true) }));

const ALL_SCOPES = [...CONTROL_CAPABILITIES];
const caller = (overrides: Record<string, unknown>) => ({
	workspaceId: "ws_1", apiKeyId: "key_caller", internal: false, userId: "user_1", scopes: ALL_SCOPES, oauthScopes: ALL_SCOPES, ...overrides,
});
const PARTNER_APP = caller({ authMethod: "oauth", oauthClientId: "partner_app", apiKeyRef: "kid_app" });
const ALLOWED = {
	"the Phaseo CLI": caller({ authMethod: "oauth", oauthClientId: "phaseo_cli", apiKeyRef: "oauth_phaseo_cli" }),
	"the legacy CLI client": caller({ authMethod: "oauth", oauthClientId: "aistats_cli", apiKeyRef: "oauth_aistats_cli" }),
	"the desktop app": caller({ authMethod: "oauth", oauthClientId: "phaseo_desktop", apiKeyRef: "kid_desktop" }),
	"a dashboard session": caller({ authMethod: "oauth", apiKeyRef: "dashboard" }),
	"a management key": caller({ authMethod: "api_key", apiKeyRef: "mk_terraform" }),
};

type Case = { route: string; method: string; path: string; body?: unknown; refusal: string };
const loaders: Record<string, () => Promise<{ request: (input: string, init?: RequestInit) => Response | Promise<Response> }>> = {
	keys: async () => (await import("./keys")).keysRoutes,
	"management-keys": async () => (await import("./management-keys")).managementKeysRoutes,
	"workload-identity": async () => (await import("./workload-identity")).workloadIdentityRoutes,
	workspaces: async () => (await import("./workspaces")).workspacesRoutes,
	"workspace-membership": async () => (await import("./workspace-membership")).workspaceMembershipRoutes,
	identity: async () => (await import("./identity")).identityRoutes,
	"enterprise-directory": async () => (await import("./enterprise-directory")).enterpriseDirectoryRoutes,
	guardrails: async () => (await import("./guardrails")).guardrailsRoutes,
	budgets: async () => (await import("./budgets")).budgetsRoutes,
	"department-budgets": async () => (await import("./department-budgets")).departmentBudgetsRoutes,
	"rate-limits": async () => (await import("./rate-limits")).rateLimitsRoutes,
	"spend-rules": async () => (await import("./spend-rules")).spendRulesRoutes,
	"spend-blocks": async () => (await import("./spend-blocks")).spendBlocksRoutes,
	routing: async () => (await import("./routing")).routingRoutes,
	settings: async () => (await import("./settings")).settingsRoutes,
};

const POLICY = "00000000-0000-4000-8000-000000000001";
const BLOCK = "00000000-0000-4000-8000-000000000002";
const CASES: Case[] = [
	// API keys: an app may only rename or delete them.
	{ route: "keys", method: "POST", path: "/", body: { name: "Unlimited" }, refusal: "can't create API keys" },
	{ route: "keys", method: "POST", path: "/hash_1/rotate", refusal: "can't rotate or replace API keys" },
	...[
		{ limit: null }, { limit: 500, limit_reset: "monthly" }, { limits: { monthly: { cost: 1000 } } }, { soft_blocked: false },
		{ disabled: false }, { disabled: true }, { expires_at: "2099-01-01T00:00:00.000Z" }, { expires_at: null },
		{ department_id: null }, { ip_allowlist: [] },
	].map((body) => ({ route: "keys", method: "PATCH", path: "/hash_1", body, refusal: "can only rename API keys" })),
	// Management keys: one with keys:write mints API keys with no limit.
	{ route: "management-keys", method: "POST", path: "/", body: { name: "Escape hatch", scopes: ["keys:write"] }, refusal: "can't create management keys" },
	...[{ scopes: ["keys:write"] }, { template: "read-write" }, { paused: false }, { monthlyCostNanos: 0 }, { softBlocked: false }, { expires_at: null }]
		.map((body) => ({ route: "management-keys", method: "PATCH", path: "/mk_1", body, refusal: "can only rename management keys" })),
	// Trusted workloads: each policy owns a key with no spending limit.
	{
		route: "workload-identity", method: "POST", path: "/policies",
		body: { name: "Attacker CI", provider: "github_actions", owner_id: "999" }, refusal: "can't create trusted workloads",
	},
	...[{ status: "active" }, { name: "Renamed" }, { claim_conditions: {} }]
		.map((body) => ({ route: "workload-identity", method: "PATCH", path: `/policies/${POLICY}`, body, refusal: "can't change trusted workloads" })),
	// Members and the identity providers that add them.
	{ route: "workspaces", method: "POST", path: "/ws_1/members/add", body: { user_ids: ["user_2"], role: "admin" }, refusal: "can't add members" },
	{ route: "workspace-membership", method: "PATCH", path: "/ws_1/members/user_2", body: { role: "admin" }, refusal: "can't change members' roles" },
	{ route: "workspace-membership", method: "POST", path: "/ws_1/invites", body: { role: "admin" }, refusal: "can't invite members" },
	{ route: "workspace-membership", method: "POST", path: "/ws_1/join-requests/req_1/approve", refusal: "can't approve join requests" },
	{ route: "identity", method: "PUT", path: "/sso", body: {}, refusal: "can't change single sign-on or SCIM" },
	{ route: "identity", method: "PUT", path: "/scim", body: {}, refusal: "can't change single sign-on or SCIM" },
	{ route: "identity", method: "POST", path: "/scim/tokens", body: {}, refusal: "can't change single sign-on or SCIM" },
	...[
		["PUT", "/directory/members/user_2"], ["POST", "/departments"], ["PATCH", "/departments/dep_1"], ["DELETE", "/departments/dep_1"],
		["PUT", "/departments/dep_1/members/user_2"], ["DELETE", "/departments/dep_1/members/user_2"], ["POST", "/group-mappings"],
		["PATCH", "/group-mappings/map_1"], ["DELETE", "/group-mappings/map_1"],
	].map(([method, path]) => ({ route: "enterprise-directory", method, path, body: {}, refusal: "can't change the member directory or departments" })),
	// Limits on spending and usage.
	...[
		["POST", "/"], ["PATCH", "/gr_1"], ["DELETE", "/gr_1"], ["POST", "/gr_1/keys/add"], ["POST", "/gr_1/keys/remove"],
		["POST", "/gr_1/members/add"], ["POST", "/gr_1/members/remove"], ["PUT", "/gr_1/keys"],
	].map(([method, path]) => ({ route: "guardrails", method, path, body: {}, refusal: "can't change guardrails" })),
	...["budgets", "department-budgets"].flatMap((route) => [["POST", "/"], ["PATCH", `/${POLICY}`], ["DELETE", `/${POLICY}`]]
		.map(([method, path]) => ({ route, method, path, body: {}, refusal: route === "budgets" ? "can't change budgets" : "can't change department budgets" }))),
	...[
		["POST", "/policies"], ["PATCH", "/policies/pol_1"], ["DELETE", "/policies/pol_1"],
		["POST", "/assignments"], ["PATCH", "/assignments/as_1"], ["DELETE", "/assignments/as_1"],
	].map(([method, path]) => ({ route: "rate-limits", method, path, body: {}, refusal: "can't change rate limits" })),
	{ route: "rate-limits", method: "POST", path: "/tier/raise", body: {}, refusal: "can't raise the workspace's rate limit tier" },
	...[["POST", "/"], ["PATCH", `/${POLICY}`], ["DELETE", `/${POLICY}`], ["POST", `/${POLICY}/test`]]
		.map(([method, path]) => ({ route: "spend-rules", method, path, body: {}, refusal: "can't change spend rules" })),
	{ route: "spend-blocks", method: "POST", path: `/${BLOCK}/lift`, body: {}, refusal: "can't lift spend blocks" },
	// Workspace price limits: auto-routing's spend profile and price ceilings (either spelling), what a successor
	// redirect may cost (a workspace's own replacement ignores that policy), and BYOK fallback to credits.
	...[
		{ spend_profile: "unrestricted" }, { spendProfile: "premium" }, { max_input_price_per_million: 1000 },
		{ maxInputPricePerMillion: 1000 }, { max_output_price_per_million: 1000 }, { maxOutputPricePerMillion: 1000 },
		{ spend_profile: "custom", max_input_price_per_million: 100, max_output_price_per_million: 100 },
		{ objective: "quality", spend_profile: "economy" },
	].map((body) => ({ route: "routing", method: "PATCH", path: "/auto", body, refusal: "can't change auto-routing's spend profile or price limits" })),
	{
		route: "routing", method: "PUT", path: "/successor/replacements",
		body: { model: "openai/gpt-4", successor: "openai/gpt-5" }, refusal: "can't save successor replacements",
	},
	...[
		{ model_successor_price_policy: "any" }, { modelSuccessorPricePolicy: "any" }, { model_successor_max_price_increase_percent: 1000 },
		{ modelSuccessorMaxPriceIncreasePercent: 1000 }, { byok_fallback_enabled: true }, { byokFallbackEnabled: true },
		{ routing_mode: "price", model_successor_price_policy: "limit" },
	].map((body) => ({ route: "settings", method: "PATCH", path: "/", body, refusal: "can't change the successor price policy or BYOK fallback to credits" })),
];

async function send(testCase: Case, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> | null }> {
	const routes = await loaders[testCase.route]();
	const response = await routes.request(`https://example.com${testCase.path}`, {
		method: testCase.method,
		headers: { "content-type": "application/json", ...headers },
		...(testCase.body === undefined ? {} : { body: JSON.stringify(testCase.body) }),
	});
	return { status: response.status, body: await response.json().catch(() => null) };
}

const label = (testCase: Case) => `${testCase.method} ${testCase.route}${testCase.path} ${testCase.body ? JSON.stringify(testCase.body) : ""}`;

describe("apps that use Sign in with Phaseo can't create or reshape what spends the workspace's money", () => {
	beforeEach(() => {
		state.writes.length = 0;
		state.auth = null;
	});

	it.each(CASES.map((testCase) => [label(testCase), testCase] as const))("refuses %s", async (_name, testCase) => {
		state.auth = PARTNER_APP;
		const { status, body } = await send(testCase);
		expect(status).toBe(403);
		expect(body).toMatchObject({ error: "forbidden" });
		expect(String(body?.message)).toContain(`Apps that use Sign in with Phaseo ${testCase.refusal}`);
		expect(state.writes).toEqual([]);
	});

	it("breaks the chain from an app's OAuth token to an unlimited API key at every link", async () => {
		state.auth = PARTNER_APP;
		// A management key it made could mint unlimited keys as an API key, outside any app check.
		expect((await send({ route: "management-keys", method: "POST", path: "/", body: { name: "m", scopes: ["keys:write"] }, refusal: "" })).status).toBe(403);
		// It can't mint one itself, rotate one into a fresh key, or lift its own key's limit.
		expect((await send({ route: "keys", method: "POST", path: "/", body: { name: "k" }, refusal: "" })).status).toBe(403);
		expect((await send({ route: "keys", method: "POST", path: "/hash_1/rotate", refusal: "" })).status).toBe(403);
		expect((await send({ route: "keys", method: "PATCH", path: "/hash_1", body: { limit: null }, refusal: "" })).status).toBe(403);
		// Nor make itself, or anyone it controls, a member who could.
		expect((await send({ route: "workspace-membership", method: "POST", path: "/ws_1/invites", body: { role: "admin" }, refusal: "" })).status).toBe(403);
		expect(state.writes).toEqual([]);
	});

	// keys.management.test.ts follows a rename through to its 200; here, the guard lets it reach the update.
	it("still lets an app rename its key", async () => {
		state.auth = PARTNER_APP;
		const { body } = await send({ route: "keys", method: "PATCH", path: "/hash_1", body: { name: "Renamed" }, refusal: "" });
		expect(String(body?.message ?? "")).not.toContain("Sign in with Phaseo");
		expect(state.writes).toContainEqual({ table: "keys", op: "update" });
	});

	it("still lets an app change routing and settings that aren't limits on spending", async () => {
		state.auth = PARTNER_APP;
		for (const testCase of [
			{ route: "routing", method: "PATCH", path: "/auto", body: { objective: "quality", allowed_patterns: ["openai/*"], allow_fallbacks: false }, refusal: "" },
			{ route: "routing", method: "DELETE", path: "/successor/replacements?model=openai%2Fgpt-4", refusal: "" },
			{ route: "settings", method: "PATCH", path: "/", body: { routing_mode: "price", privacy_zdr_only: true, model_successor_redirect_enabled: true }, refusal: "" },
		]) {
			const { body } = await send(testCase);
			expect(String(body?.message ?? ""), label(testCase)).not.toContain("Sign in with Phaseo");
		}
		expect(state.writes).toContainEqual({ table: "workspace_settings", op: "upsert" });
	});

	it.each(Object.entries(ALLOWED))("leaves %s to the usual scope and role checks", async (_name, auth) => {
		for (const testCase of CASES) {
			state.auth = auth;
			const { body } = await send(testCase);
			expect(String(body?.message ?? ""), label(testCase)).not.toContain("Sign in with Phaseo");
		}
	});
});

// The auth provider's OAuth server issues Supabase access tokens to apps as well, with the app's client_id.
// Sent with the workspace header, such a token must not pass as the person's dashboard session, which carries
// every scope the route has and is never an app. Unsigned here: the fake's getUser stands in for the signature.
function supabaseToken(claims: Record<string, unknown>): string {
	const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "user_1", aud: "authenticated", role: "authenticated", ...claims })}.signature`;
}
const DASHBOARD_CASES: Case[] = [
	{ route: "rate-limits", method: "POST", path: "/policies", body: {}, refusal: "can't change rate limits" },
	{ route: "rate-limits", method: "POST", path: "/tier/raise", body: {}, refusal: "can't raise the workspace's rate limit tier" },
	{ route: "workload-identity", method: "POST", path: "/policies", body: { name: "CI", provider: "github_actions", owner_id: "999" }, refusal: "can't create trusted workloads" },
];

describe("tokens the auth provider issued to apps, at the dashboard-session boundary", () => {
	beforeEach(() => {
		state.writes.length = 0;
		state.auth = null;
		vi.mocked(guardManagementAuth).mockClear();
	});

	it.each(DASHBOARD_CASES.map((testCase) => [label(testCase), testCase] as const))(
		"judges a third-party app's token as that app, not as the person: %s",
		async (_name, testCase) => {
			// What management authentication makes of the app's token: an OAuth caller with the app's client ID.
			state.auth = PARTNER_APP;
			const token = supabaseToken({ client_id: "partner_app", user_id: "user_1", workspace_id: "ws_1" });
			const { status, body } = await send(testCase, { authorization: `Bearer ${token}`, "x-phaseo-workspace-id": "ws_1" });
			expect(guardManagementAuth).toHaveBeenCalled();
			expect(status).toBe(403);
			expect(String(body?.message)).toContain(`Apps that use Sign in with Phaseo ${testCase.refusal}`);
			expect(state.writes).toEqual([]);
		},
	);

	it.each([
		["the person's own session", {}],
		["the Phaseo CLI's token", { client_id: "phaseo_cli" }],
		["the desktop app's token", { client_id: "phaseo_desktop" }],
	])("keeps %s a dashboard session", async (_name, claims) => {
		for (const testCase of DASHBOARD_CASES) {
			const token = supabaseToken(claims);
			const { body } = await send(testCase, { authorization: `Bearer ${token}`, "x-phaseo-workspace-id": "ws_1" });
			expect(String(body?.message ?? ""), label(testCase)).not.toContain("Sign in with Phaseo");
		}
		expect(guardManagementAuth).not.toHaveBeenCalled();
	});

	it("reads the client from the token: none for the person, Phaseo's own apps kept, anything else refused", async () => {
		expect(await getSupabaseActor(supabaseToken({ aal: "aal2" }))).toMatchObject({ userId: "user_1", clientId: null, assuranceLevel: "aal2" });
		expect(await getSupabaseActor(supabaseToken({ client_id: "phaseo_cli" }))).toMatchObject({ userId: "user_1", clientId: "phaseo_cli" });
		expect(await getSupabaseActor(supabaseToken({ client_id: "aistats_cli" }))).toMatchObject({ clientId: "aistats_cli" });
		expect(await getSupabaseActor(supabaseToken({ client_id: "phaseo_desktop" }))).toMatchObject({ clientId: "phaseo_desktop" });
		for (const clientId of ["partner_app", "", " ", 42, { id: "phaseo_cli" }]) {
			expect(await getSupabaseActor(supabaseToken({ client_id: clientId })), JSON.stringify(clientId)).toBeNull();
		}
		expect(await getSupabaseActor("not-a-token")).toBeNull();
	});
});

describe("isThirdPartyOAuthApp", () => {
	it("is true only for OAuth clients other than Phaseo's own", () => {
		expect(isThirdPartyOAuthApp({ authMethod: "oauth", oauthClientId: "partner_app" })).toBe(true);
		expect(isThirdPartyOAuthApp({ authMethod: "oauth", oauthClientId: " phaseo_cli " })).toBe(false);
		expect(isThirdPartyOAuthApp({ authMethod: "oauth", oauthClientId: "aistats_cli" })).toBe(false);
		expect(isThirdPartyOAuthApp({ authMethod: "oauth", oauthClientId: "phaseo_desktop" })).toBe(false);
		expect(isThirdPartyOAuthApp({ authMethod: "oauth", apiKeyRef: "dashboard" })).toBe(false);
		expect(isThirdPartyOAuthApp({ authMethod: "oauth", apiKeyRef: "dashboard", oauthClientId: "phaseo_desktop" })).toBe(false);
		expect(isThirdPartyOAuthApp({ authMethod: "oauth", apiKeyRef: "dashboard", oauthClientId: "partner_app" })).toBe(true);
		expect(isThirdPartyOAuthApp({ authMethod: "api_key" })).toBe(false);
		expect(isThirdPartyOAuthApp({})).toBe(false);
	});

	it("treats an OAuth caller without a client as an app, unless it is a dashboard session", () => {
		expect(isThirdPartyOAuthApp({ authMethod: "oauth" })).toBe(true);
		expect(isThirdPartyOAuthApp({ authMethod: "oauth", oauthClientId: "", apiKeyRef: "kid_x" })).toBe(true);
	});
});
