import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const BLOCK = "00000000-0000-4000-8000-000000000002";
const RULE = "00000000-0000-4000-8000-000000000003";
const USER = "00000000-0000-4000-8000-000000000005";

const state = vi.hoisted(() => ({
	auth: null as any,
	members: [] as Array<Record<string, unknown>>,
	rpc: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
	audit: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
	publish: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		from: () => {
			const filters: Record<string, unknown> = {};
			const query: any = {
				select: () => query,
				eq: (column: string, value: unknown) => { filters[column] = value; return query; },
				maybeSingle: async () => ({
					data: state.members.find((member) => Object.entries(filters).every(([column, value]) => member[column] === value)) ?? null,
					error: null,
				}),
			};
			return query;
		},
		rpc: (...args: unknown[]) => state.rpc(...args),
	}),
}));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: (...args: unknown[]) => state.audit(...args) }));
vi.mock("@core/spend-blocks", () => ({ publishSpendBlockEntry: (...args: unknown[]) => state.publish(...args) }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

async function call(path: string, method = "GET") {
	const { spendBlocksRoutes } = await import("./spend-blocks");
	return spendBlocksRoutes.request(`https://api.phaseo.app${path}`, { method });
}

function blockRow(extra: Record<string, unknown> = {}) {
	return {
		id: BLOCK, workspace_id: WORKSPACE, rule_id: RULE, rule_name: "Hard cap", scope_type: "workspace", scope_id: null, scope_label: "Acme",
		block_free_models: false, period_start: "2026-10-01T00:00:00+00:00", resets_at: "2026-11-01T00:00:00+00:00",
		spend_nanos: 112000000000, limit_nanos: 110000000000, started_at: "2026-10-21T12:00:00+00:00",
		lifted_at: null, lifted_by: null, lift_reason: null, active: true, ...extra,
	};
}

describe("spend blocks management API", () => {
	beforeEach(() => {
		state.auth = { ok: true, value: { workspaceId: WORKSPACE, authMethod: "api_key", scopes: ["spend_rules:read", "spend_rules:write"], userId: null, requestId: "req-1" } };
		state.members = [{ workspace_id: WORKSPACE, user_id: USER, role: "member" }];
		state.rpc = vi.fn(async (name: string) => {
			if (name === "list_workspace_spend_blocks") return { data: [blockRow()], error: null };
			if (name === "lift_workspace_spend_block") return { data: blockRow({ lifted_at: "2026-10-21T13:00:00+00:00", lift_reason: "manual", lifted_by: USER, active: false }), error: null };
			return { data: null, error: null };
		});
		state.audit = vi.fn(async () => true);
		state.publish = vi.fn(async () => true);
	});

	it("lists active blocks with *_usd amounts", async () => {
		const response = await call("/");
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		const body = await response.json() as any;
		expect(body.data).toHaveLength(1);
		expect(body.data[0]).toMatchObject({ id: BLOCK, rule_id: RULE, spend_usd: 112, limit_usd: 110, active: true, scope_label: "Acme" });
		expect(state.rpc).toHaveBeenCalledWith("list_workspace_spend_blocks", { p_workspace_id: WORKSPACE, p_include_lifted: false, p_limit: 50 });
	});

	it("validates the list query", async () => {
		expect((await call("/?include_lifted=maybe")).status).toBe(400);
		expect((await call("/?limit=0")).status).toBe(400);
		expect((await call("/?limit=101")).status).toBe(400);
		await call("/?include_lifted=true&limit=5");
		expect(state.rpc).toHaveBeenCalledWith("list_workspace_spend_blocks", { p_workspace_id: WORKSPACE, p_include_lifted: true, p_limit: 5 });
	});

	it("lifts a block, audits it and republishes the gateway entry", async () => {
		const response = await call(`/${BLOCK.toUpperCase()}/lift`, "POST");
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ data: { id: BLOCK, lift_reason: "manual", active: false } });
		expect(state.rpc).toHaveBeenCalledWith("lift_workspace_spend_block", { p_workspace_id: WORKSPACE, p_block_id: BLOCK, p_actor_user_id: null });
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			workspaceId: WORKSPACE, action: "spend_block.lifted", targetType: "spend_block", targetId: BLOCK, targetName: "Hard cap", requestId: "req-1",
		}));
		expect(state.publish).toHaveBeenCalledWith(WORKSPACE);
	});

	it("maps lift errors", async () => {
		state.rpc = vi.fn(async () => ({ data: null, error: { message: "spend_block_not_found" } }));
		expect((await call(`/${BLOCK}/lift`, "POST")).status).toBe(404);
		state.rpc = vi.fn(async () => ({ data: null, error: { message: "spend_block_not_active" } }));
		const conflict = await call(`/${BLOCK}/lift`, "POST");
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toMatchObject({ error: "spend_block_not_active" });
		expect((await call("/not-a-block/lift", "POST")).status).toBe(400);
		expect(state.publish).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("needs spend_rules:read to list and spend_rules:write to lift", async () => {
		state.auth.value.scopes = ["keys:read"];
		expect((await call("/")).status).toBe(403);
		state.auth.value.scopes = ["spend_rules:read"];
		expect((await call("/")).status).toBe(200);
		expect((await call(`/${BLOCK}/lift`, "POST")).status).toBe(403);
	});

	it("allows only owners and admins over OAuth", async () => {
		state.auth.value = { workspaceId: WORKSPACE, authMethod: "oauth", oauthClientId: "phaseo_cli", scopes: ["spend_rules:read", "spend_rules:write"], oauthScopes: [], userId: USER };
		expect((await call("/")).status).toBe(403);
		expect((await call(`/${BLOCK}/lift`, "POST")).status).toBe(403);
		state.members = [{ workspace_id: WORKSPACE, user_id: USER, role: "admin" }];
		expect((await call("/")).status).toBe(200);
		expect((await call(`/${BLOCK}/lift`, "POST")).status).toBe(200);
		expect(state.rpc).toHaveBeenCalledWith("lift_workspace_spend_block", { p_workspace_id: WORKSPACE, p_block_id: BLOCK, p_actor_user_id: USER });
	});

	it("passes through a failed management key check", async () => {
		state.auth = { ok: false, response: new Response("nope", { status: 401 }) };
		expect((await call("/")).status).toBe(401);
	});
});
