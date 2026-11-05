import { beforeEach, describe, expect, it, vi } from "vitest";
import { presetContentPolicy, widensPresetContentPolicy } from "./preset-content-policy";

// A preset's config decides, for every request that uses it, how long responses stay in the response cache,
// whether zero data retention applies, and whether web search or fetch can send content elsewhere. An app
// that signs in with Phaseo (or a CLI or desktop sign-in) must not widen any of these on any path that
// changes what callers get, judged on the effective config the gateway reads.

describe("presetContentPolicy and widensPresetContentPolicy", () => {
	it("reads both spellings and the gateway's defaults", () => {
		expect(presetContentPolicy({})).toEqual({ cacheTtlSeconds: 300, zeroDataRetention: false, webSearch: false, webFetch: false });
		expect(presetContentPolicy({ responseCaching: { ttlSeconds: 3600 } })?.cacheTtlSeconds).toBe(3600);
		expect(presetContentPolicy({ response_caching: { ttl_seconds: 3600 } })?.cacheTtlSeconds).toBe(3600);
		expect(presetContentPolicy({ responseCaching: { ttlSeconds: 10_000_000 } })?.cacheTtlSeconds).toBe(86_400);
		expect(presetContentPolicy({ responseCaching: { enabled: false, ttlSeconds: 3600 } })?.cacheTtlSeconds).toBe(0);
		expect(presetContentPolicy({ provider: { require_zero_data_retention: true } })?.zeroDataRetention).toBe(true);
		expect(presetContentPolicy({ plugins: ["web", { id: "web-fetch" }] })).toMatchObject({ webSearch: true, webFetch: true });
		expect(presetContentPolicy({ plugins: [{ id: "web", enabled: false }] })?.webSearch).toBe(false);
		expect(presetContentPolicy({ responseCaching: { enabled: "false" } })).toBeNull();
	});

	it.each([
		// [description, before, after, widens]
		["a new preset with no caching settings is the same as no preset", null, {}, false],
		["a new preset that caches for a day", null, { responseCaching: { ttlSeconds: 86_400 } }, true],
		["a new preset that caches for a day (snake_case)", null, { response_caching: { ttl_seconds: 86_400 } }, true],
		["a new preset whose TTL is a numeric string", null, { responseCaching: { ttlSeconds: "86400" } }, true],
		["a new preset with a TTL of 0 falls back to the default", null, { responseCaching: { ttlSeconds: 0 } }, false],
		["a new preset with a null TTL falls back to the default", null, { responseCaching: { enabled: true, ttlSeconds: null } }, false],
		["a new preset that turns caching off", null, { responseCaching: { enabled: false } }, false],
		["removing an explicit opt-out falls back to default caching", { responseCaching: { enabled: false } }, {}, true],
		["removing an opt-out written in snake_case", { response_caching: { enabled: false } }, { response_caching: null }, true],
		["keeping the opt-out in the other spelling", { responseCaching: { enabled: false } }, { response_caching: { enabled: false } }, false],
		["a shorter TTL", { responseCaching: { ttlSeconds: 600 } }, { responseCaching: { ttlSeconds: 60 } }, false],
		["a longer TTL", { responseCaching: { ttlSeconds: 60 } }, { response_caching: { ttl_seconds: 600 } }, true],
		["conflicting spellings: camelCase wins, as on requests", { responseCaching: { enabled: false } }, { responseCaching: { enabled: false }, response_caching: { ttl_seconds: 86_400 } }, false],
		["conflicting spellings with camelCase null", { responseCaching: { enabled: false } }, { responseCaching: null, response_caching: { ttl_seconds: 86_400 } }, true],
		["an unreadable caching value counts as widening", null, { responseCaching: { enabled: "false" } }, true],
		["dropping zero data retention", { provider: { requireZeroDataRetention: true, only: ["a"] } }, { provider: { only: ["a"] } }, true],
		["dropping zero data retention written in snake_case", { provider: { require_zero_data_retention: true } }, { provider: { require_zero_data_retention: false } }, true],
		["adding zero data retention", {}, { provider: { requireZeroDataRetention: true } }, false],
		["turning on web search", {}, { plugins: ["web"] }, true],
		["turning on web fetch", { plugins: ["web"] }, { plugins: ["web", { id: "web-fetch", config: { engine: "direct" } }] }, true],
		["a disabled web plugin", {}, { plugins: [{ id: "web", enabled: false }] }, false],
		["response healing is not content egress", {}, { plugins: ["response-healing"] }, false],
		["turning web search off", { plugins: ["web"] }, { plugins: [] }, false],
		["tightening the cache while turning on web search", { responseCaching: { ttlSeconds: 600 } }, { responseCaching: { enabled: false }, plugins: ["web"] }, true],
		["an unreadable old config is judged against no preset", { responseCaching: { enabled: "nope" } }, {}, false],
	])("%s", (_name, before, after, widens) => {
		expect(widensPresetContentPolicy(before, after)).toBe(widens);
	});
});

