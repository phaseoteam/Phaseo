import { beforeEach, describe, expect, it, vi } from "vitest";

// Private presets, and private drafts of shared presets, belong to their creator on the management API too.
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
	userId: "teammate" as string | null,
	presets: [] as Row[],
	versions: [] as Row[],
	labels: [] as Row[],
	rpcs: [] as Array<{ name: string; args: Row }>,
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

/** PostgREST-style condition: column.op.value with eq, neq and is.null. */
function holds(row: Row, condition: string) {
	const [column, op, ...rest] = condition.split(".");
	const value = rest.join(".");
	if (op === "is" && value === "null") return row[column] === null || row[column] === undefined;
	if (op === "eq") return String(row[column]) === value;
	if (op === "neq") return row[column] === null || row[column] === undefined ? true : String(row[column]) !== value;
	throw new Error(`unsupported condition ${condition}`);
}

function query(table: string) {
	const conditions: Array<(row: Row) => boolean> = [];
	let operation: "select" | "update" = "select";
	let payload: Row = {};
	let head = false;
	const builder: any = {};
	builder.select = (_columns: string, options?: { count?: string }) => { head = Boolean(options?.count); return builder; };
	builder.eq = (column: string, value: unknown) => { conditions.push((row) => String(row[column]) === String(value)); return builder; };
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
	builder.maybeSingle = async () => { const result = run(); return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }; };
	builder.single = builder.maybeSingle;
	builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject);
	return builder;
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		from: (table: string) => (table === "workspace_audit_events" ? { insert: async () => ({ error: null }) } : query(table)),
		rpc: async (name: string, args: Row) => {
			state.rpcs.push({ name, args });
			if (name !== "set_preset_version_label") return { data: null, error: null };
			return { data: { label: args.p_label, version_id: args.p_version_id, updated_by: args.actor_user_id, created_at: null, updated_at: null }, error: null };
		},
	}),
}));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: async () => ({ ok: true, value: { workspaceId: "workspace_1", userId: state.userId, requestId: "request_1", authMethod: "oauth" } }) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: async () => undefined }));
vi.mock("./route-helpers", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	requireCapability: () => null,
	requireOAuthWorkspaceRole: async () => null,
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
		state.versions = [
			{ id: "version_2", preset_id: "team_1", version_number: 2, version_label: "v2", visibility: "team", config: { models: ["openai/published"] } },
			{ id: "version_1", preset_id: "team_1", version_number: 1, version_label: "v1", visibility: "private", config: { models: ["openai/secret-v1"], prompt: { messages: [{ role: "system", content: "Secret prompt" }] } } },
		];
		state.labels = [
			{ preset_id: "team_1", label: "production", version_id: "version_1", updated_by: CREATOR, created_at: null, updated_at: null },
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
		expect(versionsText).not.toMatch(/version_1|secret|production/i);
		expect(JSON.parse(versionsText).data).toMatchObject([{ id: "version_2", labels: ["staging"] }]);
		const labels = await request("/team_1/labels");
		expect(await labels.json()).toEqual({ data: [expect.objectContaining({ label: "staging", version_id: "version_2" })] });

		state.userId = CREATOR;
		expect(((await (await request("/team_1/versions")).json()) as { data: Row[] }).data.map((version) => version.id)).toEqual(["version_2", "version_1"]);
		expect(((await (await request("/team_1/labels")).json()) as { data: Row[] }).data).toHaveLength(2);
	});

	it("doesn't let another admin point a label at a private version, or name it in the response", async () => {
		// v1 (private, still labelled production) then v2 (shared); an admin who didn't create the preset.
		const put = (body: Row) => request("/team_1/labels/probe", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		for (const body of [{ version: "production" }, { version: "v1" }, { version_id: "version_1" }]) {
			const response = await put(body);
			expect(response.status, JSON.stringify(body)).toBe(404);
			const text = await response.text();
			expect(text).not.toMatch(/version_1|"version_number":1|"v1"/);
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
		expect(state.rpcs[0]).toMatchObject({ name: "set_preset_version_label", args: { p_version_id: "version_1" } });
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

	it("still lets an admin edit a shared preset", async () => {
		const response = await patch("/team_1", { description: "Clearer" });
		expect(response.status).toBe(200);
		expect(state.presets.find((row) => row.id === "team_1")).toMatchObject({ draft_description: "Clearer" });
	});
});
