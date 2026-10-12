import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const OTHER_WORKSPACE = "00000000-0000-4000-8000-000000000009";
const KEY = "00000000-0000-4000-8000-000000000003";
const OTHER_KEY = "00000000-0000-4000-8000-000000000004";
const MEMBER = "00000000-0000-4000-8000-000000000005";
const ALL_SCOPES = ["rate_limits:read", "rate_limits:write", "rate_limits:delete"];

const state = vi.hoisted(() => ({
	auth: { ok: true, value: { workspaceId: "00000000-0000-4000-8000-000000000001", authMethod: "api_key", scopes: [] as string[] } } as any,
	tables: {} as Record<string, any[]>,
	audit: vi.fn(),
	nextId: 100,
}));

// Unique targets enforced by the database's partial unique indexes.
const UNIQUE_TARGET_COLUMNS = ["key_id", "user_id", "department_id", "guardrail_id"];

function tableQuery(table: string, operation: "select" | "insert" | "update" | "delete", payload?: Record<string, unknown>) {
	const filters: Array<(row: any) => boolean> = [];
	const rows = () => (state.tables[table] ??= []);
	const matches = () => rows().filter((row) => filters.every((filter) => filter(row)));
	const run = () => {
		if (operation === "insert") {
			const conflict = table === "workspace_rate_limit_policy_assignments" && rows().some((row) =>
				UNIQUE_TARGET_COLUMNS.some((column) => payload?.[column] != null && row[column] === payload[column])
				|| (payload?.target_type === "end_user_default" && row.target_type === "end_user_default" && row.workspace_id === payload.workspace_id));
			if (conflict) return { data: null, error: { code: "23505", message: "duplicate" } };
			const row = {
				id: `00000000-0000-4000-8000-000000000${state.nextId++}`,
				created_at: "2026-10-12T12:00:00Z",
				updated_at: "2026-10-12T12:00:00Z",
				description: null,
				requests_per_minute: null,
				tokens_per_minute: null,
				concurrent_requests: null,
				fail_closed: false,
				key_id: null,
				user_id: null,
				department_id: null,
				guardrail_id: null,
				...payload,
			};
			rows().push(row);
			return { data: [row], error: null };
		}
		const found = matches();
		if (operation === "update") found.forEach((row) => Object.assign(row, payload));
		if (operation === "delete") state.tables[table] = rows().filter((row) => !found.includes(row));
		return { data: found, error: null };
	};
	const query: any = {
		select: () => query,
		eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
		neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return query; },
		order: () => query,
		maybeSingle: async () => {
			const result = run();
			return { data: result.data?.[0] ?? null, error: result.error };
		},
		then(resolve: (value: unknown) => unknown) { return Promise.resolve(run()).then(resolve); },
	};
	return query;
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		from: (table: string) => ({
			select: () => tableQuery(table, "select"),
			insert: (payload: Record<string, unknown>) => tableQuery(table, "insert", payload),
			update: (payload: Record<string, unknown>) => tableQuery(table, "update", payload),
			delete: () => tableQuery(table, "delete"),
		}),
	}),
}));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: state.audit }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

async function call(path: string, method = "GET", body?: unknown) {
	const { rateLimitsRoutes } = await import("./rate-limits");
	return rateLimitsRoutes.request(`https://example.com${path}`, {
		method,
		...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
	});
}

