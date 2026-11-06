import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A stream charged at drain checkpoints, on the real seed SQL: the coordinator counts the charged
// total from memory (replace records keyed by billing request id) while the charge row also sits
// in gateway_request_charges. Checkpoint, reseed and admission must count it exactly once, and so
// must a coordinator that restarts and only has the database.
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
const FOURTH_KEY = "30000000-0000-4000-8000-000000000004";
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
			('${OTHER_KEY}', '${WORKSPACE}', '${DEPARTMENT}'), ('${THIRD_KEY}', '${WORKSPACE}', null), ('${FOURTH_KEY}', '${WORKSPACE}', null);
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
	it("counts a checkpoint once through reseed, replacement, restart and the request row landing", async () => {
		startCoordinator();
		// The checkpoint is recorded while the coordinator holds the charge row's $6 from its seed.
		expect(await admit(KEY, "a-1")).toMatchObject({ outcome: "allowed" });
		await coordinator.record(WORKSPACE, { keyId: KEY, billingRequestId: BILLING_ID, requestId: REQUEST_ID, costNanos: 6 * DOLLAR, requests: 1, replace: true, revision: 1 });

		// A new key forces a full reseed. The coordinator lists the checkpoint's request id and
		// billing id; the seed skips the charge row by its billing id and counts nothing twice.
		expect(await admit(OTHER_KEY, "a-2")).toMatchObject({ outcome: "allowed" });
		expect(seedCalls.at(-1)?.sort()).toEqual([BILLING_ID, REQUEST_ID].sort());
		expect(seeds.at(-1).budget_status.budgets[0].usage_nanos).toBe(0);
		expect(seeds.at(-1).department_budgets[0].usage_nanos).toBe(0);
		// $6 of $10: still admitted (counted twice it would be $12 and refused).
		expect(await admit(KEY, "a-3")).toMatchObject({ outcome: "allowed" });

		// The next checkpoint replaces the amount ($11 taken in all), in memory and in the charge row.
		await charged(11 * DOLLAR);
		await coordinator.record(WORKSPACE, { keyId: KEY, billingRequestId: BILLING_ID, requestId: REQUEST_ID, costNanos: 11 * DOLLAR, requests: 1, replace: true, revision: 2 });
		const department = { reason: "department_daily_cost_budget_reached", currentValue: 11 * DOLLAR, departmentId: DEPARTMENT };
		const workspace = { reason: "workspace_daily_cost_budget_reached", currentValue: 11 * DOLLAR };
		expect(await admit(KEY, "a-4")).toMatchObject({ outcome: "denied", keyLimit: department });
		expect(await admit(THIRD_KEY, "a-5")).toMatchObject({ outcome: "denied", keyLimit: workspace });

		// After a restart only the database knows the charge (the seed counts its row): still $11.
		startCoordinator();
		expect(await admit(KEY, "a-6")).toMatchObject({ outcome: "denied", keyLimit: department });
		expect(await admit(THIRD_KEY, "a-6b")).toMatchObject({ outcome: "denied", keyLimit: workspace });
		// A checkpoint recorded after the restart is counted from memory once the next reseed lists it.
		// (Until that reseed, which runs within a minute, the seed's earlier count of the charge row
		// and the new pending entry both apply: an early refusal, never an under-count.)
		await coordinator.record(WORKSPACE, { keyId: KEY, billingRequestId: BILLING_ID, requestId: REQUEST_ID, costNanos: 11 * DOLLAR, requests: 1, replace: true, revision: 3 });
		expect(await admit(FOURTH_KEY, "a-6c")).toMatchObject({ outcome: "denied", keyLimit: workspace });
		expect(seedCalls.at(-1)?.sort()).toEqual([BILLING_ID, REQUEST_ID].sort());

		// The request row lands at finalization ($11, the stream was cancelled): counted through it instead.
		await db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos)
			values ($1, $2, $3, $4, false, $5)`, [WORKSPACE, REQUEST_ID, BILLING_ID, KEY, 11 * DOLLAR]);
		startCoordinator();
		await coordinator.record(WORKSPACE, { keyId: KEY, billingRequestId: BILLING_ID, requestId: REQUEST_ID, costNanos: 11 * DOLLAR, requests: 1, replace: true, final: true });
		expect(await admit(OTHER_KEY, "a-7")).toMatchObject({ outcome: "denied", keyLimit: department });
		expect(await admit(THIRD_KEY, "a-8")).toMatchObject({ outcome: "denied", keyLimit: workspace });
	});
});
