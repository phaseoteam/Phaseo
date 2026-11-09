import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	auth: { ok: true, value: { workspaceId: "00000000-0000-4000-8000-000000000001", authMethod: "api_key", userId: "00000000-0000-4000-8000-000000000077", scopes: ["budgets:read", "budgets:write", "budgets:delete"] } } as any,
	rows: [] as any[],
	audit: vi.fn(),
}));

function budgetQuery(operation: "select" | "insert" | "update" | "delete", payload?: Record<string, unknown>) {
	let id: string | null = null;
	const query: any = {
		select: () => query,
		eq: (column: string, value: string) => { if (column === "id") id = value; return query; },
		neq: () => query,
		order: () => query,
		maybeSingle: async () => {
			if (operation === "insert") {
				const row = { id: "00000000-0000-4000-8000-000000000002", created_at: "2026-08-30T12:00:00Z", updated_at: "2026-08-30T12:00:00Z", ...payload };
				state.rows.push(row); return { data: row, error: null };
			}
			const index = state.rows.findIndex((row) => row.id === id);
			if (index < 0) return { data: null, error: null };
			if (operation === "update") state.rows[index] = { ...state.rows[index], ...payload };
			if (operation === "delete") return { data: state.rows.splice(index, 1)[0], error: null };
			return { data: state.rows[index], error: null };
		},
		then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: state.rows, error: null }).then(resolve); },
	};
	return query;
}

// The management key acts as its creator, an admin of the workspace.
function membership() { const membership: any = { select: () => membership, eq: () => membership, maybeSingle: async () => ({ data: { role: "admin" }, error: null }) }; return membership; }

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		from: (table: string) => table === "workspace_members" ? membership() : ({
			select: () => budgetQuery("select"),
			insert: (payload: Record<string, unknown>) => budgetQuery("insert", payload),
			update: (payload: Record<string, unknown>) => budgetQuery("update", payload),
			delete: () => budgetQuery("delete"),
		}),
		rpc: async () => ({ data: { ok: true, budgets: state.rows.map((row) => ({ ...row, usage_nanos: 2_000_000_000, remaining_nanos: Number(row.limit_nanos) - 2_000_000_000 })) }, error: null }),
	}),
}));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: state.audit }));
vi.mock("@/core/kv", () => ({ setKeyVersion: vi.fn(async () => 1) }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

describe("workspace budget management", () => {
	beforeEach(() => {
		state.auth.value.scopes = ["budgets:read", "budgets:write", "budgets:delete"];
		state.rows = [{ id: "00000000-0000-4000-8000-000000000002", workspace_id: state.auth.value.workspaceId, interval: "monthly", limit_nanos: 10_000_000_000, created_by: null, created_at: "2026-08-30T12:00:00Z", updated_at: "2026-08-30T12:00:00Z" }];
		state.audit.mockReset();
	});

	it("lists budgets with usage and remaining spend", async () => {
		const { budgetsRoutes } = await import("./budgets");
		const response = await budgetsRoutes.request("https://example.com/");
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ data: [{ interval: "monthly", limit: 10, usage: 2, remaining: 8 }] });
	});

	it("creates and audits a budget", async () => {
		state.rows = [];
		const { budgetsRoutes } = await import("./budgets");
		const response = await budgetsRoutes.request("https://example.com/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interval: "daily", limit: 5 }) });
		expect(response.status).toBe(201);
		expect(state.rows[0]).toMatchObject({ interval: "daily", limit_nanos: 5_000_000_000 });
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "workspace_budget.created" }));
	});

	it("updates and deletes a workspace-scoped budget", async () => {
		const { budgetsRoutes } = await import("./budgets");
		const id = state.rows[0].id;
		const updated = await budgetsRoutes.request(`https://example.com/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 20 }) });
		expect(updated.status).toBe(200);
		expect(state.rows[0].limit_nanos).toBe(20_000_000_000);
		const deleted = await budgetsRoutes.request(`https://example.com/${id}`, { method: "DELETE" });
		expect(deleted.status).toBe(200);
		expect(state.rows).toHaveLength(0);
	});

	it("requires the operation-specific scope", async () => {
		state.auth.value.scopes = ["budgets:read"];
		const { budgetsRoutes } = await import("./budgets");
		const response = await budgetsRoutes.request("https://example.com/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interval: "daily", limit: 5 }) });
		expect(response.status).toBe(403);
	});
});
