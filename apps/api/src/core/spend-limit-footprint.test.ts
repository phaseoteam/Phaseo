import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: unknown };

const db = vi.hoisted(() => ({
	key: { data: null, error: null } as Result,
	workspaceBudgets: { data: [], error: null } as Result,
	departmentBudgets: { data: [], error: null } as Result,
	queries: [] as Array<{ table: string; columns: string; filters: Array<[string, unknown]> }>,
}));

function query(table: string) {
	const entry = { table, columns: "", filters: [] as Array<[string, unknown]> };
	db.queries.push(entry);
	const result = (): Result => table === "keys" ? db.key : table === "workspace_budgets" ? db.workspaceBudgets : db.departmentBudgets;
	const builder = {
		select(columns: string) { entry.columns = columns; return builder; },
		eq(column: string, value: unknown) { entry.filters.push([column, value]); return builder; },
		limit: async () => result(),
		maybeSingle: async () => result(),
	};
	return builder;
}

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({ from: query }),
	getBindingsIfConfigured: () => ({}),
	getCache: () => { throw new Error("KV is not used"); },
	dispatchBackground: () => undefined,
}));

const { footprintIsEmpty, loadSpendLimitFootprint, readSpendLimitFootprint } = await import("./spend-limit-footprint");
const { __resetTieredCacheForTests } = await import("./tiered-cache");

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const unlimitedKey = {
	soft_blocked: false,
	daily_limit_requests: 0, weekly_limit_requests: 0, monthly_limit_requests: 0,
	daily_limit_cost_nanos: 0, weekly_limit_cost_nanos: null, monthly_limit_cost_nanos: 0,
};

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
	db.key = { data: { ...unlimitedKey }, error: null };
	db.workspaceBudgets = { data: [], error: null };
	db.departmentBudgets = { data: [], error: null };
	db.queries = [];
	__resetTieredCacheForTests();
});

afterEach(() => { vi.useRealTimers(); });

describe("spend-limit footprint", () => {
	it("is empty for an uncapped key in a workspace without budgets", async () => {
		const footprint = await loadSpendLimitFootprint(WORKSPACE, KEY);
		expect(footprint).toEqual({ keyLimited: false, softBlocked: false, workspaceBudgets: false, departmentBudgets: false });
		expect(footprintIsEmpty(footprint)).toBe(true);
		expect(db.queries).toEqual([
			{ table: "keys", columns: expect.stringContaining("monthly_limit_cost_nanos"), filters: [["id", KEY], ["workspace_id", WORKSPACE]] },
			{ table: "workspace_budgets", columns: "id", filters: [["workspace_id", WORKSPACE]] },
			{ table: "workspace_department_budgets", columns: "id", filters: [["workspace_id", WORKSPACE]] },
		]);
	});

	it.each([
		"daily_limit_requests", "weekly_limit_requests", "monthly_limit_requests",
		"daily_limit_cost_nanos", "weekly_limit_cost_nanos", "monthly_limit_cost_nanos",
	])("sees a cap in %s", async (column) => {
		db.key = { data: { ...unlimitedKey, [column]: 5 }, error: null };
		const footprint = await loadSpendLimitFootprint(WORKSPACE, KEY);
		expect(footprint).toMatchObject({ keyLimited: true });
		expect(footprintIsEmpty(footprint)).toBe(false);
	});

	it("treats an unreadable limit value as a cap", async () => {
		db.key = { data: { ...unlimitedKey, daily_limit_cost_nanos: "not a number" }, error: null };
		expect(await loadSpendLimitFootprint(WORKSPACE, KEY)).toMatchObject({ keyLimited: true });
	});

	it("sees a soft block, a workspace budget and a department budget", async () => {
		db.key = { data: { ...unlimitedKey, soft_blocked: true }, error: null };
		expect(footprintIsEmpty(await loadSpendLimitFootprint(WORKSPACE, KEY))).toBe(false);
		db.key = { data: { ...unlimitedKey }, error: null };
		db.workspaceBudgets = { data: [{ id: "budget" }], error: null };
		expect(await loadSpendLimitFootprint(WORKSPACE, KEY)).toMatchObject({ workspaceBudgets: true, departmentBudgets: false });
		db.workspaceBudgets = { data: [], error: null };
		db.departmentBudgets = { data: [{ id: "department-budget" }], error: null };
		expect(await loadSpendLimitFootprint(WORKSPACE, KEY)).toMatchObject({ workspaceBudgets: false, departmentBudgets: true });
	});

	it("is unknown for a key outside the workspace, and fails on a database error", async () => {
		db.key = { data: null, error: null };
		expect(await loadSpendLimitFootprint(WORKSPACE, KEY)).toBeNull();
		expect(footprintIsEmpty(null)).toBe(false);
		for (const table of ["key", "workspaceBudgets", "departmentBudgets"] as const) {
			db.key = { data: { ...unlimitedKey }, error: null };
			db.workspaceBudgets = { data: [], error: null };
			db.departmentBudgets = { data: [], error: null };
			db[table] = { data: null, error: { message: "timeout" } };
			await expect(loadSpendLimitFootprint(WORKSPACE, KEY)).rejects.toThrow("spend_limit_footprint_failed");
		}
	});

	it("serves a cached copy, but never one older than the coordinator's reseed interval", async () => {
		expect(footprintIsEmpty(await readSpendLimitFootprint(WORKSPACE, KEY))).toBe(true);
		expect(footprintIsEmpty(await readSpendLimitFootprint(WORKSPACE, KEY))).toBe(true);
		expect(db.queries).toHaveLength(3);

		// A cap is added. Within the reseed interval the cached copy may still be served
		// (the coordinator itself rereads limits only this often)...
		db.key = { data: { ...unlimitedKey, daily_limit_requests: 1 }, error: null };
		vi.setSystemTime(Date.now() + 5_000);
		expect(footprintIsEmpty(await readSpendLimitFootprint(WORKSPACE, KEY))).toBe(true);
		// ...but past it the read waits for Postgres.
		vi.setSystemTime(Date.now() + 60_000);
		expect(await readSpendLimitFootprint(WORKSPACE, KEY)).toMatchObject({ keyLimited: true });
	});
});
