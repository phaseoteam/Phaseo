import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every gateway_requests row audited with billing_status pending_reconciliation carries
// expected_cost_nanos: readers tell pending rows by that column (not by the JSON billing_status),
// so a pending row without it would be read as an ordinary row. Runs the real charge helpers and
// failure audit; only the database calls and the row write are mocked.
const db = vi.hoisted(() => ({
	oneOff: vi.fn(async (_args: any): Promise<unknown> => ({ applied: true })),
	total: vi.fn(async (_args: any): Promise<unknown> => ({ applied: true })),
	stored: vi.fn(async (_args: any): Promise<number> => 0),
}));
const auditFailureMock = vi.hoisted(() => vi.fn(async (_args: any) => undefined));
const background = vi.hoisted(() => [] as Promise<unknown>[]);

vi.mock("../pricing/persist", () => ({
	recordUsageAndCharge: (args: any) => db.oneOff(args),
	recordRequestChargeTotal: (args: any) => db.total(args),
	readRequestChargeTotal: (args: any) => db.stored(args),
}));
vi.mock("../audit", () => ({ auditSuccess: vi.fn(), auditFailure: (args: any) => auditFailureMock(args) }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { background.push(promise); },
}));
vi.mock("@core/spend-limits", () => ({
	recordShadowSpend: vi.fn(),
	recordCheckpointSpend: vi.fn(),
	releaseSpend: vi.fn(),
	settleEnforcedSpend: vi.fn(),
	settleChargedFailureSpend: vi.fn(),
}));

import { handleFailureAudit } from "./audit";
import { keepChargedTotalAsFinal, recordProvisionalStreamCharge, recordUsageAndChargeOnce } from "./charge";
import { noteIntendedCharge } from "./intended-charge";

const KEY = "00000000-0000-4000-8000-000000000001";

function context(): any {
	return {
		requestId: "req_pending", billingRequestId: "bill_pending", workspaceId: "ws_pending", keyId: KEY,
		endpoint: "chat.completions", capability: "text.generate", model: "openai/gpt-5-mini", stream: true, body: {},
		internal: false, testingMode: false,
		meta: { requestId: "req_pending", apiKeyId: KEY, authMethod: "api_key" }, providers: [], pricing: {},
		gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
	};
}

// The charge retries wait 100 ms and 500 ms between attempts.
async function settled<T>(promise: Promise<T>): Promise<T | undefined> {
	const outcome = promise.then((value) => value, () => undefined);
	await vi.runAllTimersAsync();
	return outcome;
}

async function auditPending(ctx: any, details: Record<string, unknown> = {}) {
	await handleFailureAudit(ctx,
		{ provider: "openai", bill: { cost_cents: 0, currency: "USD", usage: {}, finish_reason: "stop" } } as any,
		500, "gateway", "stream_finalization_failed", "The response was delivered but accounting finalization failed.",
		{ billing_status: "pending_reconciliation", ...details },
		null, { gatewayResponse: null, rawUsage: null });
	await Promise.all(background.splice(0));
	const row = auditFailureMock.mock.calls.at(-1)![0];
	return { expected: row.expectedCostNanos, cost: row.costNanos };
}

async function checkpoint(ctx: any, totalNanos: number) {
	await settled(recordProvisionalStreamCharge({ ctx, costNanos: totalNanos, endpoint: "chat.completions" }));
}

