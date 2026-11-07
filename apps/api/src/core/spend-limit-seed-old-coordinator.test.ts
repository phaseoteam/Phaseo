import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Rollout compatibility: between `supabase db push` and the Worker deploy, the coordinator on main
// runs against this release's seed SQL. It calls gateway_spend_limit_seed with three named
// arguments (contract version 1, the default) and, unlike the new coordinator, stops counting a
// held request in workspace budgets as soon as excluded_rows reports its audit row. Version 1 must
// then count that row, or the request disappears from workspace budgets ($6 instead of $10.50).
// main's coordinator is a copy taken with `git show origin/main:<file>` (__fixtures__).
const runtime = vi.hoisted(() => ({ bindings: null as Record<string, unknown> | null }));

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindingsIfConfigured: () => runtime.bindings,
	dispatchBackground: (promise: Promise<unknown>) => { promise.catch(() => undefined); },
}));

const { SpendLimitDurableObject: MainSpendLimitDurableObject } = await import("./__fixtures__/main-spend-limit-coordinator/spend-limit-durable-object");

const WORKSPACE = "10000000-0000-4000-8000-000000000031";
const KEY = "30000000-0000-4000-8000-000000000031";
const OTHER_KEY = "30000000-0000-4000-8000-000000000032";
const OUTSIDE_KEY = "30000000-0000-4000-8000-000000000033";
const DEPARTMENT = "40000000-0000-4000-8000-000000000031";
const BILLING_ID = "bill-old-coordinator-1";
const REQUEST_ID = "req-old-coordinator-1";
const DOLLAR = 1_000_000_000;

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
let db: Db;

class MainCoordinatorOnNewSql extends MainSpendLimitDurableObject {
	// main's loadSeed calls the RPC with exactly these three named arguments.
	protected override async loadSeed(workspaceId: string, keyIds: string[], excludeRequestIds: string[]): Promise<any> {
		await db.exec("set role service_role");
		try {
			return (await db.query("select public.gateway_spend_limit_seed(p_workspace_id => $1, p_key_ids => $2::uuid[], p_exclude_request_ids => $3::text[]) as seed",
				[workspaceId, keyIds, excludeRequestIds])).rows[0].seed;
		} finally {
			await db.exec("reset role");
		}
	}
	async reseedNow(): Promise<void> {
		await (this as unknown as { reseed: (extraKeyId: string | null) => Promise<void> }).reseed(null);
	}
}

let coordinator: MainCoordinatorOnNewSql;
function startCoordinator() {
	const sqlite = new DatabaseSync(":memory:");
	const state = {
		blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
		storage: { sql: { exec: (query: string, ...args: Array<string | number | null>) => {
			const statement = sqlite.prepare(query);
			const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
			return { toArray: () => rows, one: () => rows[0] };
		} } },
	} as unknown as DurableObjectState;
	coordinator = new MainCoordinatorOnNewSql(state, {} as never);
	runtime.bindings = { SPEND_LIMITS: { getByName: () => coordinator }, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
}

let probes = 0;
async function spendSeenBy(keyId: string): Promise<number> {
	const admissionId = `probe-${++probes}`;
	const result = await coordinator.acquire(WORKSPACE, keyId, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], admissionId);
	if ("denial" in result && result.denial) return Number(result.denial.gate.currentValue);
	if (result.lease.expiresAt) await coordinator.returnLeases(WORKSPACE, [{ id: result.lease.id, usedRequests: 0, usedUnits: 0, inFlightRequests: 0 }]);
	else await coordinator.release(WORKSPACE, result.lease.id, admissionId);
	return Number.NaN;
}
const both = async () => ({ department: await spendSeenBy(OTHER_KEY), workspace: await spendSeenBy(OUTSIDE_KEY) });

beforeAll(async () => {
	const { PGlite } = await import("@electric-sql/pglite");
	const fixture = await import(/* @vite-ignore */ new URL("../../../../supabase/tests/fixtures/budget-enforcement-db.mjs", import.meta.url).href);
	db = await fixture.createBudgetDatabase(PGlite);
	await fixture.applyMigration(db, await fixture.readMigration());
	await db.exec(`
		insert into public.workspaces (id) values ('${WORKSPACE}');
		insert into public.wallets (workspace_id, balance_nanos) values ('${WORKSPACE}', ${100 * DOLLAR});
		insert into public.keys (id, workspace_id, department_id) values ('${KEY}', '${WORKSPACE}', '${DEPARTMENT}'),
			('${OTHER_KEY}', '${WORKSPACE}', '${DEPARTMENT}'), ('${OUTSIDE_KEY}', '${WORKSPACE}', null);
		insert into public.workspace_departments (id, workspace_id, name) values ('${DEPARTMENT}', '${WORKSPACE}', 'Engineering');
		insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values ('${WORKSPACE}', '${DEPARTMENT}', 'daily', ${10 * DOLLAR});
		insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values ('${WORKSPACE}', 'daily', ${10 * DOLLAR});
		insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos) values ('${WORKSPACE}', 'req-earlier', '${OTHER_KEY}', true, ${6 * DOLLAR});
	`);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("main's spend-limit coordinator on this release's seed SQL (contract version 1)", () => {
	it("never loses a held request through the handoff", async () => {
		startCoordinator();
		expect(await both()).toEqual({ department: Number.NaN, workspace: Number.NaN }); // $6 of $10

		// A $4.50 request: its charge row lands, and the coordinator records it.
		await db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id)
			values ($1, $2, $3, 'applied', true, $4)`, [WORKSPACE, BILLING_ID, 4.5 * DOLLAR, KEY]);
		await coordinator.record(WORKSPACE, { keyId: KEY, billingRequestId: BILLING_ID, requestId: REQUEST_ID, costNanos: 4.5 * DOLLAR, requests: 1 });
		expect(await both()).toEqual({ department: 10.5 * DOLLAR, workspace: 10.5 * DOLLAR });

		// A seed while the request is held and its audit row has not landed. main's coordinator lists
		// the request id only, so the seed also counts the charge row: an over-count (never a loss)
		// for the seconds between the charge and the audit row, while old coordinators still run.
		await coordinator.reseedNow();
		expect(await both()).toEqual({ department: 15 * DOLLAR, workspace: 15 * DOLLAR });

		// The audit row lands. The seed reports it in excluded_rows, so main's coordinator stops
		// counting the request in workspace budgets: version 1 counts its row there instead.
		await db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos)
			values ($1, $2, $3, $4, true, $5)`, [WORKSPACE, REQUEST_ID, BILLING_ID, KEY, 4.5 * DOLLAR]);
		await coordinator.reseedNow();
		expect(await both()).toEqual({ department: 10.5 * DOLLAR, workspace: 10.5 * DOLLAR });

		// Handoff, then a restart: once, from the database.
		await coordinator.reseedNow();
		expect(await both()).toEqual({ department: 10.5 * DOLLAR, workspace: 10.5 * DOLLAR });
		startCoordinator();
		expect(await both()).toEqual({ department: 10.5 * DOLLAR, workspace: 10.5 * DOLLAR });
	});
});