const WS = "00000000-0000-4000-8000-000000000010";
const USER = "00000000-0000-4000-8000-000000000020";
const PRESET = "00000000-0000-4000-8000-0000000000a1";
const SOURCE = "00000000-0000-4000-8000-0000000000a2";
const VERSION = "00000000-0000-4000-8000-0000000000b1";
const OLD_VERSION = "00000000-0000-4000-8000-0000000000b2";
const SCOPES = ["presets:read", "presets:write", "presets:delete"];
const LONG_CACHE = { responseCaching: { ttlSeconds: 86_400 } };
const NO_CACHE = { responseCaching: { enabled: false } };

type Write = { table: string; op: string; payload?: unknown };
const state = vi.hoisted(() => ({
	auth: null as any,
	writes: [] as Write[],
	rpcs: [] as Array<{ name: string; args: unknown }>,
	rows: {} as Record<string, Record<string, Record<string, unknown>>>,
	labels: [] as Array<Record<string, unknown>>,
}));

function query(table: string) {
	let wrote: Record<string, unknown> | null = null;
	let id: string | null = null;
	let excluded = false;
	const q: any = {};
	for (const method of ["select", "in", "is", "or", "order", "range", "limit", "not"]) q[method] = () => q;
	let presetId: string | null = null;
	q.eq = (column: string, value: unknown) => { if (column === "id") id = String(value); if (column === "preset_id") presetId = String(value); return q; };
	q.neq = () => { excluded = true; return q; };
	for (const op of ["insert", "update", "upsert", "delete"]) {
		q[op] = (payload?: unknown) => {
			state.writes.push({ table, op, payload });
			wrote = { id: PRESET, workspace_id: WS, ...(payload as Record<string, unknown>) };
			return q;
		};
	}
	const row = () => {
		if (wrote) return wrote;
		if (table === "workspaces") return { id: WS, publisher_handle: "acme" };
		if (table === "workspace_members") return { workspace_id: WS, user_id: USER, role: "owner" };
		const found = id && !excluded ? state.rows[table]?.[id] ?? null : null;
		return found && presetId && found.preset_id && found.preset_id !== presetId ? null : found;
	};
	q.maybeSingle = async () => ({ data: row(), error: null });
	q.single = async () => ({ data: row(), error: null });
	q.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
		Promise.resolve({ data: table === "preset_version_labels" ? state.labels : [], count: 0, error: null }).then(resolve, reject);
	return q;
}

vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/runtime/env", () => ({
	getBindings: () => ({}),
	getSupabaseAdmin: () => ({
		from: (table: string) => query(table),
		rpc: vi.fn(async (name: string, args: unknown) => {
			state.rpcs.push({ name, args });
			if (name === "publish_preset_version") return { data: [{ version_number: 2, version_label: "v2" }], error: null };
			if (name === "set_preset_version_label") return { data: [{ label: (args as any).p_label, version_id: (args as any).p_version_id, updated_by: USER, created_at: null, updated_at: null }], error: null };
			return { data: true, error: null };
		}),
	}),
}));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: vi.fn(async () => true) }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

