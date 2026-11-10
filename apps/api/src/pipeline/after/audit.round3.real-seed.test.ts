import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// #3633 round 3 on #3547's real SQL: the real
// handleSuccessAudit (and, after a late error, the buffered path's catch into the real
// handleFailureAudit) write their rows into PGlite and settle through the real spend-limit code into
// main's SpendLimitDurableObject, seeded by #3547's gateway_spend_limit_seed (version 1).
const runtime = vi.hoisted(() => ({ bindings: null as Record<string, unknown> | null, background: [] as Promise<unknown>[], db: null as any, rows: [] as any[] }));
const dataContributionMock = vi.hoisted(() => vi.fn(async (_args: any) => ({ status: "skipped" })));

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
vi.mock("@observability/otlp-export", () => ({ enqueueGatewayOtlpExport: vi.fn(async () => undefined) }));
vi.mock("@observability/axiom", () => ({
	emitGatewayTelemetryDeliveryFailure: vi.fn(async () => undefined),
	emitGatewayOperationalFailure: vi.fn(async () => undefined),
}));
vi.mock("../classification/request-classifiers", () => ({ applyRequestClassifiers: vi.fn(async () => undefined) }));
vi.mock("../classification/data-contribution", async (importOriginal) => ({
	...(await importOriginal<typeof import("../classification/data-contribution")>()),
	persistDataContribution: (args: any) => dataContributionMock(args),
}));
// The Supabase sink: the rows the gateway writes, as gateway_requests stores them (the success row's
// cost and expected cost as auditSuccess maps them; index.pending-charge.test.ts covers that mapping).
vi.mock("../audit", () => ({
	auditSuccess: async (args: any) => {
		runtime.rows.push({ kind: "success", ...args });
		await runtime.db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos, expected_cost_nanos)
			values ($1, $2, $3, $4, true, $5, $6)`, [args.workspaceId, args.requestId, args.billingRequestId, args.keyId,
			args.pendingCharge ? args.pendingCharge.costNanos : args.totalNanos, args.pendingCharge?.expectedCostNanos ?? null]);
	},
	auditFailure: async (args: any) => {
		runtime.rows.push({ kind: "failure", ...args });
		await runtime.db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos, expected_cost_nanos)
			values ($1, $2, $3, $4, false, $5, $6)`, [args.workspaceId, args.requestId, args.billingRequestId, args.keyId, args.costNanos ?? null, args.expectedCostNanos ?? null]);
	},
}));

const { SpendLimitDurableObject } = await import("@core/spend-limit-durable-object");
const { __resetSpendLimitsForTests, flushSpendRecordsForTests } = await import("@core/spend-limits");
const { handleFailureAudit, handleSuccessAudit } = await import("./audit");

const WORKSPACE = "10000000-0000-4000-8000-000000000071";
const KEY = "30000000-0000-4000-8000-000000000071";
const OUTSIDE_KEY = "30000000-0000-4000-8000-000000000072";

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
async function counters() {
	const key = (await probe(KEY)).buckets!.daily;
	const { gate } = await probe(OUTSIDE_KEY);
	return { requests: key.requestsUsed, key: key.costUsedNanos, workspace: gate?.reason?.startsWith("workspace_") ? Number(gate.currentValue) : 0 };
}
async function drain() {
	while (runtime.background.length) await Promise.all(runtime.background.splice(0));
	await flushSpendRecordsForTests();
	while (runtime.background.length) await Promise.all(runtime.background.splice(0));
}

function context(id: string, meta: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): any {
	return {
		requestId: `req_${id}`, billingRequestId: `bill_${id}`, workspaceId: WORKSPACE, keyId: KEY,
		endpoint: "chat.completions", capability: "text.generate", model: "openai/gpt-5-mini", requestedModel: "openai/gpt-5-mini",
		stream: false, body: {}, rawBody: {}, internal: false, testingMode: false, providers: [], pricing: {}, spendAdmission: null,
		gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
		meta: { requestId: `req_${id}`, apiKeyId: KEY, authMethod: "api_key", startedAtMs: Date.now() - 50, ...meta },
		...extra,
	};
}
const result = (): any => ({
	provider: "openai", upstream: new Response(null, { status: 200 }), mappedRequest: null, rawResponse: null,
	bill: { cost_cents: 0.06, currency: "USD", usage: { input_tokens: 10, output_tokens: 20 }, finish_reason: "stop" },
});

