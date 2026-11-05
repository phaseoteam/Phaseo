import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const OTHER_WORKSPACE = "00000000-0000-4000-8000-000000000009";
const KEY = "00000000-0000-4000-8000-000000000003";
const OTHER_KEY = "00000000-0000-4000-8000-000000000004";
const MEMBER = "00000000-0000-4000-8000-000000000005";
const DEPARTMENT = "00000000-0000-4000-8000-000000000006";
const STANDARD = "00000000-0000-4000-8000-000000000002";
const SECOND = "00000000-0000-4000-8000-000000000007";
const SHARED = "00000000-0000-4000-8000-00000000000a";
const ACCESS = "00000000-0000-4000-8000-00000000000b";
const ALL_SCOPES = ["rate_limits:read", "rate_limits:write", "rate_limits:delete"];

const state = vi.hoisted(() => ({
	auth: { ok: true, value: { workspaceId: "00000000-0000-4000-8000-000000000001", authMethod: "api_key", scopes: [] as string[] } } as any,
	tables: {} as Record<string, any[]>,
	audit: vi.fn(),
	publish: vi.fn(async (_workspaceId: string) => true),
	nextId: 100,
	actor: vi.fn(async (_token: string): Promise<{ userId: string } | null> => null),
}));

const newId = () => `00000000-0000-4000-8000-000000000${state.nextId++}`;
const levels = () => (state.tables.workspace_guardrail_assignments ??= []);
const sameTarget = (a: any, b: any) => a.guardrail_id === b.guardrail_id && a.target_type === b.target_type && (a.target_id ?? null) === (b.target_id ?? null);

/** workspace_guardrail_assignments: one row per guardrail and target. */
function insertLevel(row: any): { code: string; message: string } | null {
	if (levels().some((existing) => sameTarget(existing, row))) return { code: "23505", message: "duplicate" };
	levels().push({ id: newId(), created_by: null, created_at: "2026-10-12T12:00:00Z", target_id: null, ...row });
	return null;
}

/** private.sync_guardrail_assignments: key_guardrails and workspace_member_guardrails are copied one way. */
function syncLegacy(table: string, operation: "insert" | "update" | "delete", oldRow: any, newRow: any) {
	const target = (row: any) => table === "key_guardrails"
		? { workspace_id: state.tables.keys.find((key) => key.id === row.key_id)?.workspace_id, guardrail_id: row.guardrail_id, target_type: "key", target_id: row.key_id }
		: { workspace_id: row.workspace_id, guardrail_id: row.guardrail_id, target_type: "member", target_id: row.user_id };
	if (oldRow) state.tables.workspace_guardrail_assignments = levels().filter((row) => !sameTarget(row, target(oldRow)));
	if (newRow && !levels().some((row) => sameTarget(row, target(newRow)))) insertLevel(target(newRow));
}

