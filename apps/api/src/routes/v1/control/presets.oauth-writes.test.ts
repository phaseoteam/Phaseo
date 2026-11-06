import { beforeEach, describe, expect, it, vi } from "vitest";

// A preset's config decides what every request that names it runs. Apps that sign in with Phaseo, and CLI or
// desktop sign-ins (public client IDs), may read presets and edit a draft's name and description, but not
// create, change, publish, relabel, fork or pull upstream into one, whatever the payload. Dashboard sessions
// and management keys make the same changes as before.

const WS = "00000000-0000-4000-8000-000000000010";
const USER = "00000000-0000-4000-8000-000000000020";
const PRESET = "00000000-0000-4000-8000-0000000000a1";
const SOURCE = "00000000-0000-4000-8000-0000000000a2";
const VERSION = "00000000-0000-4000-8000-0000000000b1";
const OLD_VERSION = "00000000-0000-4000-8000-0000000000b2";
const SCOPES = ["presets:read", "presets:write", "presets:delete"];

// Live configs the person set, and payloads that each loosened them past the earlier widening check.
const RESTRICTED = {
	model: "openai/gpt-5",
	responseCaching: { enabled: false },
	provider: { requireZeroDataRetention: true, requiredDataRegion: "eu", only: ["azure"], ignore: ["deepinfra"] },
	plugins: [{ id: "web", config: { engine: "native", allowed_domains: ["docs.example.com"] } }, { id: "web-fetch", enabled: false }],
};
const PAYLOADS: Record<string, Record<string, unknown>> = {
	"a server tool nested in parameters": { ...RESTRICTED, parameters: { tools: [{ type: "phaseo:web_fetch" }], plugins: [{ id: "web-fetch" }] } },
	"a server tool nested in defaultParams": { ...RESTRICTED, defaultParams: { tools: [{ type: "gateway:web_search" }] } },
	"a web plugin engine and domain change": { ...RESTRICTED, plugins: [{ id: "web", config: { engine: "direct", allowed_domains: ["collector.example.com"] } }, { id: "web-fetch", enabled: false }] },
	"removing a disabled plugin override": { ...RESTRICTED, plugins: [{ id: "web", config: { engine: "native", allowed_domains: ["docs.example.com"] } }] },
	"removing the provider region and allow/deny lists": { ...RESTRICTED, provider: { requireZeroDataRetention: true } },
	"a plain model change": { ...RESTRICTED, model: "openai/gpt-5-mini" },
};

type Write = { table: string; op: string; payload?: unknown };
const state = vi.hoisted(() => ({
	auth: null as any,
	writes: [] as Write[],
	rpcs: [] as Array<{ name: string; args: any }>,
	rows: {} as Record<string, Record<string, Record<string, unknown>>>,
	labels: [] as Array<Record<string, unknown>>,
	writeError: null as { code: string; message: string } | null,
}));

function query(table: string) {
	let wrote: Record<string, unknown> | null = null;
	let id: string | null = null;
	let presetId: string | null = null;
	const excluded: Array<[string, unknown]> = [];
	const q: any = {};
	for (const method of ["select", "in", "is", "or", "order", "range", "limit", "not"]) q[method] = () => q;
	q.eq = (column: string, value: unknown) => { if (column === "id") id = String(value); if (column === "preset_id") presetId = String(value); return q; };
	q.neq = (column: string, value: unknown) => { excluded.push([column, value]); return q; };
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
		const candidate = id ? state.rows[table]?.[id] ?? null : null;
		const found = candidate && !excluded.some(([column, value]) => candidate[column] === value) ? candidate : null;
		return found && presetId && found.preset_id && found.preset_id !== presetId ? null : found;
	};
	q.maybeSingle = async () => (wrote && state.writeError ? { data: null, error: state.writeError } : { data: row(), error: null });
	q.single = q.maybeSingle;
	// An awaited write returns the rows it wrote, as `update(...).select()` does.
	q.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
		Promise.resolve(wrote && state.writeError ? { data: null, error: state.writeError }
			: { data: wrote ? [wrote] : table === "preset_version_labels" ? state.labels : [], count: 0, error: null }).then(resolve, reject);
	return q;
}

vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/runtime/env", () => ({
	getBindings: () => ({}),
	getSupabaseAdmin: () => ({
		from: (table: string) => query(table),
		rpc: vi.fn(async (name: string, args: any) => {
			state.rpcs.push({ name, args });
			if (name === "publish_preset_version") return { data: [{ version_number: 2, version_label: "v2" }], error: null };
			if (name === "set_preset_version_label") return { data: [{ label: args.p_label, version_id: args.p_version_id, updated_by: USER, created_at: null, updated_at: null }], error: null };
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
const OAUTH = {
	"an app that signs in with Phaseo": { ok: true, value: { ...base, authMethod: "oauth", oauthClientId: "acme_reporting_app", apiKeyRef: "oauth_acme_reporting_app" } },
	"a CLI sign-in": { ok: true, value: { ...base, authMethod: "oauth", oauthClientId: "phaseo_cli", apiKeyRef: "oauth_phaseo_cli" } },
	"a desktop sign-in": { ok: true, value: { ...base, authMethod: "oauth", oauthClientId: "phaseo_desktop", apiKeyRef: "oauth_phaseo_desktop" } },
};
const ALLOWED = {
	"a management key": { ok: true, value: { ...base, authMethod: "api_key", oauthClientId: null, apiKeyRef: "kid_mgmt" } },
	"the person's dashboard session": { ok: true, value: { ...base, authMethod: "oauth", oauthClientId: null, apiKeyRef: "dashboard" } },
};

function setPreset(draft: unknown = RESTRICTED, overrides: Record<string, unknown> = {}) {
	state.rows = {
		presets: {
			[PRESET]: { id: PRESET, workspace_id: WS, name: "@support", slug: "support", description: null, config: RESTRICTED, draft_config: draft, draft_name: "@support", draft_slug: "support", draft_description: null, visibility: "team", draft_visibility: "team", source_preset_id: SOURCE, active_version_id: OLD_VERSION, versioning_method: "sequential", ...overrides },
			[SOURCE]: { id: SOURCE, workspace_id: "other", name: "@public", slug: "public", description: null, config: PAYLOADS["a web plugin engine and domain change"], visibility: "public", active_version_id: VERSION },
		},
		preset_versions: {
			[VERSION]: { id: VERSION, preset_id: PRESET, config: PAYLOADS["removing a disabled plugin override"] },
			[OLD_VERSION]: { id: OLD_VERSION, preset_id: PRESET, config: RESTRICTED },
		},
	};
	state.labels = [{ label: "production", version_id: OLD_VERSION, updated_by: USER, created_at: null, updated_at: null }];
}

type Case = { label: string; method: string; path: string; body?: unknown; draft?: unknown; persisted: () => void };
const write = (table: string, op: string) => state.writes.find((entry) => entry.table === table && entry.op === op);
const rpc = (name: string) => state.rpcs.find((entry) => entry.name === name);

const CASES: Case[] = [
	...Object.entries(PAYLOADS).flatMap(([name, config]): Case[] => [
		{ label: `create a preset with ${name}`, method: "POST", path: "/", body: { name: "@new", config },
			persisted: () => expect(write("presets", "insert")?.payload).toMatchObject({ config }) },
		{ label: `publish a draft with ${name}`, method: "POST", path: `/${PRESET}/versions`, body: {}, draft: config,
			persisted: () => expect(rpc("publish_preset_version")?.args).toMatchObject({ target_preset_id: PRESET, actor_user_id: USER }) },
		{ label: `replace a preset's config with ${name}`, method: "PATCH", path: `/${PRESET}`, body: { config, replace_config: true },
			persisted: () => expect(write("presets", "update")?.payload).toMatchObject({ draft_config: config }) },
	]),
	{ label: "merge parameters into a preset's config", method: "PATCH", path: `/${PRESET}`, body: { config: { parameters: { tools: [{ type: "phaseo:web_fetch" }] } } },
		persisted: () => expect((write("presets", "update")?.payload as any)?.draft_config).toMatchObject({ parameters: { tools: [{ type: "phaseo:web_fetch" }] } }) },
	{ label: "change a preset's slug", method: "PATCH", path: `/${PRESET}`, body: { slug: "support-v2" },
		persisted: () => expect(write("presets", "update")?.payload).toMatchObject({ draft_slug: "support-v2" }) },
	{ label: "make a preset public", method: "PATCH", path: `/${PRESET}`, body: { visibility: "public" },
		persisted: () => expect(write("presets", "update")?.payload).toMatchObject({ draft_visibility: "public" }) },
	{ label: "point a label at another version", method: "PUT", path: `/${PRESET}/labels/production`, body: { version_id: VERSION },
		persisted: () => expect(rpc("set_preset_version_label")?.args).toMatchObject({ p_preset_id: PRESET, p_label: "production", p_version_id: VERSION }) },
	{ label: "remove a label", method: "DELETE", path: `/${PRESET}/labels/production`,
		persisted: () => expect(rpc("remove_preset_version_label")?.args).toMatchObject({ p_preset_id: PRESET, p_label: "production" }) },
	{ label: "fork a public preset", method: "POST", path: `/${SOURCE}/fork`, body: {},
		persisted: () => expect(write("presets", "insert")?.payload).toMatchObject({ source_preset_id: SOURCE }) },
	{ label: "apply an upstream version", method: "POST", path: `/${PRESET}/upstream`, body: { version_id: VERSION },
		persisted: () => expect(rpc("apply_preset_upstream_version")?.args).toMatchObject({ target_preset_id: PRESET, target_version_id: VERSION }) },
	{ label: "archive a preset", method: "DELETE", path: `/${PRESET}`,
		persisted: () => expect((write("presets", "update")?.payload as any)?.archived_at).toEqual(expect.any(String)) },
];

async function send(testCase: { method: string; path: string; body?: unknown; draft?: unknown }) {
	const { presetsRoutes } = await import("./presets");
	const response = await presetsRoutes.request(`https://example.com${testCase.path}`, {
		method: testCase.method,
		headers: { "content-type": "application/json" },
		...(testCase.body === undefined ? {} : { body: JSON.stringify(testCase.body) }),
	});
	return { status: response.status, body: await response.json().catch(() => null) as any };
}

function reset() {
	state.writes.length = 0;
	state.rpcs.length = 0;
	state.writeError = null;
}

describe("OAuth callers can't change what a preset runs", () => {
	beforeEach(() => {
		reset();
		vi.resetModules();
	});

	for (const [caller, auth] of Object.entries(OAUTH)) {
		it.each(CASES)(`${caller} can't $label`, async (testCase) => {
			state.auth = auth;
			setPreset(testCase.draft);
			const { status, body } = await send(testCase);
			expect(status, JSON.stringify(body)).toBe(403);
			expect(body).toMatchObject({ error: "forbidden" });
			expect(String(body?.message)).toMatch(/Phaseo dashboard, or call the API with a management key\.$/);
			expect(state.writes).toEqual([]);
			expect(state.rpcs).toEqual([]);
		});
	}

	for (const [caller, auth] of Object.entries(ALLOWED)) {
		it.each(CASES)(`${caller} can $label`, async (testCase) => {
			state.auth = auth;
			setPreset(testCase.draft);
			const { status, body } = await send(testCase);
			expect(status, JSON.stringify(body)).toBeGreaterThanOrEqual(200);
			expect(status, JSON.stringify(body)).toBeLessThan(300);
			testCase.persisted();
		});
	}

	it("answers 409 when a new preset's slug matches another preset's except for case", async () => {
		state.auth = ALLOWED["a management key"];
		setPreset();
		state.writeError = { code: "23505", message: 'duplicate key value violates unique constraint "presets_workspace_resolution_key"' };
		const { status, body } = await send({ method: "POST", path: "/", body: { name: "@SUPPORT", config: RESTRICTED } });
		expect(status, JSON.stringify(body)).toBe(409);
		expect(body).toMatchObject({ error: "conflict", message: "Another preset in this workspace has the same slug, ignoring case" });
	});

	it("can't erase a label's baseline by deleting and recreating it", async () => {
		for (const auth of Object.values(OAUTH)) {
			state.auth = auth;
			setPreset();
			reset();
			expect((await send({ method: "DELETE", path: `/${PRESET}/labels/production` })).status).toBe(403);
			expect((await send({ method: "PUT", path: `/${PRESET}/labels/production`, body: { version_id: VERSION } })).status).toBe(403);
			expect(state.rpcs).toEqual([]);
		}
		state.auth = ALLOWED["the person's dashboard session"];
		setPreset();
		reset();
		expect((await send({ method: "DELETE", path: `/${PRESET}/labels/production` })).status).toBe(200);
		expect((await send({ method: "PUT", path: `/${PRESET}/labels/production`, body: { version_id: VERSION } })).status).toBe(200);
		expect(state.rpcs.map((entry) => entry.name)).toEqual(["remove_preset_version_label", "set_preset_version_label"]);
	});

	it.each(Object.entries(OAUTH))("%s can still read presets and edit a draft's name and description", async (_caller, auth) => {
		state.auth = auth;
		setPreset();
		expect((await send({ method: "GET", path: "/" })).status).toBe(200);
		expect((await send({ method: "GET", path: `/${PRESET}` })).status).toBe(200);
		reset();
		const renamed = await send({ method: "PATCH", path: `/${PRESET}`, body: { name: "@support-desk", description: "Answers support tickets" } });
		expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
		expect(write("presets", "update")?.payload).toMatchObject({ draft_name: "@support-desk", draft_description: "Answers support tickets" });
		expect((write("presets", "update")?.payload as any)?.draft_config).toBeUndefined();
	});

	it.each(Object.entries(OAUTH))("%s is refused a prohibited edit before the preset is read, so its privacy doesn't show", async (_caller, auth) => {
		state.auth = auth;
		const edit = async (path: string, body: Record<string, unknown>) => {
			reset();
			const result = await send({ method: "PATCH", path, body });
			expect(state.writes).toEqual([]);
			return result;
		};
		const prohibited = { config: { model: "openai/gpt-5-mini" } };
		const missing = await edit("/00000000-0000-4000-8000-0000000000ff", prohibited);
		expect(missing.status).toBe(403);
		expect(String(missing.body?.message)).toMatch(/Phaseo dashboard, or call the API with a management key\.$/);
		// Another person's private draft, and another person's private preset, answer exactly the same.
		setPreset(RESTRICTED, { draft_visibility: "private" });
		expect(await edit(`/${PRESET}`, prohibited)).toEqual(missing);
		setPreset(RESTRICTED, { visibility: "private", draft_visibility: "private" });
		expect(await edit(`/${PRESET}`, prohibited)).toEqual(missing);
		// The metadata edits apps may make still meet the privacy checks.
		setPreset(RESTRICTED, { draft_visibility: "private" });
		expect(await edit(`/${PRESET}`, { description: "Answers tickets" })).toMatchObject({ status: 403, body: { message: "Only the preset's creator can change its private draft" } });
		setPreset(RESTRICTED, { visibility: "private", draft_visibility: "private" });
		expect((await edit(`/${PRESET}`, { description: "Answers tickets" })).status).toBe(404);
	});

	it.each(Object.entries(OAUTH))("%s can't rename a preset the gateway finds by name", async (_caller, auth) => {
		state.auth = auth;
		setPreset(RESTRICTED, { slug: "", draft_slug: "" });
		reset();
		const renamed = await send({ method: "PATCH", path: `/${PRESET}`, body: { name: "@other" } });
		expect(renamed.status).toBe(403);
		expect(state.writes).toEqual([]);
		const described = await send({ method: "PATCH", path: `/${PRESET}`, body: { description: "Still fine" } });
		expect(described.status).toBe(200);
	});
});
