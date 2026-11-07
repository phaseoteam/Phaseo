import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// An ordinary request's spend handed from the coordinator's memory to the database, on the real
// seed SQL and the real SpendLimitDurableObject: the coordinator holds the request's admission
// (its seed excludes the request), the audit row lands, and the next seed counts it. At every step
// the department's spend is the request once: never missing (a gap), never counted from memory and
// the database at once (a double count).
const runtime = vi.hoisted(() => ({ bindings: null as Record<string, unknown> | null, background: [] as Promise<unknown>[] }));

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindingsIfConfigured: () => runtime.bindings,
	dispatchBackground: (promise: Promise<unknown>) => { runtime.background.push(promise.catch(() => undefined)); },
}));

const { SpendLimitDurableObject } = await import("./spend-limit-durable-object");
const { __resetSpendLimitsForTests } = await import("./spend-limits");

const WORKSPACE = "10000000-0000-4000-8000-000000000011";
const KEY = "30000000-0000-4000-8000-000000000011";
const OTHER_KEY = "30000000-0000-4000-8000-000000000012";
const DEPARTMENT = "40000000-0000-4000-8000-000000000011";
const BILLING_ID = "bill-ordinary-1";
const REQUEST_ID = "req-ordinary-1";
const DOLLAR = 1_000_000_000;

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
let db: Db;
const seeds: Array<{ exclude: string[]; seed: any }> = [];

class SeededSpendLimitDurableObject extends SpendLimitDurableObject {
	protected override async loadSeed(workspaceId: string, keyIds: string[], exclude: string[]): Promise<any> {
		await db.exec("set role service_role");
		try {
			const seed = (await db.query("select public.gateway_spend_limit_seed($1, $2::uuid[], $3::text[]) as seed", [workspaceId, keyIds, exclude])).rows[0].seed;
			seeds.push({ exclude: [...exclude], seed });
			return seed;
		} finally {
			await db.exec("reset role");
		}
	}
	/** Loads and publishes a seed now, as the coordinator's minute reseed does. */
	async reseedNow(): Promise<void> {
		await (this as unknown as { reseed: (extraKeyId: string | null) => Promise<void> }).reseed(null);
	}
}

let coordinator: SeededSpendLimitDurableObject;
function startCoordinator() {
	const sqlite = new DatabaseSync(":memory:");
	const state = {
		blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
		storage: {
			sql: {
				exec: (query: string, ...args: Array<string | number | null>) => {
					const statement = sqlite.prepare(query);
					const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
					return { toArray: () => rows, one: () => rows[0] };
				},
			},
		},
	} as unknown as DurableObjectState;
	coordinator = new SeededSpendLimitDurableObject(state, {} as never);
	runtime.bindings = { SPEND_LIMITS: { getByName: () => coordinator }, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
	__resetSpendLimitsForTests();
}

/** The department spend the coordinator decides on: a $10 budget, so one more request is refused and reports it. */
async function departmentSpend(admissionId: string): Promise<number> {
	const result = await coordinator.acquire(WORKSPACE, OTHER_KEY, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], admissionId);
	if ("denial" in result && result.denial) return Number(result.denial.gate.currentValue);
	if (result.lease.expiresAt) await coordinator.returnLeases(WORKSPACE, [{ id: result.lease.id, usedRequests: 0, usedUnits: 0, inFlightRequests: 0 }]);
	else await coordinator.release(WORKSPACE, result.lease.id, admissionId);
	return Number.NaN; // allowed: below the budget, so the spend is not reported
}

beforeAll(async () => {
	const { PGlite } = await import("@electric-sql/pglite");
	const fixture = await import(/* @vite-ignore */ new URL("../../../../supabase/tests/fixtures/budget-enforcement-db.mjs", import.meta.url).href);
	db = await fixture.createBudgetDatabase(PGlite);
	await fixture.applyMigration(db, await fixture.readMigration());
	await db.exec(`
		insert into public.workspaces (id) values ('${WORKSPACE}');
		insert into public.wallets (workspace_id, balance_nanos) values ('${WORKSPACE}', ${100 * DOLLAR});
		insert into public.keys (id, workspace_id, department_id) values ('${KEY}', '${WORKSPACE}', '${DEPARTMENT}'), ('${OTHER_KEY}', '${WORKSPACE}', '${DEPARTMENT}');
		insert into public.workspace_departments (id, workspace_id, name) values ('${DEPARTMENT}', '${WORKSPACE}', 'Engineering');
		insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values ('${WORKSPACE}', '${DEPARTMENT}', 'daily', ${10 * DOLLAR});
		-- $6 already spent today by the department's other key.
		insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos) values ('${WORKSPACE}', 'req-earlier', '${OTHER_KEY}', true, ${6 * DOLLAR});
	`);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("seed handoff in the spend-limit coordinator", () => {
	it("counts a request once while it is held, when its audit row lands, and after the seed takes it over", async () => {
		startCoordinator();
		expect(await departmentSpend("probe-0")).toBeNaN(); // $6 of $10: allowed

		// The request is charged $4.50 (the charge row lands first, as the gateway writes it), and the
		// coordinator records its spend: held from memory. $10.50: refused.
		await db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id)
			values ($1, $2, $3, 'applied', true, $4)`, [WORKSPACE, BILLING_ID, 4.5 * DOLLAR, KEY]);
		await coordinator.record(WORKSPACE, { keyId: KEY, billingRequestId: BILLING_ID, requestId: REQUEST_ID, costNanos: 4.5 * DOLLAR, requests: 1 });
		expect(await departmentSpend("probe-1")).toBe(10.5 * DOLLAR);

		// A seed published while the request is held excludes it by both ids: its audit row has not
		// landed, and its charge row (by billing id) is already there.
		await coordinator.reseedNow();
		expect(seeds.at(-1)!.exclude).toEqual(expect.arrayContaining([REQUEST_ID, BILLING_ID]));
		expect(await departmentSpend("probe-2")).toBe(10.5 * DOLLAR);

		// The audit row lands. The next seed still excludes the request and finds its row.
		await db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos)
			values ($1, $2, $3, $4, true, $5)`, [WORKSPACE, REQUEST_ID, BILLING_ID, KEY, 4.5 * DOLLAR]);
		await coordinator.reseedNow();
		expect(seeds.at(-1)!.exclude).toContain(REQUEST_ID);
		expect(seeds.at(-1)!.seed.excluded_rows.map((row: { request_id: string }) => row.request_id)).toContain(REQUEST_ID);
		expect(await departmentSpend("probe-3")).toBe(10.5 * DOLLAR);

		// The seed after that no longer excludes it and counts its row; the held copy is dropped.
		await coordinator.reseedNow();
		expect(seeds.at(-1)!.exclude).not.toContain(REQUEST_ID);
		expect(seeds.at(-1)!.exclude).not.toContain(BILLING_ID);
		expect(seeds.at(-1)!.seed.department_budgets[0].usage_nanos).toBe(10.5 * DOLLAR);
		expect(await departmentSpend("probe-4")).toBe(10.5 * DOLLAR);

		// A coordinator that restarts holds nothing and reads it from the database, once.
		startCoordinator();
		expect(await departmentSpend("probe-5")).toBe(10.5 * DOLLAR);
	});
});
