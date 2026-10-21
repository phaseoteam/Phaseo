import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	inserted: null as Record<string, unknown> | null,
	audits: [] as Array<Record<string, unknown>>,
	rpcs: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

const localPreset = { id: "local_1", workspace_id: "workspace_1", name: "@local", slug: "local", description: null, config: {}, visibility: "private", created_by: "user_1", source_preset_id: "source_1", source_preset_version_id: "version_1", upstream_version_id: "version_1", active_version_id: "local_version_1", versioning_method: "sequential" };
const publicPreset = { id: "source_1", workspace_id: "workspace_2", name: "@source", slug: "source", description: "Source", config: { temperature: 0.2 }, visibility: "public", created_by: "user_2", active_version_id: "version_1" };
const publicVersion = { id: "version_2", preset_id: "source_1", version_number: 2, version_label: "2", versioning_method: "sequential", name: "@source", slug: "source", description: "Source v2", config: { temperature: 0.4 }, visibility: "public", release_notes: "Update", created_by: "user_2", created_at: "2026-08-30T00:00:00Z" };

function query(table: string) {
	const filters = new Map<string, unknown>();
	let columns = "";
	let operation = "select";
	let payload: Record<string, unknown> | null = null;
	const value: any = {};
	value.select = (next: string) => { columns = next; return value; };
	value.eq = (key: string, item: unknown) => { filters.set(key, item); return value; };
	for (const method of ["neq", "is", "or", "order", "range", "in"]) value[method] = () => value;
	value.insert = (next: Record<string, unknown>) => { operation = "insert"; payload = next; state.inserted = next; return value; };
	value.update = (next: Record<string, unknown>) => { operation = "update"; payload = next; return value; };

	function terminal() {
		if (table === "workspaces") return { data: { publisher_handle: "phaseo-team" }, error: null };
		if (table === "preset_versions") {
			if (filters.get("id") === "version_2") return { data: publicVersion, error: null };
			return { data: [publicVersion], error: null };
		}
		if (table === "presets") {
			if (operation === "insert") return { data: { ...localPreset, id: "fork_1", name: payload?.name, slug: payload?.slug, config: payload?.config, source_preset_version_id: payload?.source_preset_version_id, upstream_version_id: payload?.upstream_version_id }, error: null };
			if (columns === "name") return { data: [{ name: "@existing" }], error: null };
			if (columns === "id") return { data: null, error: null };
			if (filters.get("id") === "source_1") return { data: publicPreset, error: null };
			if (filters.get("id") === "local_1") return { data: localPreset, error: null };
			return { data: null, error: null };
		}
		if (table === "workspace_audit_events") return { data: null, error: null };
		return { data: null, error: null };
	}

	value.maybeSingle = async () => terminal();
	value.single = async () => terminal();
	value.then = (resolve: (input: unknown) => unknown, reject: (error: unknown) => unknown) => {
		if (table === "workspace_audit_events" && operation === "insert" && payload) state.audits.push(payload);
		return Promise.resolve(terminal()).then(resolve, reject);
	};
	return value;
}

const supabase = () => ({
	from(table: string) {
		if (table === "workspace_audit_events") {
			return { insert: async (payload: Record<string, unknown>) => { state.audits.push(payload); return { error: null }; } };
		}
		return query(table);
	},
	rpc: async (name: string, args: Record<string, unknown>) => {
		state.rpcs.push({ name, args });
		return { data: name === "publish_preset_version" ? publicVersion : null, error: null };
	},
});

vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => supabase() }));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: async () => ({ ok: true, value: { workspaceId: "workspace_1", userId: "user_1", requestId: "request_1" } }) }));
vi.mock("./route-helpers", () => ({
	requireCapability: () => null,
	requireOAuthWorkspaceRole: async () => null,
	internalServerError: (_name: string, error: unknown) => new Response(JSON.stringify({ error: String(error) }), { status: 500 }),
}));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (request: Request) => Promise<Response>) => (context: any) => handler(context.req.raw),
}));

describe("preset lifecycle management", () => {
	beforeEach(() => {
		state.inserted = null;
		state.audits.length = 0;
		state.rpcs.length = 0;
		vi.resetModules();
	});

	it("lists immutable preset versions", async () => {
		const { presetsRoutes } = await import("./presets");
		const response = await presetsRoutes.request("https://example.com/local_1/versions");
		const body = await response.json() as Record<string, any>;
		expect(response.status).toBe(200);
		expect(body.data[0]).toMatchObject({ id: "version_2", version_number: 2, visibility: "public" });
	});

	it("forks a selected public version into the management workspace", async () => {
		const { presetsRoutes } = await import("./presets");
		const response = await presetsRoutes.request("https://example.com/source_1/fork", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ source_version_id: "version_2" }),
		});
		expect(response.status).toBe(201);
		expect(state.inserted).toMatchObject({ workspace_id: "workspace_1", visibility: "private", source_preset_id: "source_1", source_preset_version_id: "version_2" });
		expect(state.audits[0]).toMatchObject({ action: "preset.forked", target_id: "fork_1" });
	});

	it("applies a public upstream version to a local fork draft", async () => {
		const { presetsRoutes } = await import("./presets");
		const response = await presetsRoutes.request("https://example.com/local_1/upstream", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ version_id: "version_2" }),
		});
		expect(response.status).toBe(200);
		expect(state.rpcs[0]).toMatchObject({ name: "apply_preset_upstream_version", args: { target_preset_id: "local_1", target_version_id: "version_2" } });
		expect(state.audits[0]).toMatchObject({ action: "preset.upstream.applied" });
	});

	it("rejects an invalid prompt template on create and lists every problem", async () => {
		const { presetsRoutes } = await import("./presets");
		const response = await presetsRoutes.request("https://example.com/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "@triage", config: { prompt: { messages: [{ role: "user", content: "{{#open}}" }], variables: { level: { type: "enum" } } } } }),
		});
		const body = await response.json() as Record<string, any>;
		expect(response.status).toBe(400);
		expect(body.error).toBe("invalid_prompt_template");
		expect(body.issues.map((issue: any) => issue.keyword)).toEqual(["template_variable_spec", "template_syntax"]);
		expect(state.inserted).toBeNull();
	});

	it("rejects an invalid prompt template merged into a draft update", async () => {
		const { presetsRoutes } = await import("./presets");
		const response = await presetsRoutes.request("https://example.com/local_1", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ config: { prompt: { messages: [{ role: "narrator", content: "x" }] } } }),
		});
		expect(response.status).toBe(400);
		expect((await response.json() as Record<string, any>).issues[0].path).toEqual(["prompt", "messages", 0, "role"]);
	});

	it("updates the workspace publisher handle through its guarded RPC", async () => {
		const { presetsRoutes } = await import("./presets");
		const response = await presetsRoutes.request("https://example.com/publisher", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ handle: "new-team" }),
		});
		expect(response.status).toBe(200);
		expect(state.rpcs[0]).toMatchObject({ name: "rename_workspace_publisher_handle", args: { target_workspace_id: "workspace_1", requested_handle: "new-team" } });
		expect(state.audits[0]).toMatchObject({ action: "preset.publisher.updated" });
	});
});
