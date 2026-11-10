import { DatabaseSync } from "node:sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Main's SpendLimitDurableObject (the coordinator #3633 ships unchanged) against the real seed SQL,
// called as it calls it: three arguments, contract version 1, excluding held spend by request id
// only. Each case records what #3633's gateway records (one record per billing id at final
// settlement, 0 successful requests for a charged failure) and reads the four counters the
// coordinator decides on: the key's cost limit, its department budget, a shared spend guardrail and
// the workspace budget. Spend may be counted twice for a while (main's coordinator does not list
// billing ids, so the seed also counts a held request's charge rows) but must settle at the charged
// amount and never drop below it.
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

const { SpendLimitDurableObject } = await import("./spend-limit-durable-object");
const { __resetSpendLimitsForTests } = await import("./spend-limits");
const { SPEND_LEASE } = await import("./spend-limits.shared");

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
let db: Db;

class SeededSpendLimitDurableObject extends SpendLimitDurableObject {
	protected override async loadSeed(workspaceId: string, keyIds: string[], exclude: string[]): Promise<any> {
		await db.exec("set role service_role");
		try {
			return (await db.query("select public.gateway_spend_limit_seed($1, $2::uuid[], $3::text[]) as seed", [workspaceId, keyIds, exclude])).rows[0].seed;
		} finally {
			await db.exec("reset role");
		}
	}
	/** Loads and publishes a seed now, as the coordinator's minute reseed does. */
	async reseedNow(): Promise<void> {
		await (this as unknown as { reseed: (extraKeyId: string | null) => Promise<void> }).reseed(null);
	}
}

let workspaces = 0;
/**
 * A workspace with four keys, each showing one counter: KEY (a 1-nano daily cost limit) in
 * DEPARTMENT and covered by GUARDRAIL; DEPARTMENT_KEY in DEPARTMENT only; GUARDRAIL_KEY covered by
 * GUARDRAIL only; WORKSPACE_KEY in neither. Every budget is 1 nano a day, so any spend refuses and
 * the refusal reports it.
 */
async function workspace() {
	const n = String(++workspaces).padStart(12, "0");
	const ids = {
		workspace: `10000000-0000-4000-8000-${n}`,
		key: `31000000-0000-4000-8000-${n}`,
		departmentKey: `32000000-0000-4000-8000-${n}`,
		guardrailKey: `33000000-0000-4000-8000-${n}`,
		workspaceKey: `34000000-0000-4000-8000-${n}`,
		department: `40000000-0000-4000-8000-${n}`,
		guardrail: `50000000-0000-4000-8000-${n}`,
	};
	await db.exec(`
		insert into public.workspaces (id) values ('${ids.workspace}');
		insert into public.wallets (workspace_id, balance_nanos) values ('${ids.workspace}', 1000000000000);
		insert into public.workspace_departments (id, workspace_id, name) values ('${ids.department}', '${ids.workspace}', 'Engineering');
		insert into public.keys (id, workspace_id, department_id, daily_limit_requests, daily_limit_cost_nanos) values
			('${ids.key}', '${ids.workspace}', '${ids.department}', 100, 1),
			('${ids.departmentKey}', '${ids.workspace}', '${ids.department}', null, null),
			('${ids.guardrailKey}', '${ids.workspace}', null, null, null),
			('${ids.workspaceKey}', '${ids.workspace}', null, null, null);
		insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values ('${ids.workspace}', '${ids.department}', 'daily', 1);
		insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values ('${ids.workspace}', 'daily', 1);
		insert into public.workspace_guardrails (id, workspace_id, enabled, name, kind, spend_limit_nanos, spend_period, spend_action, spend_counting)
			values ('${ids.guardrail}', '${ids.workspace}', true, 'Team', 'spend', 1, 'daily', 'block', 'shared');
		insert into public.test_guardrail_keys (key_id, guardrail_id) values ('${ids.key}', '${ids.guardrail}'), ('${ids.guardrailKey}', '${ids.guardrail}');
	`);
	return ids;
}
type Workspace = Awaited<ReturnType<typeof workspace>>;

