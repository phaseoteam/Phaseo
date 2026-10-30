import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	inserted: null as Record<string, unknown> | null,
	audits: [] as Array<Record<string, unknown>>,
	rpcs: [] as Array<{ name: string; args: Record<string, unknown> }>,
	labels: [] as Array<{ label: string; version_id: string; updated_by: string | null; created_at: string | null; updated_at: string | null }>,
	rpcErrors: {} as Record<string, string>,
	removed: true,
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
		if (table === "preset_version_labels") {
			if (filters.has("label")) return { data: state.labels.find((row) => row.label === filters.get("label")) ?? null, error: null };
			return { data: state.labels, error: null };
		}
		if (table === "preset_versions") {
			if (filters.has("version_label")) return { data: filters.get("version_label") === "v2" ? { id: "version_2" } : null, error: null };
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
		if (state.rpcErrors[name]) return { data: null, error: { message: state.rpcErrors[name] } };
		if (name === "set_preset_version_label") return { data: { label: args.p_label, version_id: args.p_version_id, updated_by: args.actor_user_id, created_at: "2026-10-27T00:00:00Z", updated_at: "2026-10-27T00:00:00Z" }, error: null };
		if (name === "remove_preset_version_label") return { data: state.removed, error: null };
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
		state.labels = [];
		state.rpcErrors = {};
		state.removed = true;
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

describe("preset version labels", () => {
	const VERSION_UUID = "7d0b6f0e-3c1a-4f0b-9a55-2f3c4d5e6f70";
	const put = (body: unknown) => ({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

	beforeEach(() => {
		state.audits.length = 0;
		state.rpcs.length = 0;
		state.labels = [];
		state.rpcErrors = {};
		state.removed = true;
		vi.resetModules();
	});

	it("lists each version with the labels that point at it", async () => {
		state.labels = [{ label: "production", version_id: "version_2", updated_by: "user_1", created_at: null, updated_at: null }];
		const { presetsRoutes } = await import("./presets");
		const body = await (await presetsRoutes.request("https://example.com/local_1/versions")).json() as Record<string, any>;
		expect(body.data[0]).toMatchObject({ id: "version_2", labels: ["production"] });
	});

	it("lists labels with the version they point at", async () => {
		state.labels = [{ label: "staging", version_id: "version_2", updated_by: "user_1", created_at: null, updated_at: "2026-10-27T00:00:00Z" }];
		const { presetsRoutes } = await import("./presets");
		const response = await presetsRoutes.request("https://example.com/local_1/labels");
		expect(response.status).toBe(200);
		expect((await response.json() as Record<string, any>).data).toEqual([{ label: "staging", version_id: "version_2", version_number: 2, version_label: "2", updated_by: "user_1", created_at: null, updated_at: "2026-10-27T00:00:00Z" }]);
	});

	it("points a label at a version given by its version label, and audits the move", async () => {
		state.labels = [{ label: "production", version_id: "version_3", updated_by: "user_1", created_at: null, updated_at: null }];
		const { presetsRoutes } = await import("./presets");
		const response = await presetsRoutes.request("https://example.com/local_1/labels/Production", put({ version: "v2" }));
		expect(response.status).toBe(200);
		expect((await response.json() as Record<string, any>).data).toMatchObject({ label: "production", version_id: "version_2", version_number: 2 });
		expect(state.rpcs[0]).toEqual({ name: "set_preset_version_label", args: { p_preset_id: "local_1", p_label: "production", p_version_id: "version_2", actor_user_id: "user_1" } });
		expect(state.audits[0]).toMatchObject({ action: "preset.label.set", metadata: { label: "production", version_id: "version_2", previous_version_id: "version_3" } });
	});

	it("points a label at a version id", async () => {
		const { presetsRoutes } = await import("./presets");
		const response = await presetsRoutes.request("https://example.com/local_1/labels/staging", put({ version_id: VERSION_UUID }));
		expect(response.status).toBe(200);
		expect(state.rpcs[0]?.args).toMatchObject({ p_label: "staging", p_version_id: VERSION_UUID });
	});

	it("accepts a label named labels on a preset reached through /presets", async () => {
		const { presetsRoutes } = await import("./presets");
		const response = await presetsRoutes.request("https://example.com/local_1/labels/labels", put({ version_id: VERSION_UUID }));
		expect(response.status).toBe(200);
		expect(state.rpcs[0]?.args).toMatchObject({ p_label: "labels", p_version_id: VERSION_UUID });
	});

	it("rejects labels that look like versions or break the format before calling the database", async () => {
		const { presetsRoutes } = await import("./presets");
		for (const label of ["v3", "1prod", "has space", "a".repeat(33)]) {
			const response = await presetsRoutes.request(`https://example.com/local_1/labels/${encodeURIComponent(label)}`, put({ version: "v2" }));
			expect(response.status).toBe(400);
			expect((await response.json() as Record<string, any>).error).toBe("invalid_preset_label");
		}
		expect(state.rpcs).toEqual([]);
	});

	it("needs exactly one of version_id and version", async () => {
		const { presetsRoutes } = await import("./presets");
		expect((await presetsRoutes.request("https://example.com/local_1/labels/production", put({}))).status).toBe(400);
		expect((await presetsRoutes.request("https://example.com/local_1/labels/production", put({ version: "v2", version_id: VERSION_UUID }))).status).toBe(400);
		expect(state.rpcs).toEqual([]);
	});

	it("returns 404 for a version that does not exist", async () => {
		const { presetsRoutes } = await import("./presets");
		const unknown = await presetsRoutes.request("https://example.com/local_1/labels/production", put({ version: "v9" }));
		expect(unknown.status).toBe(404);
		expect((await unknown.json() as Record<string, any>).error).toBe("preset_version_not_found");
		state.rpcErrors.set_preset_version_label = "preset_version_not_found";
		const fromDatabase = await presetsRoutes.request("https://example.com/local_1/labels/production", put({ version_id: VERSION_UUID }));
		expect(fromDatabase.status).toBe(404);
	});

	it("maps a refused label change to 403", async () => {
		state.rpcErrors.set_preset_version_label = "preset_label_forbidden";
		const { presetsRoutes } = await import("./presets");
		const response = await presetsRoutes.request("https://example.com/local_1/labels/production", put({ version_id: VERSION_UUID }));
		expect(response.status).toBe(403);
		expect(state.audits).toEqual([]);
	});

	it("removes a label, and returns 404 when there was none", async () => {
		const { presetsRoutes } = await import("./presets");
		const removed = await presetsRoutes.request("https://example.com/local_1/labels/staging", { method: "DELETE" });
		expect(removed.status).toBe(200);
		expect(state.rpcs[0]).toEqual({ name: "remove_preset_version_label", args: { p_preset_id: "local_1", p_label: "staging", actor_user_id: "user_1" } });
		expect(state.audits[0]).toMatchObject({ action: "preset.label.removed" });
		state.removed = false;
		expect((await presetsRoutes.request("https://example.com/local_1/labels/staging", { method: "DELETE" })).status).toBe(404);
	});
});
