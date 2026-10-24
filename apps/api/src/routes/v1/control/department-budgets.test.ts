import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const BUDGET = "00000000-0000-4000-8000-000000000002";
const ENG = "00000000-0000-4000-8000-000000000003";
const SALES = "00000000-0000-4000-8000-000000000004";

const state = vi.hoisted(() => ({
	auth: { ok: true, value: { workspaceId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000009", authMethod: "api_key", scopes: ["budgets:read", "budgets:write", "budgets:delete"] } } as any,
	rows: [] as any[],
	filters: [] as Array<[string, string]>,
	insertError: null as null | { code: string; message: string },
	rpc: vi.fn(),
	audit: vi.fn(),
}));

function query(operation: "select" | "insert" | "update" | "delete", payload?: Record<string, unknown>) {
	const filters: Array<[string, string]> = [];
	const matching = () => state.rows.filter((row) => filters.every(([column, value]) => row[column] === value));
	const builder: any = {
		select: () => builder,
		eq: (column: string, value: string) => { filters.push([column, value]); state.filters.push([column, value]); return builder; },
		order: () => builder,
		maybeSingle: async () => {
			if (operation === "insert") {
				if (state.insertError) return { data: null, error: state.insertError };
				const row = { id: BUDGET, created_at: "2026-10-21T12:00:00Z", updated_at: "2026-10-21T12:00:00Z", ...payload };
				state.rows.push(row);
				return { data: row, error: null };
			}
			const [row] = matching();
			if (!row) return { data: null, error: null };
			if (operation === "update") Object.assign(row, payload);
			if (operation === "delete") state.rows.splice(state.rows.indexOf(row), 1);
			return { data: row, error: null };
		},
		then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: matching(), error: null }).then(resolve); },
	};
	return builder;
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		from: (table: string) => {
			if (table !== "workspace_department_budgets") throw new Error(`unexpected table ${table}`);
			return {
				select: () => query("select"),
				insert: (payload: Record<string, unknown>) => query("insert", payload),
				update: (payload: Record<string, unknown>) => query("update", payload),
				delete: () => query("delete"),
			};
		},
		rpc: state.rpc,
	}),
}));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: state.audit }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