const base = { workspaceId: WS, userId: USER, apiKeyId: "caller", apiKeyKid: "kid", internal: false, scopes: SCOPES, oauthScopes: SCOPES, requestId: "request_1" };
const APP = { ok: true, value: { ...base, authMethod: "oauth", oauthClientId: "acme_reporting_app", apiKeyRef: "oauth_acme_reporting_app" } };
const CLI = { ok: true, value: { ...base, authMethod: "oauth", oauthClientId: "phaseo_cli", apiKeyRef: "oauth_phaseo_cli" } };
const MANAGEMENT_KEY = { ok: true, value: { ...base, authMethod: "api_key", oauthClientId: null, apiKeyRef: "kid_mgmt" } };
const DASHBOARD = { ok: true, value: { ...base, authMethod: "oauth", oauthClientId: null, apiKeyRef: "dashboard" } };

function setPreset(live: unknown, draft: unknown = live) {
	state.rows = {
		presets: {
			[PRESET]: { id: PRESET, workspace_id: WS, name: "@support", slug: "support", description: null, config: live, draft_config: draft, draft_name: "@support", draft_slug: "support", draft_description: null, visibility: "team", draft_visibility: "team", source_preset_id: SOURCE, active_version_id: OLD_VERSION, versioning_method: "sequential" },
			[SOURCE]: { id: SOURCE, workspace_id: "other", name: "@public", slug: "public", description: null, config: LONG_CACHE, visibility: "public", active_version_id: VERSION },
		},
		preset_versions: {
			[VERSION]: { id: VERSION, preset_id: PRESET, config: LONG_CACHE },
			[OLD_VERSION]: { id: OLD_VERSION, preset_id: PRESET, config: NO_CACHE },
		},
	};
	state.labels = [{ label: "production", version_id: OLD_VERSION, updated_by: USER, created_at: null, updated_at: null }];
}

type Case = { label: string; method: string; path: string; body?: unknown; live: unknown; draft?: unknown; persisted: (writes: Write[], rpcs: Array<{ name: string; args: any }>) => void };
const WIDENING: Case[] = [
	{ label: "create a preset that caches for a day", method: "POST", path: "/", body: { name: "@cached", config: LONG_CACHE }, live: {},
		persisted: (writes) => expect(writes.find((w) => w.table === "presets" && w.op === "insert")?.payload).toMatchObject({ config: LONG_CACHE }) },
	{ label: "replace a preset config to drop its cache opt-out", method: "PATCH", path: `/${PRESET}`, body: { config: { model: "openai/gpt-5" }, replace_config: true }, live: NO_CACHE,
		persisted: (writes) => expect(writes.find((w) => w.table === "presets" && w.op === "update")?.payload).toMatchObject({ draft_config: { model: "openai/gpt-5" } }) },
	{ label: "merge a long cache over a snake_case opt-out", method: "PATCH", path: `/${PRESET}`, body: { config: { response_caching: { ttl_seconds: 86_400 } } }, live: { response_caching: { enabled: false } },
		persisted: (writes) => expect((writes.find((w) => w.table === "presets" && w.op === "update")?.payload as any)?.draft_config).toMatchObject({ response_caching: { ttl_seconds: 86_400 } }) },
	{ label: "turn on web fetch in a preset", method: "PATCH", path: `/${PRESET}`, body: { config: { plugins: [{ id: "web-fetch" }] } }, live: {},
		persisted: (writes) => expect((writes.find((w) => w.table === "presets" && w.op === "update")?.payload as any)?.draft_config).toMatchObject({ plugins: [{ id: "web-fetch" }] }) },
	{ label: "publish a draft that caches for a day", method: "POST", path: `/${PRESET}/versions`, body: {}, live: NO_CACHE, draft: LONG_CACHE,
		persisted: (_writes, rpcs) => expect(rpcs.find((r) => r.name === "publish_preset_version")?.args).toMatchObject({ target_preset_id: PRESET, actor_user_id: USER }) },
	{ label: "point a label at a version that caches for a day", method: "PUT", path: `/${PRESET}/labels/production`, body: { version_id: VERSION }, live: NO_CACHE,
		persisted: (_writes, rpcs) => expect(rpcs.find((r) => r.name === "set_preset_version_label")?.args).toMatchObject({ p_preset_id: PRESET, p_label: "production", p_version_id: VERSION }) },
	{ label: "fork a public preset that caches for a day", method: "POST", path: `/${SOURCE}/fork`, body: {}, live: {},
		persisted: (writes) => expect(writes.find((w) => w.table === "presets" && w.op === "insert")?.payload).toMatchObject({ config: LONG_CACHE, source_preset_id: SOURCE }) },
	{ label: "apply an upstream version that caches for a day", method: "POST", path: `/${PRESET}/upstream`, body: { version_id: VERSION }, live: NO_CACHE,
		persisted: (_writes, rpcs) => expect(rpcs.find((r) => r.name === "apply_preset_upstream_version")?.args).toMatchObject({ target_preset_id: PRESET, target_version_id: VERSION }) },
];