function tableQuery(table: string, operation: "select" | "insert" | "update" | "delete", payload?: Record<string, unknown>) {
	const filters: Array<(row: any) => boolean> = [];
	let range: [number, number] | null = null;
	const rows = () => (state.tables[table] ??= []);
	const matches = () => rows().filter((row) => filters.every((filter) => filter(row)));
	const run = () => {
		if (operation === "insert") {
			if (table === "workspace_guardrail_assignments") {
				const error = insertLevel(payload);
				return error ? { data: null, error } : { data: [levels().at(-1)], error: null };
			}
			const row = table === "workspace_guardrails"
				? {
					id: newId(), created_at: "2026-10-12T12:00:00Z", updated_at: "2026-10-12T12:00:00Z", description: null,
					rate_requests_per_minute: null, rate_tokens_per_minute: null, rate_concurrent_requests: null, rate_fail_closed: false, rate_counting: null,
					...payload,
				}
				: { ...payload };
			if ((table === "key_guardrails" || table === "workspace_member_guardrails") && rows().some((existing) => existing.guardrail_id === row.guardrail_id
				&& (existing.key_id ?? existing.user_id) === (row.key_id ?? row.user_id))) return { data: null, error: { code: "23505", message: "duplicate" } };
			rows().push(row);
			if (table === "key_guardrails" || table === "workspace_member_guardrails") syncLegacy(table, "insert", null, row);
			return { data: [row], error: null };
		}
		const found = matches();
		if (operation === "select" && range) return { data: found.slice(range[0], range[1] + 1), error: null };
		if (operation === "update") {
			if (table === "workspace_guardrail_assignments" && payload?.guardrail_id
				&& found.some((row) => levels().some((other) => other !== row && sameTarget(other, { ...row, ...payload })))) {
				return { data: null, error: { code: "23505", message: "duplicate" } };
			}
			for (const row of found) {
				const before = { ...row };
				Object.assign(row, payload);
				if (table === "key_guardrails" || table === "workspace_member_guardrails") syncLegacy(table, "update", before, row);
			}
		}
		if (operation === "delete") {
			state.tables[table] = rows().filter((row) => !found.includes(row));
			if (table === "key_guardrails" || table === "workspace_member_guardrails") for (const row of found) syncLegacy(table, "delete", row, null);
			// Assignments go with their guardrail.
			if (table === "workspace_guardrails") {
				const gone = new Set(found.map((row) => row.id));
				for (const name of ["workspace_guardrail_assignments", "key_guardrails", "workspace_member_guardrails"]) {
					state.tables[name] = (state.tables[name] ?? []).filter((row) => !gone.has(row.guardrail_id));
				}
			}
		}
		return { data: found, error: null };
	};
	const query: any = {
		select: () => query,
		eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
		neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return query; },
		in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; },
		is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return query; },
		order: () => query,
		range: (from: number, to: number) => { range = [from, to]; return query; },
		maybeSingle: async () => {
			const result = run();
			// Copies, as the database returns them.
			return { data: result.data?.[0] ? { ...result.data[0] } : null, error: result.error };
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
vi.mock("@/lib/oauth/service", () => ({ getSupabaseActor: state.actor }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: state.audit }));
vi.mock("@core/rate-limit-policies", () => ({ publishRateLimitPlan: state.publish }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

async function call(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
	const { rateLimitsRoutes } = await import("./rate-limits");
	return rateLimitsRoutes.request(`https://example.com${path}`, {
		method,
		headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

const SESSION = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature";
const DASHBOARD = { authorization: `Bearer ${SESSION}`, "x-phaseo-workspace-id": WORKSPACE };

const rateGuardrail = (id: string, workspaceId: string, name: string, fields: Record<string, unknown> = {}) => ({
	id, workspace_id: workspaceId, kind: "rate", enabled: true, name, description: null,
	rate_requests_per_minute: null, rate_tokens_per_minute: null, rate_concurrent_requests: null, rate_fail_closed: false, rate_counting: null,
	created_at: "2026-10-12T12:00:00Z", updated_at: "2026-10-12T12:00:00Z", ...fields,
});
const rateGuardrails = () => state.tables.workspace_guardrails.filter((row) => row.kind === "rate");

describe("rate limit policy management", () => {
	beforeEach(() => {
		state.auth.value.scopes = [...ALL_SCOPES];
		state.tables = {
			workspace_guardrails: [
				rateGuardrail(STANDARD, WORKSPACE, "Standard", { rate_requests_per_minute: 60 }),
				rateGuardrail(SECOND, WORKSPACE, "Second", { rate_requests_per_minute: 10 }),
				rateGuardrail("00000000-0000-4000-8000-000000000008", OTHER_WORKSPACE, "Elsewhere", { rate_requests_per_minute: 5 }),
				// Made under Settings, Guardrails: shared across the whole workspace.
				rateGuardrail(SHARED, WORKSPACE, "Workspace pool", { rate_requests_per_minute: 1000, rate_counting: "shared" }),
				{ id: ACCESS, workspace_id: WORKSPACE, kind: "access", name: "ZDR", created_at: "2026-10-12T12:00:00Z" },
			],
			workspace_guardrail_assignments: [],
			key_guardrails: [],
			workspace_member_guardrails: [],
			keys: [
				{ id: KEY, workspace_id: WORKSPACE, status: "active" },
				{ id: OTHER_KEY, workspace_id: OTHER_WORKSPACE, status: "active" },
			],
			workspace_departments: [{ id: DEPARTMENT, workspace_id: WORKSPACE }],
			workspaces: [{ id: WORKSPACE, owner_user_id: "owner-user" }],
			workspace_members: [
				{ workspace_id: WORKSPACE, user_id: "admin-user", role: "admin" },
				{ workspace_id: WORKSPACE, user_id: "member-user", role: "member" },
				{ workspace_id: WORKSPACE, user_id: MEMBER, role: "member" },
			],
		};
		state.actor.mockReset().mockResolvedValue(null);
		state.audit.mockReset();
		state.publish.mockClear();
	});

	it("lists the caller's workspace rate guardrails as policies", async () => {
		const response = await call("/policies");
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.data.map((policy: any) => policy.name)).toEqual(["Standard", "Second", "Workspace pool"]);
		expect(body.data[0]).toEqual({
			id: STANDARD, workspace_id: WORKSPACE, name: "Standard", description: null,
			requests_per_minute: 60, tokens_per_minute: null, concurrent_requests: null, fail_closed: false,
			created_by: null, created_at: "2026-10-12T12:00:00Z", updated_at: "2026-10-12T12:00:00Z",
		});
		expect(body.has_more).toBe(false);
	});

	it("creates and audits a policy as a rate guardrail with no counting set", async () => {
		const response = await call("/policies", "POST", { name: " Batch jobs ", tokens_per_minute: 200_000, concurrent_requests: 4, fail_closed: true });
		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({ data: { name: "Batch jobs", requests_per_minute: null, tokens_per_minute: 200_000, concurrent_requests: 4, fail_closed: true } });
		expect(state.tables.workspace_guardrails.at(-1)).toMatchObject({
			workspace_id: WORKSPACE, kind: "rate", enabled: true, name: "Batch jobs",
			rate_tokens_per_minute: 200_000, rate_concurrent_requests: 4, rate_fail_closed: true, rate_counting: null,
		});
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "rate_limit_policy.created", targetName: "Batch jobs" }));
	});

	it("keeps policy names unique, ignoring case", async () => {
		expect((await call("/policies", "POST", { name: "standard ", requests_per_minute: 1 })).status).toBe(409);
		expect((await call(`/policies/${SECOND}`, "PATCH", { name: "STANDARD" })).status).toBe(409);
		expect((await call(`/policies/${STANDARD}`, "PATCH", { name: "Standard" })).status).toBe(200);
		// A guardrail of another kind may share the name.
		expect((await call("/policies", "POST", { name: "ZDR", requests_per_minute: 1 })).status).toBe(201);
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
		const cleared = await call(`/policies/${STANDARD}`, "PATCH", { requests_per_minute: null });
		expect(cleared.status).toBe(400);
		const updated = await call(`/policies/${STANDARD}`, "PATCH", { requests_per_minute: null, tokens_per_minute: 50_000 });
		expect(updated.status).toBe(200);
		await expect(updated.json()).resolves.toMatchObject({ data: { requests_per_minute: null, tokens_per_minute: 50_000 } });
		expect(state.tables.workspace_guardrails[0]).toMatchObject({ rate_requests_per_minute: null, rate_tokens_per_minute: 50_000 });
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "rate_limit_policy.updated" }));
	});

	it("does not reach policies in another workspace, or guardrails of another kind", async () => {
		for (const id of ["00000000-0000-4000-8000-000000000008", ACCESS]) {
			expect((await call(`/policies/${id}`)).status).toBe(404);
			expect((await call(`/policies/${id}`, "PATCH", { requests_per_minute: 1 })).status).toBe(404);
			expect((await call(`/policies/${id}`, "DELETE")).status).toBe(404);
		}
		expect(state.tables.workspace_guardrails).toHaveLength(5);
		expect(state.tables.workspace_guardrails.find((row) => row.id === ACCESS)).not.toHaveProperty("rate_requests_per_minute");
	});

	it("deletes a policy and its assignments", async () => {
		await call("/assignments", "POST", { policy_id: STANDARD, target_type: "key", target_id: KEY });
		const response = await call(`/policies/${STANDARD}`, "DELETE");
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ data: { id: STANDARD, deleted: true } });
		expect(state.tables.workspace_guardrail_assignments).toHaveLength(0);
		expect(state.tables.key_guardrails).toHaveLength(0);
	});

	it("assigns a policy to a key through key_guardrails, and one key gets at most one policy", async () => {
		state.auth.value.userId = "admin-user";
		try {
			const created = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "key", target_id: KEY });
			expect(created.status).toBe(201);
			const { data } = await created.json() as any;
			expect(data).toMatchObject({ policy_id: STANDARD, target_type: "key", target_id: KEY, created_by: "admin-user" });
			expect(state.tables.key_guardrails).toEqual([{ key_id: KEY, guardrail_id: STANDARD }]);
			expect(state.tables.workspace_guardrail_assignments).toEqual([expect.objectContaining({
				id: data.id, workspace_id: WORKSPACE, guardrail_id: STANDARD, target_type: "key", target_id: KEY, created_by: "admin-user",
			})]);
			expect((await call("/assignments", "POST", { policy_id: STANDARD, target_type: "key", target_id: KEY })).status).toBe(409);
			expect((await call("/assignments", "POST", { policy_id: SECOND, target_type: "key", target_id: KEY })).status).toBe(409);
		} finally {
			delete state.auth.value.userId;
		}
	});

	it("assigns members through workspace_member_guardrails and departments at their level", async () => {
		const member = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "member", target_id: MEMBER });
		expect(member.status).toBe(201);
		expect(state.tables.workspace_member_guardrails).toEqual([{ workspace_id: WORKSPACE, user_id: MEMBER, guardrail_id: STANDARD }]);
		const department = await call("/assignments", "POST", { policy_id: SECOND, target_type: "department", target_id: DEPARTMENT });
		expect(department.status).toBe(201);
		await expect(department.json()).resolves.toMatchObject({ data: { policy_id: SECOND, target_type: "department", target_id: DEPARTMENT } });
		expect(state.tables.workspace_guardrail_assignments.map((row) => `${row.target_type}:${row.guardrail_id}`))
			.toEqual([`member:${STANDARD}`, `department:${SECOND}`]);
	});

	it("rejects targets from another workspace, malformed targets and guardrail targets", async () => {
		const foreignKey = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "key", target_id: OTHER_KEY });
		expect(foreignKey.status).toBe(400);
		const stranger = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "member", target_id: "00000000-0000-4000-8000-00000000000c" });
		expect(stranger.status).toBe(400);
		const otherDepartment = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "department", target_id: "00000000-0000-4000-8000-00000000000d" });
		expect(otherDepartment.status).toBe(400);
		const missingTarget = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "member" });
		expect(missingTarget.status).toBe(400);
		const unexpectedTarget = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "end_user_default", target_id: MEMBER });
		expect(unexpectedTarget.status).toBe(400);
		const unknownType = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "team", target_id: MEMBER });
		expect(unknownType.status).toBe(400);
		const guardrail = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "guardrail", target_id: ACCESS });
		expect(guardrail.status).toBe(400);
		await expect(guardrail.json()).resolves.toMatchObject({ message: expect.stringContaining("no longer be assigned to a guardrail") });
		const notRate = await call("/assignments", "POST", { policy_id: ACCESS, target_type: "key", target_id: KEY });
		expect(notRate.status).toBe(400);
		expect(state.tables.workspace_guardrail_assignments).toHaveLength(0);
		expect((await (await call("/assignments?target_type=guardrail")).json() as any).data).toEqual([]);
	});

	it("sets the workspace end-user default, changes its policy, and removes it", async () => {
		const created = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "end_user_default" });
		expect(created.status).toBe(201);
		const { data } = await created.json() as any;
		expect(data).toMatchObject({ target_type: "end_user_default", target_id: null });
		expect(state.tables.workspace_guardrail_assignments).toEqual([expect.objectContaining({ guardrail_id: STANDARD, target_type: "workspace", target_id: null })]);
		expect((await call("/assignments", "POST", { policy_id: SECOND, target_type: "end_user_default" })).status).toBe(409);
		const listed = await call("/assignments?target_type=end_user_default");
		await expect(listed.json()).resolves.toMatchObject({ data: [{ id: data.id }] });
		const updated = await call(`/assignments/${data.id}`, "PATCH", { policy_id: SECOND });
		expect(updated.status).toBe(200);
		await expect(updated.json()).resolves.toMatchObject({ data: { id: data.id, policy_id: SECOND, target_type: "end_user_default" } });
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "rate_limit_assignment.updated" }));
		const deleted = await call(`/assignments/${data.id}`, "DELETE");
		expect(deleted.status).toBe(200);
		expect(state.tables.workspace_guardrail_assignments).toHaveLength(0);
	});

	it("keeps rate guardrails that count another way out of the end-user default", async () => {
		const refused = await call("/assignments", "POST", { policy_id: SHARED, target_type: "end_user_default" });
		expect(refused.status).toBe(400);
		// A shared workspace assignment made under Settings, Guardrails has no equivalent here.
		state.tables.workspace_guardrail_assignments.push({ id: "00000000-0000-4000-8000-0000000000e1", workspace_id: WORKSPACE, guardrail_id: SHARED, target_type: "workspace", target_id: null, created_by: null, created_at: "2026-10-12T12:00:00Z" });
		expect((await (await call("/assignments")).json() as any).data).toEqual([]);
		expect((await call("/assignments/00000000-0000-4000-8000-0000000000e1")).status).toBe(404);
		// It does not block the end-user default either.
		expect((await call("/assignments", "POST", { policy_id: STANDARD, target_type: "end_user_default" })).status).toBe(201);
		const created = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "key", target_id: KEY });
		const keyAssignment = (await created.json() as any).data.id;
		expect((await call(`/assignments/${keyAssignment}`, "PATCH", { policy_id: SHARED })).status).toBe(200);
		const endUser = state.tables.workspace_guardrail_assignments.find((row) => row.target_type === "workspace" && row.guardrail_id === STANDARD);
		expect((await call(`/assignments/${endUser.id}`, "PATCH", { policy_id: SHARED })).status).toBe(400);
	});

	it("moves a key assignment to another policy and keeps its id", async () => {
		const created = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "key", target_id: KEY });
		const { data } = await created.json() as any;
		const updated = await call(`/assignments/${data.id}`, "PATCH", { policy_id: SECOND });
		expect(updated.status).toBe(200);
		await expect(updated.json()).resolves.toMatchObject({ data: { id: data.id, policy_id: SECOND, target_id: KEY } });
		expect(state.tables.key_guardrails).toEqual([{ key_id: KEY, guardrail_id: SECOND }]);
		expect(state.tables.workspace_guardrail_assignments).toEqual([expect.objectContaining({ id: data.id, guardrail_id: SECOND })]);
		expect((await (await call(`/assignments/${data.id}`)).json() as any).data.policy_id).toBe(SECOND);
		expect((await call(`/assignments/${data.id}`, "DELETE")).status).toBe(200);
		expect(state.tables.key_guardrails).toHaveLength(0);
		expect(state.tables.workspace_guardrail_assignments).toHaveLength(0);
	});

	it("pages assignment listings with offset and limit", async () => {
		state.tables.workspace_guardrail_assignments = [KEY, MEMBER, OTHER_KEY].map((target, index) => ({
			id: `00000000-0000-4000-8000-00000000002${index}`, workspace_id: WORKSPACE, guardrail_id: STANDARD,
			target_type: "key", target_id: target, created_by: null, created_at: "2026-10-12T12:00:00Z",
		}));
		const first = await (await call("/assignments?limit=2")).json() as any;
		expect(first.data.map((row: any) => row.target_id)).toEqual([KEY, MEMBER]);
		expect(first.has_more).toBe(true);
		const second = await (await call("/assignments?limit=2&offset=2")).json() as any;
		expect(second.data.map((row: any) => row.target_id)).toEqual([OTHER_KEY]);
		expect(second.has_more).toBe(false);
		expect((await (await call(`/assignments?policy_id=${SECOND}`)).json() as any).data).toEqual([]);
		expect((await call("/assignments?limit=251")).status).toBe(400);
		expect((await call("/policies?offset=-1")).status).toBe(400);
	});

	it("republishes the enforcement plan after every successful write, and only then", async () => {
		const created = await call("/policies", "POST", { name: "Interactive", requests_per_minute: 30 });
		const newPolicy = (await created.json() as any).data.id;
		await call(`/policies/${newPolicy}`, "PATCH", { requests_per_minute: 20 });
		const assigned = await call("/assignments", "POST", { policy_id: STANDARD, target_type: "key", target_id: KEY });
		const assignmentId = (await assigned.json() as any).data.id;
		await call(`/assignments/${assignmentId}`, "PATCH", { policy_id: newPolicy });
		await call(`/assignments/${assignmentId}`, "DELETE");
		await call(`/policies/${newPolicy}`, "DELETE");
		expect(state.publish).toHaveBeenCalledTimes(6);
		expect(state.publish.mock.calls.every(([workspaceId]) => workspaceId === WORKSPACE)).toBe(true);

		state.publish.mockClear();
		await call("/policies", "POST", { name: "Invalid" });
		await call("/assignments", "POST", { policy_id: STANDARD, target_type: "key", target_id: OTHER_KEY });
		await call("/policies");
		expect(state.publish).not.toHaveBeenCalled();
	});

	it("still succeeds when the plan cannot be published", async () => {
		state.publish.mockResolvedValueOnce(false);
		const response = await call("/policies", "POST", { name: "Unpublished", requests_per_minute: 5 });
		expect(response.status).toBe(201);
	});

	it("requires the matching rate_limits scope", async () => {
		state.auth.value.scopes = ["rate_limits:read"];
		const response = await call("/policies", "POST", { name: "Denied", requests_per_minute: 1 });
		expect(response.status).toBe(403);
		expect(rateGuardrails()).toHaveLength(4);
	});

	it("lets a workspace admin manage policies from the dashboard session", async () => {
		const { guardManagementAuth } = await import("@/pipeline/before/guards");
		vi.mocked(guardManagementAuth).mockClear();
		state.auth.value.scopes = [];
		state.actor.mockResolvedValue({ userId: "admin-user" });
		const response = await call("/policies", "POST", { name: "Dashboard", requests_per_minute: 30 }, DASHBOARD);
		expect(response.status).toBe(201);
		expect(state.actor).toHaveBeenCalledWith(SESSION);
		expect(guardManagementAuth).not.toHaveBeenCalled();
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ workspaceId: WORKSPACE, actorUserId: "admin-user", action: "rate_limit_policy.created" }));
		expect(state.publish).toHaveBeenCalledWith(WORKSPACE);
	});

	it("treats the workspace owner as a manager even without a member row", async () => {
		state.actor.mockResolvedValue({ userId: "owner-user" });
		expect((await call("/policies", "GET", undefined, DASHBOARD)).status).toBe(200);
	});

	it("refuses dashboard members and outsiders", async () => {
		state.actor.mockResolvedValue({ userId: "member-user" });
		expect((await call("/policies", "POST", { name: "Member", requests_per_minute: 1 }, DASHBOARD)).status).toBe(403);
		state.actor.mockResolvedValue({ userId: "stranger" });
		expect((await call("/policies", "GET", undefined, DASHBOARD)).status).toBe(403);
		expect(rateGuardrails()).toHaveLength(4);
		expect(state.publish).not.toHaveBeenCalled();
	});

	it("keeps management keys working when they also send the workspace header", async () => {
		const { guardManagementAuth } = await import("@/pipeline/before/guards");
		vi.mocked(guardManagementAuth).mockClear();
		const headers = { authorization: "Bearer phaseo_mk_test", "x-phaseo-workspace-id": WORKSPACE };
		expect((await call("/policies", "GET", undefined, headers)).status).toBe(200);
		expect(state.actor).not.toHaveBeenCalled();
		expect(guardManagementAuth).toHaveBeenCalledTimes(1);
	});

	it("falls back to management authentication when Supabase rejects the token", async () => {
		const { guardManagementAuth } = await import("@/pipeline/before/guards");
		vi.mocked(guardManagementAuth).mockClear();
		state.auth = { ok: false, response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }) };
		try {
			expect((await call("/policies", "GET", undefined, DASHBOARD)).status).toBe(401);
			expect(state.actor).toHaveBeenCalledWith(SESSION);
			expect(guardManagementAuth).toHaveBeenCalledTimes(1);
		} finally {
			state.auth = { ok: true, value: { workspaceId: WORKSPACE, authMethod: "api_key", scopes: [...ALL_SCOPES] } };
		}
	});
});
