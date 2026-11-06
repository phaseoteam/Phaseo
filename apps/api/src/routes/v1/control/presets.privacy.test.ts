import { beforeEach, describe, expect, it, vi } from "vitest";

// Private presets, and private drafts of shared presets, belong to their creator on the management API too.
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
	userId: "teammate" as string | null,
	presets: [] as Row[],
	versions: [] as Row[],
	labels: [] as Row[],
	rpcs: [] as Array<{ name: string; args: Row }>,
	/** Rows the real audit writer inserted into workspace_audit_events. */
	audits: [] as Row[],
	/** Every database query, in order: table, operation and each builder call with its arguments. */
	queries: [] as Array<{ table: string; operation: string; calls: string[] }>,
	/** Auth and role checks, in order. */
	authCalls: [] as string[],
	/** Runs just before the next preset update, to change the row between the read and the write. */
	beforeUpdate: null as null | (() => void),
	/** Runs just after the next preset update, to change the row before anything reads it again. */
	afterUpdate: null as null | (() => void),
}));

const CREATOR = "creator";
const teamPresetWithPrivateDraft = () => ({
	id: "shared_1", workspace_id: "workspace_1", created_by: CREATOR, visibility: "team", archived_at: null,
	name: "@shared", slug: "shared", description: "Published description", config: { models: ["openai/published"] },
	draft_name: "@secret-draft", draft_slug: "secret-draft", draft_description: "Secret description", draft_config: { models: ["openai/secret"] }, draft_visibility: "private",
	active_version_id: null, versioning_method: "sequential",
});
const privatePreset = () => ({
	id: "private_1", workspace_id: "workspace_1", created_by: CREATOR, visibility: "private", archived_at: null,
	name: "@private", slug: "private", description: "Secret", config: { models: ["openai/secret"] },
	draft_name: "@private", draft_slug: "private", draft_description: "Secret", draft_config: { models: ["openai/secret"] }, draft_visibility: "private",
	active_version_id: null, versioning_method: "sequential",
});
const teamPreset = () => ({ ...teamPresetWithPrivateDraft(), id: "team_1", name: "@team", slug: "team", draft_name: "@team", draft_slug: "team", draft_description: "Published description", draft_config: { models: ["openai/published"] }, draft_visibility: "team" });

/** PostgREST-style condition: column.op.value with eq, neq and is.null. As in SQL, eq and neq never match NULL. */
function holds(row: Row, condition: string) {
	const [column, op, ...rest] = condition.split(".");
	const value = rest.join(".");
	if (op === "is" && value === "null") return row[column] === null || row[column] === undefined;
	if (row[column] === null || row[column] === undefined) return false;
	if (op === "eq") return String(row[column]) === value;
	if (op === "neq") return String(row[column]) !== value;
	throw new Error(`unsupported condition ${condition}`);
}

