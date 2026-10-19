import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const OTHER_WORKSPACE = "00000000-0000-4000-8000-000000000009";
const EXISTING = "00000000-0000-4000-8000-000000000002";
const ELSEWHERE = "00000000-0000-4000-8000-000000000008";
const KEY = "00000000-0000-4000-8000-000000000003";
const ALL_SCOPES = ["classifiers:read", "classifiers:write", "classifiers:delete"];

const state = vi.hoisted(() => ({
	auth: { ok: true, value: { workspaceId: "00000000-0000-4000-8000-000000000001", authMethod: "api_key", scopes: [] as string[] } } as any,
	tables: {} as Record<string, any[]>,
	audit: vi.fn(),
	nextId: 100,
	insertError: null as null | { code: string; message: string },
}));

function tableQuery(table: string, operation: "select" | "insert" | "update" | "delete", payload?: Record<string, unknown>) {
	const filters: Array<(row: any) => boolean> = [];
	const rows = () => (state.tables[table] ??= []);
	const matches = () => rows().filter((row) => filters.every((filter) => filter(row)));
	const run = () => {
		if (operation === "insert") {
			if (state.insertError) return { data: null, error: state.insertError };
			const row = {
				id: `00000000-0000-4000-8000-000000000${state.nextId++}`,
				created_at: "2026-10-19T12:00:00Z",
				updated_at: "2026-10-19T12:00:00Z",
				description: null,
				enabled: true,
				instructions: "",
				sample_rate_bps: 10_000,
				sample_by: "request",
				input_scope: "prompt",
				scope: {},
				monthly_budget_nanos: null,
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
		order: () => query,
		limit: () => query,
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
	const { classifiersRoutes } = await import("./classifiers");
	return classifiersRoutes.request(`https://example.com${path}`, {
		method,
		...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
	});
}

const DEPARTMENT = {
	key: "department",
	name: "Department",
	allow_other: true,
	values: [{ value: "engineering", description: "Writing or reviewing code" }, "legal", "sales"],
};

function existingRow(id: string, workspaceId: string, name: string) {
	return {
		id, workspace_id: workspaceId, name, description: null, enabled: true, model: "google/gemini-2.5-flash-lite",
		instructions: "", dimensions: [{ ...DEPARTMENT, values: [{ value: "legal", description: null }, { value: "sales", description: null }] }],
		sample_rate_bps: 2_500, sample_by: "request", input_scope: "prompt", scope: {}, monthly_budget_nanos: "5000000000",
		created_by: null, created_at: "2026-10-19T12:00:00Z", updated_at: "2026-10-19T12:00:00Z",
	};
}

describe("classifier management", () => {
	beforeEach(() => {
		state.auth.value.scopes = [...ALL_SCOPES];
		state.insertError = null;
		state.tables = {
			workspace_request_classifiers: [existingRow(EXISTING, WORKSPACE, "Department"), existingRow(ELSEWHERE, OTHER_WORKSPACE, "Elsewhere")],
		};
		state.audit.mockReset();
	});

	it("lists only the caller's workspace classifiers, in API units", async () => {
		const response = await call("/");
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.data).toEqual([expect.objectContaining({ id: EXISTING, name: "Department", sample_rate: 0.25, monthly_budget_usd: 5 })]);
	});

	it("creates and audits a classifier, normalising values and units", async () => {
		const response = await call("/", "POST", {
			name: " Department ",
			model: "google/gemini-2.5-flash-lite",
			dimensions: [DEPARTMENT],
			sample_rate: 0.1,
			sample_by: "session",
			scope: { key_ids: [KEY.toUpperCase()] },
			monthly_budget_usd: 12.5,
		});
		expect(response.status).toBe(201);
		const body = await response.json() as any;
		expect(body.data).toMatchObject({
			name: "Department",
			sample_rate: 0.1,
			sample_by: "session",
			scope: { key_ids: [KEY] },
			monthly_budget_usd: 12.5,
			dimensions: [{
				key: "department",
				multiple: false,
				allow_other: true,
				values: [
					{ value: "engineering", description: "Writing or reviewing code" },
					{ value: "legal", description: null },
					{ value: "sales", description: null },
				],
			}],
		});
		const stored = state.tables.workspace_request_classifiers.at(-1);
		expect(stored).toMatchObject({ workspace_id: WORKSPACE, sample_rate_bps: 1_000, monthly_budget_nanos: 12_500_000_000 });
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			action: "request_classifier.created",
			metadata: expect.objectContaining({ dimension_keys: ["department"], classified_input: "prompt" }),
		}));
	});

	it.each([
		[{ model: "m", dimensions: [DEPARTMENT] }, "name is required"],
		[{ name: "x", dimensions: [DEPARTMENT] }, "model is required"],
		[{ name: "x", model: "m" }, "dimensions is required"],
		[{ name: "x", model: "not a model", dimensions: [DEPARTMENT] }, "model must be a model id"],
		[{ name: "x", model: "m", dimensions: [] }, "dimensions must be an array of 1 to 12"],
		[{ name: "x", model: "m", dimensions: [DEPARTMENT, DEPARTMENT] }, "duplicate key"],
		[{ name: "x", model: "m", dimensions: [{ key: "bad key", values: ["a", "b"] }] }, "dimensions[0].key"],
		[{ name: "x", model: "m", dimensions: [{ key: "tier", values: ["only"] }] }, "values must have 2 to 50"],
		[{ name: "x", model: "m", dimensions: [{ key: "tier", values: ["a", "A"] }] }, "duplicate value"],
		[{ name: "x", model: "m", dimensions: [{ key: "tier", allow_other: true, values: ["a", "other"] }] }, "added automatically"],
		[{ name: "x", model: "m", dimensions: [{ key: "tier", values: ["a", "b"], multiple: "yes" }] }, "multiple must be a boolean"],
		[{ name: "x", model: "m", dimensions: [DEPARTMENT], sample_rate: 0 }, "sample_rate must be"],
		[{ name: "x", model: "m", dimensions: [DEPARTMENT], sample_rate: 1.5 }, "sample_rate must be"],
		[{ name: "x", model: "m", dimensions: [DEPARTMENT], sample_by: "user" }, "sample_by must be one of"],
		[{ name: "x", model: "m", dimensions: [DEPARTMENT], input_scope: "all" }, "input_scope must be one of"],
		[{ name: "x", model: "m", dimensions: [DEPARTMENT], scope: { teams: [] } }, "scope.teams is not supported"],
		[{ name: "x", model: "m", dimensions: [DEPARTMENT], scope: { key_ids: ["nope"] } }, "scope.key_ids must contain only ids"],
		[{ name: "x", model: "m", dimensions: [DEPARTMENT], monthly_budget_usd: -1 }, "monthly_budget_usd must be"],
		[{ name: "x", model: "m", dimensions: [DEPARTMENT], instructions: "x".repeat(8_001) }, "instructions must be"],
		[{ name: "x", model: "m", dimensions: [DEPARTMENT], sampleRate: 0.1 }, "Unknown field: sampleRate"],
	])("rejects an invalid classifier %#", async (body, message) => {
		const response = await call("/", "POST", body);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: "bad_request", message: expect.stringContaining(message) });
	});

	it("reports the per-workspace limit and duplicate names", async () => {
		const body = { name: "x", model: "m", dimensions: [DEPARTMENT] };
		state.insertError = { code: "23514", message: "request_classifier_limit_reached" };
		const limited = await call("/", "POST", body);
		expect(limited.status).toBe(400);
		await expect(limited.json()).resolves.toMatchObject({ message: expect.stringContaining("at most 5 classifiers") });
		state.insertError = { code: "23505", message: "duplicate key value" };
		expect((await call("/", "POST", body)).status).toBe(409);
	});

	it("updates only the fields sent and can clear the budget", async () => {
		const response = await call(`/${EXISTING}`, "PATCH", { enabled: false, monthly_budget_usd: null });
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ data: { enabled: false, monthly_budget_usd: null, sample_rate: 0.25 } });
		expect((await call(`/${EXISTING}`, "PATCH", {})).status).toBe(400);
	});

	it("does not reach classifiers in another workspace", async () => {
		expect((await call(`/${ELSEWHERE}`)).status).toBe(404);
		expect((await call(`/${ELSEWHERE}`, "PATCH", { enabled: false })).status).toBe(404);
		expect((await call(`/${ELSEWHERE}`, "DELETE")).status).toBe(404);
		expect(state.tables.workspace_request_classifiers).toHaveLength(2);
	});

	it("deletes a classifier", async () => {
		const response = await call(`/${EXISTING}`, "DELETE");
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ data: { id: EXISTING, deleted: true } });
		expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "request_classifier.deleted" }));
	});

	it("requires the matching scope", async () => {
		state.auth.value.scopes = ["classifiers:read"];
		expect((await call("/")).status).toBe(200);
		expect((await call("/", "POST", { name: "x", model: "m", dimensions: [DEPARTMENT] })).status).toBe(403);
		expect((await call(`/${EXISTING}`, "DELETE")).status).toBe(403);
	});
});
