import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	patch: null as Record<string, unknown> | null,
	audits: [] as Array<Record<string, unknown>>,
	invalidations: [] as string[],
}));

function chain(row: Record<string, unknown>) {
	const value: any = {};
	for (const method of ["select", "eq", "neq"]) value[method] = () => value;
	value.maybeSingle = async () => ({ data: row, error: null });
	value.then = (resolve: (input: unknown) => unknown) => Promise.resolve(resolve({ data: [{ id: "key_1" }], error: null }));
	return value;
}

function supabase() {
	return {
		from(table: string) {
			if (table === "workspace_settings") {
				const base = chain({ workspace_id: "workspace_1", routing_mode: "latency", beta_channel_enabled: false, alpha_channel_enabled: false, response_healing_enabled: true, response_healing_locked: true, response_healing_mode: "safe" });
				base.upsert = (patch: Record<string, unknown>) => { state.patch = patch; return base; };
				return base;
			}
			if (table === "keys") return chain({});
			if (table === "workspace_audit_events") return { insert: async (payload: Record<string, unknown>) => { state.audits.push(payload); return { error: null }; } };
			throw new Error(`Unexpected table: ${table}`);
		},
	};
}

vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => supabase() }));
vi.mock("@/core/workspace-publication", () => ({ publishWorkspaceMutation: async (id: string) => { state.invalidations.push(id); } }));
vi.mock("@/pipeline/before/workspacePolicy", () => ({ bumpWorkspacePolicyVersion: async () => 1 }));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: async () => ({ ok: true, value: { workspaceId: "workspace_1", userId: "user_1", requestId: "request_1" } }) }));
vi.mock("./route-helpers", () => ({
	requireCapability: () => null,
	requireOAuthWorkspaceRole: async () => null,
	requireJsonBody: async (req: Request) => req.json(),
	isResponse: (value: unknown) => value instanceof Response,
	internalServerError: (_name: string, error: unknown) => new Response(JSON.stringify({ error: String(error) }), { status: 500 }),
}));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (request: Request) => Promise<Response>) => (context: any) => handler(context.req.raw),
}));

describe("workspace settings management", () => {
	beforeEach(() => {
		state.patch = null;
		state.audits.length = 0;
		state.invalidations.length = 0;
		vi.resetModules();
	});

	it("validates and audits routing policy changes", async () => {
		const { settingsRoutes } = await import("./settings");
		const response = await settingsRoutes.request("https://example.com/", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ routing_mode: "latency", response_healing_enabled: true, response_healing_locked: true }),
		});
		expect(response.status).toBe(200);
		expect(state.patch).toMatchObject({ workspace_id: "workspace_1", routing_mode: "latency", response_healing_enabled: true, response_healing_locked: true });
		expect(state.invalidations).toEqual(["workspace_1"]);
		expect(state.audits[0]).toMatchObject({ action: "routing.policy.updated" });
	});

	it("rejects invalid routing modes before persistence", async () => {
		const { settingsRoutes } = await import("./settings");
		const response = await settingsRoutes.request("https://example.com/", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ routing_mode: "random" }),
		});
		expect(response.status).toBe(400);
		expect(state.patch).toBeNull();
	});
});
