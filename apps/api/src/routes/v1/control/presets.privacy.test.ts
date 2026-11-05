import { beforeEach, describe, expect, it, vi } from "vitest";

// Private presets, and private drafts of shared presets, belong to their creator on the management API too.
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
	userId: "teammate" as string | null,
	presets: [] as Row[],
	/** Runs just before the next preset update, to change the row between the read and the write. */
	beforeUpdate: null as null | (() => void),
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
	builder.order = () => builder;
	builder.range = () => builder;
	builder.update = (next: Row) => { operation = "update"; payload = next; return builder; };
	const matching = () => (table === "presets" ? state.presets : []).filter((row) => conditions.every((check) => check(row)));
	function run() {
		if (table === "workspaces") return { data: { publisher_handle: "team" }, error: null };
		if (table !== "presets") return { data: null, error: null };
		if (operation === "update") {
			state.beforeUpdate?.();
			state.beforeUpdate = null;
			const rows = matching();
			for (const row of rows) Object.assign(row, payload);
			return { data: rows.map((row) => ({ id: row.id })), error: null };
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
		rpc: async () => ({ data: null, error: null }),
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

	it("still lets an admin edit a shared preset", async () => {
		const response = await patch("/team_1", { description: "Clearer" });
		expect(response.status).toBe(200);
		expect(state.presets.find((row) => row.id === "team_1")).toMatchObject({ draft_description: "Clearer" });
	});
});
