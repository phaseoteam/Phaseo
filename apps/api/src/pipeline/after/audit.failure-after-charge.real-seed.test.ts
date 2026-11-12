import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// #3633's failure audit after a confirmed one-off debit, end to end on the real SQL: the real
// handleFailureAudit writes its row (captured here and inserted into PGlite) and settles through the
// real settleChargedFailureSpend into main's SpendLimitDurableObject, which seeds from the real
// gateway_spend_limit_seed as main calls it (version 1). The debit itself is the charge row
// recordUsageAndChargeOnce leaves (inserted directly; charge.ts is not driven).
const runtime = vi.hoisted(() => ({ bindings: null as Record<string, unknown> | null, background: [] as Promise<unknown>[], db: null as any, rows: [] as any[] }));

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindingsIfConfigured: () => runtime.bindings,
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { runtime.background.push(promise.catch(() => undefined)); },
}));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));
// The Supabase sink: the row the gateway writes, as gateway_requests stores it.
vi.mock("../audit", () => ({
	auditSuccess: vi.fn(),
	auditFailure: async (args: any) => {
		runtime.rows.push(args);
		await runtime.db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos, expected_cost_nanos)
			values ($1, $2, $3, $4, false, $5, $6)`, [args.workspaceId, args.requestId, args.billingRequestId, args.keyId, args.costNanos ?? null, args.expectedCostNanos ?? null]);
	},
}));

const { SpendLimitDurableObject } = await import("@core/spend-limit-durable-object");
const { __resetSpendLimitsForTests, flushSpendRecordsForTests } = await import("@core/spend-limits");
const { handleFailureAudit } = await import("./audit");

const WORKSPACE = "10000000-0000-4000-8000-000000000061";
const KEY = "30000000-0000-4000-8000-000000000061";
const OUTSIDE_KEY = "30000000-0000-4000-8000-000000000062";

class SeededSpendLimitDurableObject extends SpendLimitDurableObject {
	protected override async loadSeed(workspaceId: string, keyIds: string[], exclude: string[]): Promise<any> {
		await runtime.db.exec("set role service_role");
		try {
			return (await runtime.db.query("select public.gateway_spend_limit_seed($1, $2::uuid[], $3::text[]) as seed", [workspaceId, keyIds, exclude])).rows[0].seed;
		} finally {
			await runtime.db.exec("reset role");
		}
	}
	async reseedNow(): Promise<void> {
		await (this as unknown as { reseed: (extraKeyId: string | null) => Promise<void> }).reseed(null);
	}
}

let coordinator: SeededSpendLimitDurableObject;
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
async function probe(keyId: string) {
	const admissionId = `probe-${++probes}`;
	const result = await coordinator.acquire(WORKSPACE, keyId, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], admissionId);
	if ("denial" in result && result.denial) return { gate: result.denial.gate, buckets: result.denial.gate.buckets };
	if (result.lease.expiresAt) await coordinator.returnLeases(WORKSPACE, [{ id: result.lease.id, usedRequests: 0, usedUnits: 0, inFlightRequests: 0 }]);
	else await coordinator.release(WORKSPACE, result.lease.id, admissionId);
	return { gate: null, buckets: result.lease.meta.buckets };
}
/** The key's requests and cost today, and the workspace budget's spend (0 while its 1 nano admits). */
async function counters() {
	const key = (await probe(KEY)).buckets!.daily;
	const { gate } = await probe(OUTSIDE_KEY);
	return { requests: key.requestsUsed, key: key.costUsedNanos, workspace: gate?.reason?.startsWith("workspace_") ? Number(gate.currentValue) : 0 };
}

beforeAll(async () => {
	const { PGlite } = await import("@electric-sql/pglite");
	const fixture = await import(/* @vite-ignore */ new URL("../../../../../supabase/tests/fixtures/budget-enforcement-db.mjs", import.meta.url).href);
	runtime.db = await fixture.createBudgetDatabase(PGlite);
	await fixture.applyMigration(runtime.db, await fixture.readMigration());
	await runtime.db.exec(`
		insert into public.workspaces (id) values ('${WORKSPACE}');
		insert into public.wallets (workspace_id, balance_nanos) values ('${WORKSPACE}', 1000000000000);
		insert into public.keys (id, workspace_id, daily_limit_requests, daily_limit_cost_nanos) values
			('${KEY}', '${WORKSPACE}', 100, 1), ('${OUTSIDE_KEY}', '${WORKSPACE}', null, null);
		insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values ('${WORKSPACE}', 'daily', 1);
	`);
}, 120_000);

afterAll(async () => { await runtime.db?.close(); });

describe("a failure audit after a confirmed one-off debit, on the real seed", () => {
	it("writes the 600 debit as the row's cost and counts 600 with 0 successful requests, through reseeds and a restart", async () => {
		startCoordinator();
		expect(await counters()).toEqual({ requests: 0, key: 0, workspace: 0 });
		// recordUsageAndChargeOnce: the wallet confirmed a 600 one-off debit.
		await runtime.db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id)
			values ($1, 'bill_failed_after_charge', 600, 'applied', true, $2)`, [WORKSPACE, KEY]);
		// Then the stream's success audit threw: the failure audit runs with the confirmed charge on ctx.
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		await handleFailureAudit(
			{
				requestId: "req_failed_after_charge", billingRequestId: "bill_failed_after_charge", workspaceId: WORKSPACE, keyId: KEY,
				endpoint: "chat.completions", capability: "text.generate", model: "openai/gpt-5-mini", stream: true, body: {},
				internal: false, testingMode: false, providers: [], pricing: {}, spendAdmission: null,
				gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
				meta: { requestId: "req_failed_after_charge", apiKeyId: KEY, authMethod: "api_key",
					__usageChargeRecorded: true, __chargedNanos: 600, __intendedChargeNanos: 600 },
			} as any,
			{ provider: "openai", bill: { cost_cents: 0, currency: "USD", usage: {}, finish_reason: "stop" } } as any,
			500, "gateway", "stream_finalization_failed", "Accounting finalization failed.",
			{ billing_status: "recorded" },
		);
		while (runtime.background.length) await Promise.all(runtime.background.splice(0));
		await flushSpendRecordsForTests();
		while (runtime.background.length) await Promise.all(runtime.background.splice(0));
		error.mockRestore();
		warn.mockRestore();

		expect(runtime.rows).toEqual([expect.objectContaining({ requestId: "req_failed_after_charge", costNanos: 600 })]);
		expect(await counters()).toEqual({ requests: 0, key: 600, workspace: 600 });
		await coordinator.reseedNow();
		expect(await counters()).toEqual({ requests: 0, key: 600, workspace: 600 });
		await coordinator.reseedNow();
		expect(await counters()).toEqual({ requests: 0, key: 600, workspace: 600 });
		startCoordinator();
		expect(await counters()).toEqual({ requests: 0, key: 600, workspace: 600 });
	});
});