/** The buffered path: the success audit, and its catch into the failure audit. */
async function bufferedAudit(ctx: any) {
	const res = result();
	try {
		await handleSuccessAudit(ctx, res, false, res.bill.usage, 0.06, 600, "USD", "stop", 200, null, null);
	} catch (error) {
		await handleFailureAudit(ctx, res, 500, "gateway", "nonstream_finalization_failed",
			"The response was delivered but accounting finalization failed.", {
				response_delivered: true,
				billing_status: ctx.meta.__usageChargeRecorded === true ? "recorded" : "pending_reconciliation",
				cause: error instanceof Error ? error.message : String(error),
			});
	}
	await drain();
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
beforeEach(async () => {
	runtime.rows.length = 0;
	await runtime.db.exec("delete from public.gateway_requests; delete from public.gateway_request_charges;");
	dataContributionMock.mockReset().mockResolvedValue({ status: "skipped" });
});

describe("#3633 round 3 on #3547's real seed", () => {
	const quiet = () => [vi.spyOn(console, "error").mockImplementation(() => undefined), vi.spyOn(console, "warn").mockImplementation(() => undefined)];

	it("a late error after the success row writes no second row: one 600 debit counts 600, through reseeds and a restart", async () => {
		startCoordinator();
		await runtime.db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id)
			values ($1, 'bill_late', 600, 'applied', true, $2)`, [WORKSPACE, KEY]);
		dataContributionMock.mockRejectedValueOnce(new Error("contribution store unavailable"));
		const spies = quiet();
		await bufferedAudit(context("late", { __usageChargeRecorded: true, __chargedNanos: 600 }, { teamSettings: { dataContributionEnabled: true } }));
		spies.forEach((spy) => spy.mockRestore());
		expect(runtime.rows.map((row) => row.kind)).toEqual(["success"]);
		expect(await counters()).toEqual({ requests: 1, key: 600, workspace: 600 });
		await coordinator.reseedNow();
		await coordinator.reseedNow();
		expect(await counters()).toEqual({ requests: 1, key: 600, workspace: 600 });
		startCoordinator();
		expect(await counters()).toEqual({ requests: 1, key: 600, workspace: 600 });
	});

	it("control: with the guard bypassed (round 2's behaviour) the second row makes it 1,200", async () => {
		startCoordinator();
		await runtime.db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id)
			values ($1, 'bill_control', 600, 'applied', true, $2)`, [WORKSPACE, KEY]);
		dataContributionMock.mockRejectedValueOnce(new Error("contribution store unavailable"));
		const spies = quiet();
		const ctx = context("control", { __usageChargeRecorded: true, __chargedNanos: 600 }, { teamSettings: { dataContributionEnabled: true } });
		const res = result();
		await handleSuccessAudit(ctx, res, false, res.bill.usage, 0.06, 600, "USD", "stop", 200, null, null).catch(() => undefined);
		delete ctx.meta.__successRowWritten;
		await handleFailureAudit(ctx, res, 500, "gateway", "nonstream_finalization_failed", "late", { response_delivered: true, billing_status: "recorded" });
		await drain();
		spies.forEach((spy) => spy.mockRestore());
		expect(runtime.rows.map((row) => row.kind)).toEqual(["success", "failure"]);
		startCoordinator();
		expect(await counters()).toEqual({ requests: 1, key: 1200, workspace: 1200 });
	});

	it.each([
		["no charge applied, stored total read back as 0", false, 0],
		["the debit committed unacknowledged, stored total unread", true, null],
	] as const)("a delivered buffered request whose charge did not go through (%s) counts once at its expected 600, as 1 success", async (_label, applied, readBack) => {
		startCoordinator();
		const id = applied ? "pending_applied" : "pending_unapplied";
		if (applied) await runtime.db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id)
			values ($1, $2, 600, 'applied', true, $3)`, [WORKSPACE, `bill_${id}`, KEY]);
		const spies = quiet();
		await bufferedAudit(context(id, {}, { uncollectedChargeNanos: 600, confirmedChargeNanos: readBack ?? undefined }));
		spies.forEach((spy) => spy.mockRestore());
		expect(runtime.rows).toEqual([expect.objectContaining({ kind: "success", statusCode: 200, pendingCharge: { costNanos: readBack, expectedCostNanos: 600 } })]);
		// Until the next reseed, a charge that applied is counted by the seed (main's coordinator does not
		// exclude charge rows by billing id) and by the coordinator's held entry: an over-count on the
		// key, never an under-count. #3534's coordinator excludes by billing id.
		expect(await counters()).toEqual({ requests: 1, key: applied ? 1200 : 600, workspace: 600 });
		await coordinator.reseedNow();
		await coordinator.reseedNow();
		expect(await counters()).toEqual({ requests: 1, key: 600, workspace: 600 });
		startCoordinator();
		expect(await counters()).toEqual({ requests: 1, key: 600, workspace: 600 });
	});
});