let coordinator: SeededSpendLimitDurableObject;
/** A coordinator with its own (empty) storage: a fresh object, or one that restarted. */
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
	coordinator = new SeededSpendLimitDurableObject(state, {} as never);
	runtime.bindings = { SPEND_LIMITS: { getByName: () => coordinator }, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
	__resetSpendLimitsForTests();
}

let probes = 0;
/** One admission of keyId, leaving nothing held: its refusal, or its lease's key buckets. */
async function probe(ws: Workspace, keyId: string) {
	const admissionId = `probe-${++probes}`;
	const result = await coordinator.acquire(ws.workspace, keyId, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], admissionId);
	if ("denial" in result && result.denial) return { gate: result.denial.gate, buckets: result.denial.gate.buckets };
	if (result.lease.expiresAt) await coordinator.returnLeases(ws.workspace, [{ id: result.lease.id, usedRequests: 0, usedUnits: 0, inFlightRequests: 0 }]);
	else await coordinator.release(ws.workspace, result.lease.id, admissionId);
	return { gate: null, buckets: result.lease.meta.buckets };
}
/** What the coordinator counts for each counter (0 where its 1-nano budget still admits). */
async function counters(ws: Workspace) {
	const key = (await probe(ws, ws.key)).buckets!.daily;
	const spent = async (keyId: string, prefix: string) => {
		const { gate } = await probe(ws, keyId);
		return gate?.reason?.startsWith(prefix) ? Number(gate.currentValue) : 0;
	};
	return {
		keyRequests: key.requestsUsed,
		key: key.costUsedNanos,
		department: await spent(ws.departmentKey, "department_"),
		guardrail: await spent(ws.guardrailKey, "guardrail_"),
		workspace: await spent(ws.workspaceKey, "workspace_"),
	};
}
const exactly = (nanos: number, requests = 0) => ({ keyRequests: requests, key: nanos, department: nanos, guardrail: nanos, workspace: nanos });
/** Counted at least once on every counter (an over-count that later clears is allowed). */
const atLeast = (seen: Awaited<ReturnType<typeof counters>>, nanos: number) => {
	for (const name of ["key", "department", "guardrail", "workspace"] as const) expect(seen[name], name).toBeGreaterThanOrEqual(nanos);
};

