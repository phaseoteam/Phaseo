import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	auth: null as any,
	events: [] as any[],
	actors: [] as any[],
}));

function chain(result: () => { data: any[]; error: null }) {
	const query: any = {
		select: () => query, eq: () => query, order: () => query, limit: () => query,
		or: () => query, in: () => query,
		then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve); },
	};
	return query;
}

// The management key acts as its creator, an admin of the workspace.
function membership() { const membership: any = { select: () => membership, eq: () => membership, maybeSingle: async () => ({ data: { role: "admin" }, error: null }) }; return membership; }

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		from: (table: string) => table === "workspace_members"
			? membership()
			: table === "workspace_audit_events"
			? chain(() => ({ data: state.events, error: null }))
			: chain(() => ({ data: state.actors, error: null })),
	}),
}));

vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

describe("management audit events", () => {
	beforeEach(() => {
		state.auth = { ok: true, value: { workspaceId: "ws_1", authMethod: "api_key", userId: "user_admin", scopes: ["activity:read"] } };
		state.events = [{ id: "00000000-0000-4000-8000-000000000001", workspace_id: "ws_1", actor_user_id: "user_1", action: "api_key.created", target_type: "api_key", target_id: "key_1", target_name: "Production", metadata: {}, request_id: null, created_at: "2026-08-30T10:00:00Z" }];
		state.actors = [{ user_id: "user_1", display_name: "Ada", email: "ada@example.com" }];
		vi.resetModules();
	});

	it("lists workspace-scoped audit events with resolved actors", async () => {
		const { auditEventsRoutes } = await import("./audit-events");
		const response = await auditEventsRoutes.request("https://example.com/?limit=50");
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ data: [{ action: "api_key.created", actor: { display_name: "Ada" } }], has_more: false, next_cursor: null });
	});

	it("requires activity read scope", async () => {
		state.auth.value.scopes = ["keys:read"];
		const { auditEventsRoutes } = await import("./audit-events");
		const response = await auditEventsRoutes.request("https://example.com/");
		expect(response.status).toBe(403);
	});

	it("rejects malformed cursors", async () => {
		const { auditEventsRoutes } = await import("./audit-events");
		const response = await auditEventsRoutes.request("https://example.com/?cursor=bad");
		expect(response.status).toBe(400);
	});
});