async function send(testCase: Case) {
	setPreset(testCase.live, testCase.draft);
	// The upstream version belongs to the source preset.
	if (testCase.path.endsWith("/upstream")) state.rows.preset_versions[VERSION] = { id: VERSION, preset_id: SOURCE, config: LONG_CACHE };
	const { presetsRoutes } = await import("./presets");
	const response = await presetsRoutes.request(`https://example.com${testCase.path}`, {
		method: testCase.method,
		headers: { "content-type": "application/json" },
		...(testCase.body === undefined ? {} : { body: JSON.stringify(testCase.body) }),
	});
	return { status: response.status, body: await response.json().catch(() => null) as any };
}

describe("presets: apps can't make callers' requests keep more content or send it further", () => {
	beforeEach(() => {
		state.writes.length = 0;
		state.rpcs.length = 0;
		vi.resetModules();
	});

	it.each(WIDENING)("an app can't $label", async (testCase) => {
		state.auth = APP;
		const { status, body } = await send(testCase);
		expect(status, JSON.stringify(body)).toBe(403);
		expect(String(body?.message)).toMatch(/^Apps that use Sign in with Phaseo can't make a preset/);
		expect(state.writes).toEqual([]);
		expect(state.rpcs).toEqual([]);
	});

	it.each(WIDENING)("a CLI sign-in can't $label either", async (testCase) => {
		state.auth = CLI;
		const { status, body } = await send(testCase);
		expect(status, JSON.stringify(body)).toBe(403);
		expect(String(body?.message)).toMatch(/Phaseo CLI or desktop app sign-in/);
		expect(state.writes).toEqual([]);
		expect(state.rpcs).toEqual([]);
	});

	for (const [caller, auth] of [["a management key", MANAGEMENT_KEY], ["the person's dashboard session", DASHBOARD]] as const) {
		it.each(WIDENING)(`${caller} can $label`, async (testCase) => {
			state.auth = auth;
			const { status, body } = await send(testCase);
			expect(status, JSON.stringify(body)).toBeGreaterThanOrEqual(200);
			expect(status, JSON.stringify(body)).toBeLessThan(300);
			testCase.persisted(state.writes, state.rpcs);
		});
	}

	it.each([
		{ label: "create a preset with no caching settings", method: "POST", path: "/", body: { name: "@plain", config: { model: "openai/gpt-5" } }, live: {} },
		{ label: "merge a long snake_case TTL under a camelCase opt-out, which still wins", method: "PATCH", path: `/${PRESET}`, body: { config: { response_caching: { ttl_seconds: 86_400 } } }, live: NO_CACHE },
		{ label: "turn caching off", method: "PATCH", path: `/${PRESET}`, body: { config: NO_CACHE }, live: LONG_CACHE },
		{ label: "shorten the cache", method: "PATCH", path: `/${PRESET}`, body: { config: { responseCaching: { ttlSeconds: 60 } } }, live: LONG_CACHE },
		{ label: "rename a preset whose live config already caches", method: "PATCH", path: `/${PRESET}`, body: { name: "@renamed" }, live: LONG_CACHE },
		{ label: "publish a draft that keeps the opt-out", method: "POST", path: `/${PRESET}/versions`, body: {}, live: NO_CACHE, draft: { ...NO_CACHE, model: "openai/gpt-5" } },
		{ label: "point a label back at a version without caching", method: "PUT", path: `/${PRESET}/labels/production`, body: { version_id: OLD_VERSION }, live: NO_CACHE },
	] as Case[])("an app can still $label", async (testCase) => {
		state.auth = APP;
		const { status, body } = await send(testCase);
		expect(status, JSON.stringify(body)).toBeGreaterThanOrEqual(200);
		expect(status, JSON.stringify(body)).toBeLessThan(300);
		expect(state.writes.length + state.rpcs.length).toBeGreaterThan(0);
	});
});