/** gateway_charge_request_total: the new total on the charge row, the difference as an adjustment ledger row. */
async function chargeTotal(ws: Workspace, billingId: string, totalNanos: number, final: boolean) {
	const previous = (await db.query(`select cost_nanos from public.gateway_request_charges where workspace_id = $1 and request_id = $2`, [ws.workspace, billingId])).rows[0];
	if (!previous) {
		await db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id)
			values ($1, $2, 0, 'applied', false, $3)`, [ws.workspace, billingId, ws.key]);
	}
	const delta = totalNanos - Number(previous?.cost_nanos ?? 0);
	await db.query(`update public.gateway_request_charges set cost_nanos = $3, is_final = $4 where workspace_id = $1 and request_id = $2`,
		[ws.workspace, billingId, totalNanos, final]);
	if (delta !== 0) {
		await db.query(`insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status)
			values ($1, 'adjustment', $2, 'gateway_request_charge', $3, 'gateway_request', $4, 'applied')`,
			[ws.workspace, -delta, `${ws.workspace}:${billingId}:${final ? "final" : totalNanos}`, billingId]);
	}
}
/** gateway_deduct_and_check_top_up_once: a one-off charge row. */
async function chargeOnce(ws: Workspace, billingId: string, nanos: number, keyed = true) {
	await db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id)
		values ($1, $2, $3, 'applied', true, $4)`, [ws.workspace, billingId, nanos, keyed ? ws.key : null]);
}
async function auditRow(ws: Workspace, row: { requestId: string; billingId: string; success: boolean; costNanos: number | null; expectedCostNanos?: number; billingStatus?: string }) {
	await db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos, expected_cost_nanos, detail_metadata)
		values ($1, $2, $3, $4, $5, $6, $7, $8)`, [ws.workspace, row.requestId, row.billingId, ws.key, row.success, row.costNanos, row.expectedCostNanos ?? null,
		row.billingStatus ? JSON.stringify({ accounting_finalization: { billing_status: row.billingStatus } }) : null]);
}
/** What #3633's audit records at final settlement (settleEnforcedSpend or settleChargedFailureSpend). */
const record = (ws: Workspace, entry: { billingId: string; requestId: string; costNanos: number; requests: number }) =>
	coordinator.record(ws.workspace, { keyId: ws.key, billingRequestId: entry.billingId, requestId: entry.requestId, costNanos: entry.costNanos, requests: entry.requests });

beforeAll(async () => {
	const { PGlite } = await import("@electric-sql/pglite");
	const fixture = await import(/* @vite-ignore */ new URL("../../../../supabase/tests/fixtures/budget-enforcement-db.mjs", import.meta.url).href);
	db = await fixture.createBudgetDatabase(PGlite);
	await fixture.applyMigration(db, await fixture.readMigration());
	await db.exec(`
		create table public.test_guardrail_keys (key_id uuid not null, guardrail_id uuid not null);
		create or replace function public.resolve_key_guardrails(p_workspace_id uuid, p_key_id uuid)
			returns table (guardrail_id uuid, source_type text, source_id uuid) language sql stable as $$
			select g.guardrail_id, 'workspace', null::uuid from public.test_guardrail_keys g where g.key_id = p_key_id $$;
		grant select on public.test_guardrail_keys to service_role;
	`);
}, 120_000);

afterEach(() => { vi.useRealTimers(); });
afterAll(async () => { await db?.close(); });

describe("main's spend-limit coordinator on the v1 seed", () => {
	it("a charged cancellation of 600 nanos stays at 600 with 0 successful requests through two reseeds and a restart", async () => {
		// The Codex P1 on #3633: on main's SQL (gr.success is true) this drops to 0 at the second reseed.
		const ws = await workspace();
		startCoordinator();
		expect(await counters(ws)).toEqual(exactly(0));
		// A stream the client left: charged 600 at a drain checkpoint, then settled as a failure
		// that kept its charge, with its audit row and one record of 0 successful requests.
		await chargeTotal(ws, "bill-cancel", 600, false);
		await chargeTotal(ws, "bill-cancel", 600, true);
		await auditRow(ws, { requestId: "req-cancel", billingId: "bill-cancel", success: false, costNanos: 600 });
		await record(ws, { billingId: "bill-cancel", requestId: "req-cancel", costNanos: 600, requests: 0 });
		expect(await counters(ws)).toEqual(exactly(600));
		await coordinator.reseedNow();
		atLeast(await counters(ws), 600);
		await coordinator.reseedNow();
		expect(await counters(ws)).toEqual(exactly(600));
		startCoordinator();
		expect(await counters(ws)).toEqual(exactly(600));
	});

	it.each([
		{ shape: "no cost", costNanos: null },
		{ shape: "part of the cost", costNanos: 200 },
	])("an old Worker's failure row with $shape after an applied 600 one-off debit counts 600 with 0 requests through two reseeds and a restart", async ({ costNanos }) => {
		// A Worker older than the lost-charge fix: its charge row carries no key, its failure row
		// says billing_status 'recorded' without the confirmed cost, and it records nothing.
		const ws = await workspace();
		startCoordinator();
		expect(await counters(ws)).toEqual(exactly(0));
		await chargeOnce(ws, `bill-old-${costNanos}`, 600, false);
		await auditRow(ws, { requestId: `req-old-${costNanos}`, billingId: `bill-old-${costNanos}`, success: false, costNanos, billingStatus: "recorded" });
		await coordinator.reseedNow();
		expect(await counters(ws)).toEqual(exactly(600));
		await coordinator.reseedNow();
		expect(await counters(ws)).toEqual(exactly(600));
		startCoordinator();
		expect(await counters(ws)).toEqual(exactly(600));
	});

	it("a one-off debit of 600 whose failure audit row keeps cost_nanos 600 counts 600 once, through reseeds and a restart", async () => {
		const ws = await workspace();
		startCoordinator();
		await chargeOnce(ws, "bill-failed", 600);
		await auditRow(ws, { requestId: "req-failed", billingId: "bill-failed", success: false, costNanos: 600 });
		await record(ws, { billingId: "bill-failed", requestId: "req-failed", costNanos: 600, requests: 0 });
		expect(await counters(ws)).toEqual(exactly(600));
		// The row's cost covers the charge, so the seed does not count the charge as well.
		await coordinator.reseedNow();
		expect(await counters(ws)).toEqual(exactly(600));
		await coordinator.reseedNow();
		expect(await counters(ws)).toEqual(exactly(600));
		startCoordinator();
		expect(await counters(ws)).toEqual(exactly(600));
	});

	it("a stepped stream whose drain stopped before final settlement counts its checkpoint charges from the seed", async () => {
		const ws = await workspace();
		// Two checkpoints, then nothing: no final total, no audit row, no record.
		await chargeTotal(ws, "bill-drain", 300, false);
		await chargeTotal(ws, "bill-drain", 500, false);
		startCoordinator();
		expect(await counters(ws)).toEqual(exactly(500));
		await coordinator.reseedNow();
		expect(await counters(ws)).toEqual(exactly(500));
		startCoordinator();
		expect(await counters(ws)).toEqual(exactly(500));
	});

	it("a pending charge whose failure row never lands is still counted after the coordinator's pending window", async () => {
		const ws = await workspace();
		startCoordinator();
		// A one-off charge pending reconciliation: #3633 records it at final settlement although its
		// audit row (with expected_cost_nanos) was never written.
		await chargeOnce(ws, "bill-lost", 700);
		await record(ws, { billingId: "bill-lost", requestId: "req-lost", costNanos: 700, requests: 0 });
		atLeast(await counters(ws), 700);
		await coordinator.reseedNow();
		atLeast(await counters(ws), 700);
		// Past main's 15-minute pending window the coordinator drops its copy; the charge row remains.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(Date.now() + SPEND_LEASE.pendingTtlMs + 60_000);
		await coordinator.reseedNow();
		expect(await counters(ws)).toEqual(exactly(700));
		await coordinator.reseedNow();
		expect(await counters(ws)).toEqual(exactly(700));
		startCoordinator();
		expect(await counters(ws)).toEqual(exactly(700));
	});

	it("an ordinary success is counted once while its record and its request row overlap", async () => {
		const ws = await workspace();
		startCoordinator();
		await chargeOnce(ws, "bill-ok", 400);
		await auditRow(ws, { requestId: "req-ok", billingId: "bill-ok", success: true, costNanos: 400 });
		await record(ws, { billingId: "bill-ok", requestId: "req-ok", costNanos: 400, requests: 1 });
		expect(await counters(ws)).toEqual(exactly(400, 1));
		await coordinator.reseedNow();
		expect(await counters(ws)).toEqual(exactly(400, 1));
		await coordinator.reseedNow();
		expect(await counters(ws)).toEqual(exactly(400, 1));
		startCoordinator();
		expect(await counters(ws)).toEqual(exactly(400, 1));
	});

	it.each([
		{ refund: "partial", final: 400 },
		{ refund: "full", final: 0 },
	])("a $refund refund of a stepped charge settles at its final total on every counter", async ({ final }) => {
		const ws = await workspace();
		startCoordinator();
		expect(await counters(ws)).toEqual(exactly(0));
		// Charged 600 at checkpoints; the final bill is lower, so the difference is credited back.
		await chargeTotal(ws, `bill-refund-${final}`, 600, false);
		await chargeTotal(ws, `bill-refund-${final}`, final, true);
		await auditRow(ws, { requestId: `req-refund-${final}`, billingId: `bill-refund-${final}`, success: false, costNanos: final });
		await record(ws, { billingId: `bill-refund-${final}`, requestId: `req-refund-${final}`, costNanos: final, requests: 0 });
		expect(await counters(ws)).toEqual(exactly(final));
		await coordinator.reseedNow();
		atLeast(await counters(ws), final);
		await coordinator.reseedNow();
		expect(await counters(ws)).toEqual(exactly(final));
		startCoordinator();
		expect(await counters(ws)).toEqual(exactly(final));
	});
});