function query(table: string) {
	const conditions: Array<(row: Row) => boolean> = [];
	let operation: "select" | "update" = "select";
	let payload: Row = {};
	let head = false;
	const calls: string[] = [];
	const builder: any = {};
	builder.select = (_columns: string, options?: { count?: string }) => { head = Boolean(options?.count); return builder; };
	builder.eq = (column: string, value: unknown) => { conditions.push((row) => row[column] !== null && row[column] !== undefined && String(row[column]) === String(value)); return builder; };
	builder.neq = (column: string, value: unknown) => { conditions.push((row) => holds(row, `${column}.neq.${value}`)); return builder; };
	builder.is = (column: string, value: unknown) => { conditions.push((row) => (value === null ? row[column] === null || row[column] === undefined : row[column] === value)); return builder; };
	builder.or = (expression: string) => { const parts = expression.split(","); conditions.push((row) => parts.some((part) => holds(row, part))); return builder; };
	builder.in = (column: string, values: unknown[]) => { conditions.push((row) => values.map(String).includes(String(row[column]))); return builder; };
	builder.order = () => builder;
	builder.range = () => builder;
	builder.update = (next: Row) => { operation = "update"; payload = next; return builder; };
	const rowsOf: Record<string, Row[]> = { presets: state.presets, preset_versions: state.versions, preset_version_labels: state.labels };
	const matching = () => (rowsOf[table] ?? []).filter((row) => conditions.every((check) => check(row)));
	function run() {
		state.queries.push({ table, operation, calls: [...calls] });
		if (table === "workspaces") return { data: { publisher_handle: "team" }, error: null };
		if (!rowsOf[table]) return { data: null, error: null };
		if (operation === "update") {
			state.beforeUpdate?.();
			state.beforeUpdate = null;
			const rows = matching();
			for (const row of rows) Object.assign(row, payload);
			// RETURNING: the rows as this update left them.
			const returned = rows.map((row) => ({ ...row }));
			state.afterUpdate?.();
			state.afterUpdate = null;
			return { data: returned, error: null };
		}
		const rows = matching();
		return { data: rows.map((row) => ({ ...row })), error: null, count: head ? rows.length : undefined };
	}
	// Record every builder call (wrapped after definition so each keeps its behaviour).
	for (const name of ["select", "eq", "neq", "is", "or", "in", "order", "range", "update"]) {
		const original = builder[name];
		builder[name] = (...args: unknown[]) => { calls.push(`${name}(${JSON.stringify(args)})`); return original(...args); };
	}
	builder.maybeSingle = async () => { const result = run(); return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }; };
	builder.single = builder.maybeSingle;
	builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject);
	return builder;
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		from: (table: string) => (table === "workspace_audit_events" ? { insert: async (row: Row) => { state.audits.push(row); return { error: null }; } } : query(table)),
		rpc: async (name: string, args: Row) => {
			state.rpcs.push({ name, args });
			if (name !== "set_preset_version_label") return { data: null, error: null };
			return { data: { label: args.p_label, version_id: args.p_version_id, updated_by: args.actor_user_id, created_at: null, updated_at: null }, error: null };
		},
	}),
}));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: async () => { state.authCalls.push("guardManagementAuth"); return { ok: true, value: { workspaceId: "workspace_1", userId: state.userId, requestId: "request_1", authMethod: "oauth" } }; } }));
vi.mock("./route-helpers", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	requireCapability: (_auth: unknown, capability: string) => { state.authCalls.push(`requireCapability:${capability}`); return null; },
	requireOAuthWorkspaceRole: async (_auth: unknown, _workspace: string, roles: string[]) => { state.authCalls.push(`requireOAuthWorkspaceRole:${roles.join("|")}`); return null; },
	internalServerError: (_name: string, error: unknown) => new Response(JSON.stringify({ error: String(error) }), { status: 500 }),
}));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (request: Request) => Promise<Response>) => (context: any) => handler(context.req.raw),
}));