describe("a gateway_requests row pending reconciliation", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		db.oneOff.mockReset().mockResolvedValue({ applied: true });
		db.total.mockReset().mockResolvedValue({ applied: true });
		db.stored.mockReset().mockResolvedValue(0);
		auditFailureMock.mockClear();
		background.length = 0;
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	// The four ways a one-off charge does not go through, as the database reports them.
	it.each([
		["unpaid (the debit never happened)", new Error("database unavailable"), 0, { expected: 300, cost: 0 }],
		["wallet_refused", new Error("gateway_charge_not_applied:wallet_refused"), 0, { expected: 300, cost: 0 }],
		["wallet_not_found", Object.assign(new Error("wallet_not_found"), { code: "P0001" }), 0, { expected: 300, cost: 0 }],
		["persistence_failed (the debit committed, every response lost)", new TypeError("fetch failed"), 300, { expected: 300, cost: 300 }],
	])("records the intended bill when the charge fails: %s", async (_label, error, stored, row) => {
		db.oneOff.mockRejectedValue(error);
		db.stored.mockResolvedValue(stored);
		const ctx = context();
		await settled(recordUsageAndChargeOnce({ ctx, costNanos: 300, endpoint: "chat.completions", throwOnFailure: true }));
		expect(await auditPending(ctx)).toEqual(row);
	});

	// The database's own refusal shapes: definite (one attempt) and recorded with their reason.
	it.each([
		["wallet_refused", new Error("gateway_charge_not_applied:insufficient_balance")],
		["wallet_not_found", { code: "P0001", message: "wallet_not_found", details: null, hint: null }],
		["persistence_failed", new TypeError("fetch failed")],
	])("records the intended bill and the reason when the charge ends as %s", async (reason, error) => {
		db.oneOff.mockRejectedValue(error);
		const ctx = context();
		await settled(recordUsageAndChargeOnce({ ctx, costNanos: 300, endpoint: "chat.completions", throwOnFailure: true }));
		expect(db.oneOff).toHaveBeenCalledTimes(reason === "persistence_failed" ? 3 : 1);
		expect(await auditPending(ctx)).toEqual({ expected: 300, cost: 0 });
		expect(auditFailureMock.mock.calls.at(-1)![0].detailMetadata.accounting_finalization).toMatchObject({
			billing_status: "pending_reconciliation", charged_nanos: 0, expected_nanos: 300, reason,
		});
	});

	it("records 0 as the intended bill of a stepped refund to zero that did not go through", async () => {
		const ctx = context();
		await checkpoint(ctx, 300);
		db.total.mockRejectedValue(new Error("database unavailable"));
		db.stored.mockResolvedValue(300);
		await settled(recordUsageAndChargeOnce({ ctx, costNanos: 0, endpoint: "chat.completions", throwOnFailure: true }));
		expect(await auditPending(ctx)).toEqual({ expected: 0, cost: 300 });
	});

	it("records the charged total when the final bill cannot be priced (final_pricing_failed)", async () => {
		const ctx = context();
		await checkpoint(ctx, 300);
		db.stored.mockResolvedValue(300);
		(ctx.meta as Record<string, unknown>).__finalPricingFailed = true;
		await settled(keepChargedTotalAsFinal(ctx, "chat.completions"));
		expect(await auditPending(ctx, { reconciliation_reason: "final_pricing_failed" })).toEqual({ expected: 300, cost: 300 });
	});

	it("records the priced bill when the error came before the charge was attempted", async () => {
		const ctx = context();
		noteIntendedCharge(ctx, 300);
		expect(await auditPending(ctx)).toEqual({ expected: 300, cost: 0 });
	});

	it("records the bill and its charge when the error came after the charge went through", async () => {
		const ctx = context();
		await settled(recordUsageAndChargeOnce({ ctx, costNanos: 300, endpoint: "chat.completions" }));
		expect(await auditPending(ctx)).toEqual({ expected: 300, cost: 300 });
	});

	it("records 0 when nothing could be priced or charged (pricing could not be loaded)", async () => {
		expect(await auditPending(context())).toEqual({ expected: 0, cost: 0 });
	});

	it("records a stepped request's charged total when its final was never attempted", async () => {
		const ctx = context();
		await checkpoint(ctx, 300);
		expect(await auditPending(ctx)).toEqual({ expected: 300, cost: 300 });
	});

	it("is the only kind of failure row that gets an expected cost", async () => {
		await handleFailureAudit(context(),
			{ provider: "openai", bill: { cost_cents: 0, currency: "USD", usage: {}, finish_reason: "error" } } as any,
			502, "upstream", "upstream_stream_failure", "The upstream failed.", { billing_status: "suppressed" });
		await Promise.all(background.splice(0));
		expect(auditFailureMock.mock.calls.at(-1)![0]).not.toHaveProperty("expectedCostNanos");
	});
});
