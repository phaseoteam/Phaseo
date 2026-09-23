import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	route: null as Record<string, any> | null,
	versions: [] as Array<Record<string, any>>,
	keyIds: [] as string[],
	auditEvents: [] as Array<Record<string, unknown>>,
	invalidated: [] as string[],
	rpcArgs: null as Record<string, unknown> | null,
}));

function result(data: unknown = [], error: unknown = null, count?: number) {
	return { data, error, ...(count === undefined ? {} : { count }) };
}

function chain(terminal: () => Record<string, unknown>) {
	const value: any = {};
	for (const method of ["select", "eq", "neq", "in", "order", "range"]) value[method] = () => value;
	value.maybeSingle = async () => terminal();
	value.single = async () => terminal();
	value.then = (resolve: (input: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(terminal()).then(resolve, reject);
	return value;
}

function supabase() {
	return {
		from(table: string) {
			if (table === "gateway_dynamic_routes") {
				const base = chain(() => result(state.route ? [state.route] : [], null, state.route ? 1 : 0));
				base.maybeSingle = async () => result(state.route);
				base.insert = (payload: Record<string, unknown>) => {
					state.route = { id: "route_1", version: 1, deployed_version: null, config: {}, created_at: "2026-08-30T00:00:00Z", updated_at: "2026-08-30T00:00:00Z", ...payload };
					return chain(() => result(state.route));
				};
				base.update = (payload: Record<string, unknown>) => {
					state.route = { ...state.route, ...payload };
					const update = chain(() => result(state.route));
					update.maybeSingle = async () => result(state.route);
					return update;
				};
				base.delete = () => {
					const deleted = chain(() => result(null));
					deleted.then = (resolve: (input: unknown) => unknown) => {
						state.route = null;
						return Promise.resolve(resolve(result(null)));
					};
					return deleted;
				};
				return base;
			}
			if (table === "gateway_dynamic_route_versions") {
				const base = chain(() => result(state.versions));
				base.maybeSingle = async () => result(state.versions.at(-1) ?? null);
				base.insert = (payload: Record<string, unknown>) => {
					state.versions.push({ created_at: "2026-08-30T00:00:00Z", ...payload });
					return Promise.resolve(result(null));
				};
				base.delete = () => chain(() => result(null));
				return base;
			}
			if (table === "gateway_dynamic_route_keys") {
				return chain(() => result(state.keyIds.map((key_id) => ({ route_id: "route_1", key_id }))));
			}
			if (table === "keys") return chain(() => result(state.keyIds.map((id) => ({ id }))));
			if (table === "workspace_audit_events") {
				return { insert: async (payload: Record<string, unknown>) => { state.auditEvents.push(payload); return { error: null }; } };
			}
			throw new Error(`Unexpected table: ${table}`);
		},
		rpc: async (_name: string, args: Record<string, unknown>) => {
			state.rpcArgs = args;
			state.keyIds = [...(args.p_key_ids as string[])];
			return result(null);
		},
	};
}

vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => supabase() }));
vi.mock("@/core/workspace-publication", () => ({ publishWorkspaceMutation: async (id: string) => { state.invalidated.push(id); } }));
vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: async () => ({ ok: true, value: { workspaceId: "workspace_1", userId: "user_1", requestId: "request_1" } }),
}));
vi.mock("./route-helpers", () => ({
	requireCapability: () => null,
	requireOAuthWorkspaceRole: async () => null,
	internalServerError: (_name: string, error: unknown) => new Response(JSON.stringify({ error: String(error) }), { status: 500 }),
}));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (request: Request) => Promise<Response>) => (context: any) => handler(context.req.raw),
}));

describe("dynamic routing management", () => {
	beforeEach(() => {
		state.route = { id: "route_1", workspace_id: "workspace_1", name: "Production", slug: "production", description: null, status: "active", version: 1, deployed_version: null, config: {}, created_at: "2026-08-30T00:00:00Z", updated_at: "2026-08-30T00:00:00Z" };
		state.versions = [{ route_id: "route_1", version: 1, config: { cacheAwareRouting: true }, created_by: "user_1", created_at: "2026-08-30T00:00:00Z" }];
		state.keyIds = [];
		state.auditEvents.length = 0;
		state.invalidated.length = 0;
		state.rpcArgs = null;
		vi.resetModules();
	});

	it("creates a bounded versioned route and records an audit event", async () => {
		state.route = null;
		state.versions = [];
		const { routingRoutes } = await import("./routing");
		const response = await routingRoutes.request("https://example.com/dynamic-routes", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Production", config: { defaultAction: { routingMode: "latency", providerOnly: ["alpha"] } } }),
		});
		const body = await response.json() as Record<string, any>;
		expect(response.status).toBe(201);
		expect(body.data).toMatchObject({ id: "route_1", name: "Production", version: 1 });
		expect(state.versions[0].config).toMatchObject({ cacheAwareRouting: true, defaultAction: { routingMode: "latency", providerOnly: ["alpha"] } });
		expect(state.auditEvents[0]).toMatchObject({ action: "routing.dynamic_route.created", target_id: "route_1" });
	});

	it("creates an immutable version when route configuration changes", async () => {
		const { routingRoutes } = await import("./routing");
		const response = await routingRoutes.request("https://example.com/dynamic-routes/route_1", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ config: { defaultAction: { allowFallbacks: false } } }),
		});
		expect(response.status).toBe(200);
		expect(state.route?.version).toBe(2);
		expect(state.versions.at(-1)).toMatchObject({ route_id: "route_1", version: 2 });
	});

	it("atomically replaces key attachments and invalidates affected keys", async () => {
		state.keyIds = ["key_1", "key_2"];
		const { routingRoutes } = await import("./routing");
		const response = await routingRoutes.request("https://example.com/dynamic-routes/route_1/keys", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ key_ids: ["key_1", "key_2"] }),
		});
		expect(response.status).toBe(200);
		expect(state.rpcArgs).toMatchObject({ p_route_id: "route_1", p_key_ids: ["key_1", "key_2"] });
		expect(state.invalidated).toEqual(["workspace_1"]);
	});

	it("deploys a selected version and refreshes attached-key context", async () => {
		state.keyIds = ["key_1"];
		const { routingRoutes } = await import("./routing");
		const response = await routingRoutes.request("https://example.com/dynamic-routes/route_1/versions/1/deploy", { method: "POST" });
		expect(response.status).toBe(200);
		expect(state.route?.deployed_version).toBe(1);
		expect(state.invalidated).toEqual(["workspace_1"]);
		expect(state.auditEvents[0]).toMatchObject({ action: "routing.dynamic_route.deployed" });
	});

	it("requires matching confirmation when deleting a route by name", async () => {
		const { routingRoutes } = await import("./routing");
		const response = await routingRoutes.request("https://example.com/dynamic-routes/route_1?confirm_name=Wrong", { method: "DELETE" });
		expect(response.status).toBe(409);
		expect(state.route).not.toBeNull();
	});
});