async function request(path: string, init?: RequestInit) {
	const { presetsRoutes } = await import("./presets");
	return presetsRoutes.request(`https://example.com${path}`, init);
}
const patch = (path: string, body: Row) => request(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("preset privacy on the management API", () => {
	beforeEach(() => {
		state.userId = "teammate";
		state.presets = [teamPresetWithPrivateDraft(), privatePreset(), teamPreset()];
		state.beforeUpdate = null;
		state.afterUpdate = null;
		state.rpcs = [];
		state.audits = [];
		state.queries = [];
		state.authCalls = [];
		state.versions = [
			{ id: "version_2", preset_id: "team_1", version_number: 2, version_label: "v2", visibility: "team", config: { models: ["openai/published"] } },
			{ id: "50000000-0000-4000-8000-000000000001", preset_id: "team_1", version_number: 1, version_label: "v1", visibility: "private", config: { models: ["openai/secret-v1"], prompt: { messages: [{ role: "system", content: "Secret prompt" }] } } },
		];
		state.labels = [
			{ preset_id: "team_1", label: "production", version_id: "50000000-0000-4000-8000-000000000001", updated_by: CREATOR, created_at: null, updated_at: null },
			{ preset_id: "team_1", label: "staging", version_id: "version_2", updated_by: CREATOR, created_at: null, updated_at: null },
		];
	});

	it("lists a shared preset's private draft to other members as the published preset", async () => {
		const response = await request("/");
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).not.toMatch(/secret/i);
		const shared = (JSON.parse(text).data as Row[]).find((row) => row.id === "shared_1");
		expect(shared).toMatchObject({ name: "@shared", config: { models: ["openai/published"] }, visibility: "team" });
	});

	it.each(["shared_1", "shared", "@shared"])("returns the published preset to other members when looked up by %s", async (identifier) => {
		const response = await request(`/${encodeURIComponent(identifier)}`);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).not.toMatch(/secret/i);
		expect(JSON.parse(text).data).toMatchObject({ id: "shared_1", name: "@shared", visibility: "team" });
	});

	it.each(["private_1", "private", "@private"])("hides a teammate's private preset looked up by %s", async (identifier) => {
		expect((await request(`/${encodeURIComponent(identifier)}`)).status).toBe(404);
	});

	it("still shows the creator their private preset and draft", async () => {
		state.userId = CREATOR;
		await expect((await request("/shared_1")).json()).resolves.toMatchObject({ data: { name: "@secret-draft", visibility: "private" } });
		expect((await request("/private_1")).status).toBe(200);
	});

	it("doesn't let another admin change, re-share or delete a private draft or preset", async () => {
		const response = await patch("/shared_1", { visibility: "team" });
		expect(response.status).toBe(403);
		expect(state.presets.find((row) => row.id === "shared_1")).toMatchObject({ draft_visibility: "private", draft_name: "@secret-draft" });
		expect((await patch("/private_1", { name: "@mine" })).status).toBe(404);
		expect((await request("/private_1", { method: "DELETE" })).status).toBe(404);
		expect(state.presets.find((row) => row.id === "private_1")).toMatchObject({ archived_at: null, name: "@private" });
	});

	it("checks the draft's privacy again in the write, so a draft made private since the read is kept", async () => {
		state.beforeUpdate = () => Object.assign(state.presets.find((row) => row.id === "team_1")!, { draft_visibility: "private", draft_name: "@secret-now" });
		const response = await patch("/team_1", { visibility: "public" });
		expect(response.status).toBe(409);
		expect(state.presets.find((row) => row.id === "team_1")).toMatchObject({ draft_visibility: "private", draft_name: "@secret-now" });
	});

	it("keeps a version published while the preset was private from other members after a shared version follows it", async () => {
		const versions = await request("/team_1/versions");
		expect(versions.status).toBe(200);
		const versionsText = await versions.text();
		expect(versionsText).not.toMatch(/50000000-0000-4000-8000-000000000001|secret|production/i);
		expect(JSON.parse(versionsText).data).toMatchObject([{ id: "version_2", labels: ["staging"] }]);
		const labels = await request("/team_1/labels");
		expect(await labels.json()).toEqual({ data: [expect.objectContaining({ label: "staging", version_id: "version_2" })] });

		state.userId = CREATOR;
		expect(((await (await request("/team_1/versions")).json()) as { data: Row[] }).data.map((version) => version.id)).toEqual(["version_2", "50000000-0000-4000-8000-000000000001"]);
		expect(((await (await request("/team_1/labels")).json()) as { data: Row[] }).data).toHaveLength(2);
	});

	it("doesn't let another admin point a label at a private version, or name it in the response", async () => {
		// v1 (private, still labelled production) then v2 (shared); an admin who didn't create the preset.
		const put = (body: Row) => request("/team_1/labels/probe", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		for (const body of [{ version: "production" }, { version: "v1" }, { version_id: "50000000-0000-4000-8000-000000000001" }]) {
			const response = await put(body);
			expect(response.status, JSON.stringify(body)).toBe(404);
			const text = await response.text();
			expect(text).not.toMatch(/50000000-0000-4000-8000-000000000001|"version_number":1|"v1"/);
			expect(JSON.parse(text).error).toBe("preset_version_not_found");
		}
		expect(state.rpcs).toEqual([]);
		// A shared version still works, and its response names only that version.
		const shared = await put({ version: "staging" });
		expect(shared.status).toBe(200);
		expect(await shared.json()).toMatchObject({ data: { label: "probe", version_id: "version_2", version_number: 2, version_label: "v2" } });
		// The creator can point a label at their private version.
		state.userId = CREATOR;
		state.rpcs = [];
		const own = await put({ version: "production" });
		expect(own.status).toBe(200);
		expect(state.rpcs[0]).toMatchObject({ name: "set_preset_version_label", args: { p_version_id: "50000000-0000-4000-8000-000000000001" } });
	});

	it("never writes a private version's id into the workspace audit feed", async () => {
		const put = (path: string, body: Row) => request(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		// An admin moves production from the private v1 to the shared v2.
		expect((await put("/team_1/labels/production", { version: "staging" })).status).toBe(200);
		expect(state.audits.at(-1)).toMatchObject({ action: "preset.label.set", metadata: { label: "production", version_id: "version_2", previous_version: "private" } });
		// The creator points a label at the private v1: the event still names no private version.
		state.userId = CREATOR;
		expect((await put("/team_1/labels/probe", { version: "v1" })).status).toBe(200);
		expect(state.audits.at(-1)).toMatchObject({ action: "preset.label.set", metadata: { label: "probe", version: "private", previous_version_id: null } });
		expect(JSON.stringify(state.audits)).not.toContain("50000000-0000-4000-8000-000000000001");
	});

	it("returns the row its update wrote, not a later change it may not show", async () => {
		// The creator makes the preset private right after this admin's update lands.
		state.afterUpdate = () => Object.assign(state.presets.find((row) => row.id === "team_1")!, { visibility: "private", draft_visibility: "private", draft_name: "@secret-now", draft_config: { models: ["openai/secret-now"] } });
		const response = await patch("/team_1", { description: "Clearer" });
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).not.toMatch(/secret/i);
		expect(JSON.parse(text).data).toMatchObject({ id: "team_1", name: "@team", description: "Clearer", visibility: "team" });
	});

	it("refuses to archive a preset made private since the read, unless you created it", async () => {
		state.beforeUpdate = () => Object.assign(state.presets.find((row) => row.id === "team_1")!, { visibility: "private" });
		expect((await request("/team_1", { method: "DELETE" })).status).toBe(409);
		expect(state.presets.find((row) => row.id === "team_1")).toMatchObject({ archived_at: null });
		state.userId = CREATOR;
		expect((await request("/team_1", { method: "DELETE" })).status).toBe(200);
		expect(state.presets.find((row) => row.id === "team_1")!.archived_at).toBeTruthy();
	});

	it("still lets an admin edit a shared preset with no draft visibility yet (only the is.null branch matches it)", async () => {
		Object.assign(state.presets.find((row) => row.id === "team_1")!, { draft_visibility: null });
		const response = await patch("/team_1", { description: "From null" });
		expect(response.status).toBe(200);
		expect(state.presets.find((row) => row.id === "team_1")).toMatchObject({ draft_description: "From null" });
	});

	describe("a teammate's private preset and a missing one look the same", () => {
		const json = (body: Row) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		const cases: Array<[string, string, RequestInit | undefined]> = [
			["read", "/private_1", undefined],
			["read by slug", "/private", undefined],
			["update", "/private_1", { method: "PATCH", ...json({ description: "Mine" }) }],
			["archive", "/private_1", { method: "DELETE" }],
			["publish", "/private_1/versions", { method: "POST", ...json({}) }],
			["list versions", "/private_1/versions", undefined],
			["list labels", "/private_1/labels", undefined],
			["set a label", "/private_1/labels/probe", { method: "PUT", ...json({ version: "v1" }) }],
			["remove a label", "/private_1/labels/probe", { method: "DELETE" }],
			["apply upstream", "/private_1/upstream", { method: "POST", ...json({ version_id: "50000000-0000-4000-8000-000000000009" }) }],
		];
		async function observe(path: string, init: RequestInit | undefined, exists: boolean) {
			state.presets = [teamPresetWithPrivateDraft(), ...(exists ? [privatePreset()] : []), teamPreset()];
			state.queries = [];
			state.authCalls = [];
			state.rpcs = [];
			const response = await request(path, init);
			return {
				status: response.status,
				body: await response.text(),
				headers: Object.fromEntries(response.headers.entries()),
				authCalls: [...state.authCalls],
				queries: state.queries.map((query) => ({ ...query })),
				rpcs: [...state.rpcs],
			};
		}
		it.each(cases)("%s: same status, body, headers, auth checks and queries", async (_label, path, init) => {
			const hidden = await observe(path, init, true);
			const missing = await observe(path, init, false);
			expect(hidden.status).toBe(404);
			expect(hidden).toEqual(missing);
		});
	});

	it("lets the creator publish their own private draft", async () => {
		state.userId = CREATOR;
		const response = await request("/shared_1/versions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
		expect(response.status).toBe(201);
		expect(state.rpcs).toEqual([expect.objectContaining({ name: "publish_preset_version", args: expect.objectContaining({ target_preset_id: "shared_1", actor_user_id: CREATOR }) })]);
	});

	it("says there's nothing to publish for a shared preset whose draft is unchanged", async () => {
		const response = await request("/team_1/versions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({ error: "conflict", message: "No draft changes to publish" });
		expect(state.rpcs).toEqual([]);
	});

	it("only forks public presets, and only their public versions", async () => {
		state.presets.push({ id: "public_1", workspace_id: "workspace_2", created_by: "someone", visibility: "public", archived_at: null, name: "@public", slug: "public", description: null, config: {}, active_version_id: "pv_public" });
		state.versions.push(
			{ id: "pv_public", preset_id: "public_1", version_number: 1, version_label: "v1", visibility: "public", name: "@public", slug: "public", description: null, config: {} },
			{ id: "pv_team", preset_id: "public_1", version_number: 2, version_label: "v2", visibility: "team", name: "@public", slug: "public", description: null, config: { secret: true } },
		);
		const fork = (id: string, body: Row = {}) => request(`/${id}/fork`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		const presetCount = state.presets.length;
		for (const id of ["private_1", "team_1", "missing_1"]) {
			const response = await fork(id);
			expect(response.status, id).toBe(404);
			await expect(response.json()).resolves.toEqual({ error: "not_found", message: "Public source preset not found" });
		}
		const hiddenVersion = await fork("public_1", { source_version_id: "pv_team" });
		expect(hiddenVersion.status).toBeGreaterThanOrEqual(400);
		expect(hiddenVersion.status).toBeLessThan(500);
		expect(await hiddenVersion.text()).not.toContain("secret");
		expect(state.presets).toHaveLength(presetCount);
	});

	describe("writes on a teammate's private preset read as missing", () => {
		const put = (path: string, body: Row) => request(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		const post = (path: string, body: Row) => request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		it.each([
			["publish a version", () => post("/private_1/versions", {})],
			["set a label", () => put("/private_1/labels/probe", { version: "v1" })],
			["remove a label", () => request("/private_1/labels/probe", { method: "DELETE" })],
			["apply an upstream version", () => post("/private_1/upstream", { version_id: "50000000-0000-4000-8000-000000000009" })],
		])("%s: the same 404 as a missing preset, and no database call", async (_label, run) => {
			const response = await run();
			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toEqual({ error: "not_found", message: "Preset not found" });
			expect(state.rpcs).toEqual([]);
		});

		it("refuses to publish a teammate's private draft before looking at it", async () => {
			// shared_1 is a team preset whose draft is private; its draft differs from the published preset.
			const response = await post("/shared_1/versions", {});
			expect(response.status).toBe(403);
			await expect(response.json()).resolves.toEqual({ error: "forbidden" });
			expect(state.rpcs).toEqual([]);
		});
	});

	it("still lets an admin edit a shared preset", async () => {
		const response = await patch("/team_1", { description: "Clearer" });
		expect(response.status).toBe(200);
		expect(state.presets.find((row) => row.id === "team_1")).toMatchObject({ draft_description: "Clearer" });
	});
});