describe("rate limit policy management", () => {
	beforeEach(() => {
		state.auth.value.scopes = [...ALL_SCOPES];
		state.tables = {
			workspace_rate_limit_policies: [{
				id: "00000000-0000-4000-8000-000000000002", workspace_id: WORKSPACE, name: "Standard", description: null,
				requests_per_minute: 60, tokens_per_minute: null, concurrent_requests: null, fail_closed: false,
				created_by: null, created_at: "2026-10-12T12:00:00Z", updated_at: "2026-10-12T12:00:00Z",
			}, {
				id: "00000000-0000-4000-8000-000000000008", workspace_id: OTHER_WORKSPACE, name: "Elsewhere", description: null,
				requests_per_minute: 5, tokens_per_minute: null, concurrent_requests: null, fail_closed: false,
				created_by: null, created_at: "2026-10-12T12:00:00Z", updated_at: "2026-10-12T12:00:00Z",
			}],
			workspace_rate_limit_policy_assignments: [],
			keys: [
				{ id: KEY, workspace_id: WORKSPACE, status: "active" },
				{ id: OTHER_KEY, workspace_id: OTHER_WORKSPACE, status: "active" },
			],
			workspace_guardrails: [],
		};
		state.audit.mockReset();
	});

	it("lists only the caller's workspace policies", async () => {
		const response = await call("/policies");
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.data).toEqual([expect.objectContaining({ name: "Standard", requests_per_minute: 60, tokens_per_minute: null, fail_closed: false })]);
	});

	it("creates and audits a policy", async () => {
		const response = await call("/policies", "POST", { name: " Batch jobs ", tokens_per_minute: 200_000, concurrent_requests: 4, fail_closed: true });
		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({ data: { name: "Batch jobs", requests_per_minute: null, tokens_per_minute: 200_000, concurrent_requests: 4, fail_closed: true } });
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "rate_limit_policy.created", targetName: "Batch jobs" }));
	});

	it.each([
		[{ requests_per_minute: 60 }, "name is required"],
		[{ name: "No limits" }, "Set at least one"],
		[{ name: "Zero", requests_per_minute: 0 }, "requests_per_minute must be a positive whole number"],
		[{ name: "Fraction", tokens_per_minute: 1.5 }, "tokens_per_minute must be a positive whole number"],
		[{ name: "Huge", concurrent_requests: 3_000_000_000 }, "concurrent_requests must be a positive whole number"],
		[{ name: "Flag", requests_per_minute: 1, fail_closed: "yes" }, "fail_closed must be a boolean"],
		[{ name: "x".repeat(101), requests_per_minute: 1 }, "name must be 1 to 100 characters"],
	])("rejects invalid policy %#", async (body, message) => {
		const response = await call("/policies", "POST", body);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: "bad_request", message: expect.stringContaining(message) });
	});

	it("updates a policy but will not remove its last limit", async () => {
		const id = "00000000-0000-4000-8000-000000000002";
		const cleared = await call(`/policies/${id}`, "PATCH", { requests_per_minute: null });
		expect(cleared.status).toBe(400);
		const updated = await call(`/policies/${id}`, "PATCH", { requests_per_minute: null, tokens_per_minute: 50_000 });
		expect(updated.status).toBe(200);
		await expect(updated.json()).resolves.toMatchObject({ data: { requests_per_minute: null, tokens_per_minute: 50_000 } });
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "rate_limit_policy.updated" }));
	});

	it("does not reach policies in another workspace", async () => {
		const id = "00000000-0000-4000-8000-000000000008";
		expect((await call(`/policies/${id}`)).status).toBe(404);
		expect((await call(`/policies/${id}`, "PATCH", { requests_per_minute: 1 })).status).toBe(404);
		expect((await call(`/policies/${id}`, "DELETE")).status).toBe(404);
		expect(state.tables.workspace_rate_limit_policies).toHaveLength(2);
	});

	it("deletes a policy", async () => {
		const response = await call("/policies/00000000-0000-4000-8000-000000000002", "DELETE");
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ data: { id: "00000000-0000-4000-8000-000000000002", deleted: true } });
	});

	it("assigns a policy to a key, and one key gets at most one policy", async () => {
		const policyId = "00000000-0000-4000-8000-000000000002";
		const created = await call("/assignments", "POST", { policy_id: policyId, target_type: "key", target_id: KEY });
		expect(created.status).toBe(201);
		await expect(created.json()).resolves.toMatchObject({ data: { policy_id: policyId, target_type: "key", target_id: KEY } });
		expect(state.tables.workspace_rate_limit_policy_assignments[0]).toMatchObject({ key_id: KEY, workspace_id: WORKSPACE });
		const duplicate = await call("/assignments", "POST", { policy_id: policyId, target_type: "key", target_id: KEY });
		expect(duplicate.status).toBe(409);
	});

	it("rejects keys from another workspace and malformed targets", async () => {
		const policyId = "00000000-0000-4000-8000-000000000002";
		const foreignKey = await call("/assignments", "POST", { policy_id: policyId, target_type: "key", target_id: OTHER_KEY });
		expect(foreignKey.status).toBe(400);
		const missingTarget = await call("/assignments", "POST", { policy_id: policyId, target_type: "member" });
		expect(missingTarget.status).toBe(400);
		const unexpectedTarget = await call("/assignments", "POST", { policy_id: policyId, target_type: "end_user_default", target_id: MEMBER });
		expect(unexpectedTarget.status).toBe(400);
		const unknownType = await call("/assignments", "POST", { policy_id: policyId, target_type: "team", target_id: MEMBER });
		expect(unknownType.status).toBe(400);
		expect(state.tables.workspace_rate_limit_policy_assignments).toHaveLength(0);
	});

	it("sets the workspace end-user default, changes its policy, and removes it", async () => {
		const created = await call("/assignments", "POST", { policy_id: "00000000-0000-4000-8000-000000000002", target_type: "end_user_default" });
		expect(created.status).toBe(201);
		const { data } = await created.json() as any;
		expect(data.target_id).toBeNull();
		const listed = await call("/assignments?target_type=end_user_default");
		await expect(listed.json()).resolves.toMatchObject({ data: [{ id: data.id }] });
		const updated = await call(`/assignments/${data.id}`, "PATCH", { policy_id: "00000000-0000-4000-8000-000000000007" });
		expect(updated.status).toBe(200);
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "rate_limit_assignment.updated" }));
		const deleted = await call(`/assignments/${data.id}`, "DELETE");
		expect(deleted.status).toBe(200);
		expect(state.tables.workspace_rate_limit_policy_assignments).toHaveLength(0);
	});

	it("requires the matching rate_limits scope", async () => {
		state.auth.value.scopes = ["rate_limits:read"];
		const response = await call("/policies", "POST", { name: "Denied", requests_per_minute: 1 });
		expect(response.status).toBe(403);
		expect(state.tables.workspace_rate_limit_policies).toHaveLength(2);
	});
});