const send = async (path: string, init?: { method: string; body?: unknown }) => {
	const { departmentBudgetsRoutes } = await import("./department-budgets");
	return departmentBudgetsRoutes.request(`https://example.com${path}`, init && {
		method: init.method,
		headers: { "Content-Type": "application/json" },
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
};

describe("department budget management", () => {
	beforeEach(() => {
		state.auth.value.scopes = ["budgets:read", "budgets:write", "budgets:delete"];
		state.rows = [{ id: BUDGET, workspace_id: WORKSPACE, department_id: ENG, interval: "monthly", limit_nanos: 100_000_000_000, created_by: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }];
		state.filters = [];
		state.insertError = null;
		state.audit.mockReset();
		state.rpc.mockReset().mockImplementation(async () => ({
			data: state.rows.map((row) => ({ id: row.id, department_name: "Engineering", usage_nanos: "84000000000", window_start: "2026-10-01T00:00:00+00:00", reset_at: "2026-11-01T00:00:00+00:00" })),
			error: null,
		}));
	});

	it("lists budgets with each department's spend from the status function", async () => {
		const response = await send("/");
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		await expect(response.json()).resolves.toEqual({ data: [{
			id: BUDGET, workspace_id: WORKSPACE, department_id: ENG, department_name: "Engineering", interval: "monthly",
			limit: 100, limit_nanos: 100_000_000_000, usage: 84, usage_nanos: 84_000_000_000, remaining: 16, remaining_nanos: 16_000_000_000,
			exceeded: false, window_start: "2026-10-01T00:00:00+00:00", reset_at: "2026-11-01T00:00:00+00:00",
			created_by: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
		}] });
		expect(state.rpc).toHaveBeenCalledWith("workspace_department_budget_status", { p_workspace_id: WORKSPACE });
		expect(state.filters).toContainEqual(["workspace_id", WORKSPACE]);
	});

	it("filters by department and rejects a malformed department filter", async () => {
		const filtered = await send(`/?department_id=${SALES}`);
		await expect(filtered.json()).resolves.toEqual({ data: [] });
		expect(state.filters).toContainEqual(["department_id", SALES]);
		expect((await send("/?department_id=eng")).status).toBe(400);
	});

	it("creates and audits a budget in the caller's workspace", async () => {
		state.rows = [];
		const response = await send("/", { method: "POST", body: { department_id: SALES.toUpperCase(), interval: "Weekly", limit: 12.5 } });
		expect(response.status).toBe(201);
		expect(state.rows[0]).toMatchObject({ workspace_id: WORKSPACE, department_id: SALES, interval: "weekly", limit_nanos: 12_500_000_000, created_by: state.auth.value.userId });
		await expect(response.json()).resolves.toMatchObject({ data: { department_name: "Engineering", usage: 84, exceeded: true } });
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			workspaceId: WORKSPACE, action: "workspace_department_budget.created", targetType: "workspace_department_budget",
			metadata: { department_id: SALES, interval: "weekly", limit_nanos: 12_500_000_000 },
		}));
	});

	it("validates the body before writing", async () => {
		for (const body of [
			{ interval: "daily", limit: 5 },
			{ department_id: ENG, interval: "lifetime", limit: 5 },
			{ department_id: ENG, interval: "daily", limit: 0 },
			{ department_id: ENG, interval: "daily", limit: "lots" },
		]) expect((await send("/", { method: "POST", body })).status).toBe(400);
		expect(state.rows).toHaveLength(1);
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("reports a duplicate period as a conflict and another workspace's department as not found", async () => {
		state.insertError = { code: "23505", message: "duplicate key" };
		const duplicate = await send("/", { method: "POST", body: { department_id: ENG, interval: "monthly", limit: 5 } });
		expect(duplicate.status).toBe(409);
		await expect(duplicate.json()).resolves.toMatchObject({ message: "This department already has a monthly budget" });

		state.insertError = { code: "23503", message: "violates foreign key constraint" };
		const foreign = await send("/", { method: "POST", body: { department_id: SALES, interval: "monthly", limit: 5 } });
		expect(foreign.status).toBe(404);
		await expect(foreign.json()).resolves.toMatchObject({ message: "Department not found" });
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("gets, updates and deletes only the workspace's own budget", async () => {
		const got = await send(`/${BUDGET}`);
		await expect(got.json()).resolves.toMatchObject({ data: { id: BUDGET, usage: 84 } });

		const updated = await send(`/${BUDGET}`, { method: "PATCH", body: { limit: 80 } });
		expect(updated.status).toBe(200);
		expect(state.rows[0].limit_nanos).toBe(80_000_000_000);
		await expect(updated.json()).resolves.toMatchObject({ data: { exceeded: true, remaining: 0 } });
		expect(state.audit).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ action: "workspace_department_budget.updated" }));

		state.auth.value.workspaceId = "00000000-0000-4000-8000-000000000099";
		try {
			expect((await send(`/${BUDGET}`)).status).toBe(404);
			expect((await send(`/${BUDGET}`, { method: "DELETE" })).status).toBe(404);
		} finally {
			state.auth.value.workspaceId = WORKSPACE;
		}

		const deleted = await send(`/${BUDGET}`, { method: "DELETE" });
		await expect(deleted.json()).resolves.toEqual({ data: { id: BUDGET, deleted: true } });
		expect(state.rows).toHaveLength(0);
		expect(state.audit).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ action: "workspace_department_budget.deleted" }));
	});

	it("rejects malformed ids and empty updates", async () => {
		expect((await send("/not-a-uuid")).status).toBe(400);
		expect((await send(`/${BUDGET}`, { method: "PATCH", body: {} })).status).toBe(400);
		expect((await send(`/${BUDGET}`, { method: "PATCH", body: { interval: "hourly" } })).status).toBe(400);
	});

	it("requires the operation-specific scope", async () => {
		state.auth.value.scopes = ["budgets:read"];
		expect((await send("/", { method: "POST", body: { department_id: ENG, interval: "daily", limit: 5 } })).status).toBe(403);
		expect((await send(`/${BUDGET}`, { method: "DELETE" })).status).toBe(403);
		expect((await send("/")).status).toBe(200);
	});
});
