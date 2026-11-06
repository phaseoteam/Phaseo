import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A stream charged at drain checkpoints, on the real seed SQL. The database is the source of truth
// for stepped charges: the seed counts the charge row (until its request row lands) and lists it by
// billing id, whatever the coordinator excludes, so a coordinator with no copy of it, fresh or
// restarted, counts it exactly once. (Dropping an in-memory copy for a listed id is the
// coordinator's side of the contract, tested with it.)
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

const WORKSPACE = "10000000-0000-4000-8000-000000000001";
const KEY = "30000000-0000-4000-8000-000000000001";
const OTHER_KEY = "30000000-0000-4000-8000-000000000002";
const THIRD_KEY = "30000000-0000-4000-8000-000000000003";
const DEPARTMENT = "40000000-0000-4000-8000-000000000001";
const BILLING_ID = "bill-stream-1";
const REQUEST_ID = "req-stream-1";
const DOLLAR = 1_000_000_000;

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
let db: Db;
const seedCalls: string[][] = [];
const seeds: any[] = [];

class SeededSpendLimitDurableObject extends SpendLimitDurableObject {
	protected override async loadSeed(workspaceId: string, keyIds: string[], exclude: string[]): Promise<any> {
		seedCalls.push([...exclude]);
		await db.exec("set role service_role");
		try {
			const seed = (await db.query("select public.gateway_spend_limit_seed($1, $2::uuid[], $3::text[]) as seed", [workspaceId, keyIds, exclude])).rows[0].seed;
			seeds.push(seed);
			return seed;
		} finally {
			await db.exec("reset role");
		}
	}
}

/** A coordinator with its own (empty) storage: a fresh object, or one that restarted. */
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
	return coordinator;
}

let coordinator: InstanceType<typeof SeededSpendLimitDurableObject>;
/** The coordinator's own decision for one request of keyId, leaving nothing held. */
async function admit(keyId: string, admissionId: string) {
	const result = await coordinator.acquire(WORKSPACE, keyId, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], admissionId);
	if ("denial" in result) return { outcome: "denied", keyLimit: result.denial?.gate };
	if (result.lease.expiresAt) await coordinator.returnLeases(WORKSPACE, [{ id: result.lease.id, usedRequests: 0, usedUnits: 0, inFlightRequests: 0 }]);
	else await coordinator.release(WORKSPACE, result.lease.id, admissionId);
	return { outcome: "allowed" };
}
/** gateway_charge_request_total's charged total so far for the stream. */
const charged = (nanos: number) => db.query(
	`update public.gateway_request_charges set cost_nanos = $2, updated_at = now() where workspace_id = $1 and request_id = '${BILLING_ID}'`,
	[WORKSPACE, nanos]);

beforeAll(async () => {
	const { PGlite } = await import("@electric-sql/pglite");
	const fixture = await import(/* @vite-ignore */ new URL("../../../../supabase/tests/fixtures/budget-enforcement-db.mjs", import.meta.url).href);
	db = await fixture.createBudgetDatabase(PGlite);
	await fixture.applyMigration(db, await fixture.readMigration());
	await db.exec(`
		insert into public.workspaces (id) values ('${WORKSPACE}');
		insert into public.wallets (workspace_id, balance_nanos) values ('${WORKSPACE}', ${100 * DOLLAR});
		insert into public.keys (id, workspace_id, department_id) values ('${KEY}', '${WORKSPACE}', '${DEPARTMENT}'),
			('${OTHER_KEY}', '${WORKSPACE}', '${DEPARTMENT}'), ('${THIRD_KEY}', '${WORKSPACE}', null);
		insert into public.workspace_departments (id, workspace_id, name) values ('${DEPARTMENT}', '${WORKSPACE}', 'Engineering');
		-- Both $10 a day: the department decides for its keys, the workspace for the third key.
		insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values ('${WORKSPACE}', '${DEPARTMENT}', 'daily', ${10 * DOLLAR});
		insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values ('${WORKSPACE}', 'daily', ${10 * DOLLAR});
		-- gateway_charge_request_total's row after the first checkpoint: $6 taken, not final, no request row yet.
		insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id)
			values ('${WORKSPACE}', '${BILLING_ID}', ${6 * DOLLAR}, 'applied', false, '${KEY}');
	`);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("stepped stream charges in the spend-limit coordinator", () => {
	it("counts a stepped charge once from the database, across a restart and the request row landing", async () => {
		const department = (nanos: number) => ({ outcome: "denied", keyLimit: { reason: "department_daily_cost_budget_reached", currentValue: nanos, departmentId: DEPARTMENT } });
		const workspace = (nanos: number) => ({ outcome: "denied", keyLimit: { reason: "workspace_daily_cost_budget_reached", currentValue: nanos } });

		// $6 taken at the first checkpoint, the stream still open: counted once ($6 of $10), and listed.
		startCoordinator();
		expect(await admit(KEY, "a-1")).toMatchObject({ outcome: "allowed" });
		expect(await admit(THIRD_KEY, "a-2")).toMatchObject({ outcome: "allowed" });
		expect(seeds.at(-1).stepped_charges).toEqual([{ billing_id: BILLING_ID, charged_nanos: 6 * DOLLAR }]);
		expect(seeds.at(-1).budget_status.budgets[0].usage_nanos).toBe(6 * DOLLAR);
		expect(seeds.at(-1).department_budgets[0].usage_nanos).toBe(6 * DOLLAR);
		// An exclusion naming the stream never hides the charge row.
		const excluded = (await db.query("select public.gateway_spend_limit_seed($1, $2::uuid[], $3::text[]) as seed",
			[WORKSPACE, [KEY], [REQUEST_ID, BILLING_ID]])).rows[0].seed;
		expect(excluded.budget_status.budgets[0].usage_nanos).toBe(6 * DOLLAR);

		// A later checkpoint takes the total to $11; the coordinator restarts and reads it from the database.
		await charged(11 * DOLLAR);
		startCoordinator();
		expect(await admit(KEY, "a-3")).toMatchObject(department(11 * DOLLAR));
		expect(await admit(THIRD_KEY, "a-4")).toMatchObject(workspace(11 * DOLLAR));

		// The request row lands at finalization ($11, the stream was cancelled): counted through it
		// instead, and no longer listed.
		await db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos)
			values ($1, $2, $3, $4, false, $5)`, [WORKSPACE, REQUEST_ID, BILLING_ID, KEY, 11 * DOLLAR]);
		startCoordinator();
		expect(await admit(OTHER_KEY, "a-5")).toMatchObject(department(11 * DOLLAR));
		expect(await admit(THIRD_KEY, "a-6")).toMatchObject(workspace(11 * DOLLAR));
		expect(seeds.at(-1).stepped_charges).toEqual([]);
	});
});
