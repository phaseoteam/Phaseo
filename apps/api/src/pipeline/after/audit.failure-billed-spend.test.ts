import { beforeEach, describe, expect, it, vi } from "vitest";

// A failed request that was still charged (a stream the client left after a drain checkpoint)
// must count against spend limits like any charge. Before, every failure released its
// admission, so repeated charged cancellations spent wallet credit without using up budgets.
const auditFailureMock = vi.hoisted(() => vi.fn(async (_args: any) => undefined));
const background = vi.hoisted(() => [] as Promise<unknown>[]);
// An enforced daily cost budget, as the spend-limit coordinator applies it: a request is admitted
// while recorded spend is below the limit; its admission is then released or settled with a cost.
// Amounts are kept per billing request: a replace (stepped charge) sets the request's amount.
const budget = vi.hoisted(() => ({
	limit: 1_000, open: new Set<string>(), recorded: new Map<string, number>(), settledAs: [] as string[],
	get used() { return [...this.recorded.values()].reduce((sum, value) => sum + value, 0); },
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
	releaseSpend: (admission: { admissionId: string } | null) => { if (admission) budget.open.delete(admission.admissionId); },
	// main's settleEnforcedSpend: release without a row, otherwise record (the coordinator keeps the
	// first record of a billing id).
	settleEnforcedSpend: (args: { admission: { admissionId: string } | null; rowWritten: boolean; billingRequestId: string; costNanos: number }) => {
		budget.settledAs.push("success");
		if (args.admission) budget.open.delete(args.admission.admissionId);
		if (!args.rowWritten) return;
		if (!budget.recorded.has(args.billingRequestId)) budget.recorded.set(args.billingRequestId, args.costNanos);
	},
	// The same, with 0 successful requests.
	settleChargedFailureSpend: (args: { admission: { admissionId: string } | null; rowWritten: boolean; billingRequestId: string; costNanos: number }) => {
		budget.settledAs.push("charged_failure");
		if (args.admission) budget.open.delete(args.admission.admissionId);
		if (!args.rowWritten) return;
		if (!budget.recorded.has(args.billingRequestId)) budget.recorded.set(args.billingRequestId, args.costNanos);
	},
}));

import { handleFailureAudit } from "./audit";

const KEY = "00000000-0000-4000-8000-000000000001";

function admit(id: string) {
	if (budget.used >= budget.limit) return null;
	budget.open.add(id);
	return { workspaceId: "ws_1", keyId: KEY, admissionId: id, leaseId: "lease_1", fromSlice: false, unlimited: false };
}

function context(id: string, admission: unknown, meta: Record<string, unknown> = {}) {
	return {
		requestId: id, billingRequestId: `bill_${id}`, workspaceId: "ws_1", keyId: KEY, endpoint: "chat.completions",
		capability: "text.generate", model: "openai/gpt-5-mini", stream: true, body: {}, internal: false, testingMode: false,
		meta: { requestId: id, apiKeyId: KEY, authMethod: "api_key", ...meta }, providers: [], pricing: {},
		gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
		spendAdmission: admission,
	} as any;
}

async function cancelWithCharge(id: string, admission: unknown, costNanos: number | null, meta?: Record<string, unknown>) {
	await handleFailureAudit(
		context(id, admission, meta),
		{ provider: "openai", bill: { cost_cents: 0, currency: "USD", usage: {}, finish_reason: "cancel" } } as any,
		499, "client", "client_closed_request", "The client closed the stream before it completed.",
		undefined, undefined, undefined,
		costNanos == null ? undefined : { costNanos },
	);
	await Promise.all(background.splice(0));
}

describe("failed requests that were still charged", () => {
	beforeEach(() => {
		auditFailureMock.mockClear();
		background.length = 0;
		budget.recorded.clear();
		budget.open.clear();
		budget.settledAs.length = 0;
	});

	it("use up an enforced budget when cancellations are charged repeatedly", async () => {
		let admitted = 0;
		for (let i = 0; i < 10; i++) {
			const admission = admit(`cancel_${i}`);
			if (!admission) break;
			admitted++;
			await cancelWithCharge(`cancel_${i}`, admission, 300);
		}
		// 0, 300, 600 and 900 are below the $1,000 limit; the fifth request is refused.
		expect(admitted).toBe(4);
		expect(budget.used).toBe(1_200);
		expect(budget.open.size).toBe(0);
		// The row records the charge, so the database spend queries can count it too.
		expect(auditFailureMock).toHaveBeenCalledTimes(4);
		expect(auditFailureMock.mock.calls[0][0]).toMatchObject({ stage: "execute", costNanos: 300, statusCode: 499 });
		// Settled as charged failures: their cost counts, as 0 successful requests.
		expect(budget.settledAs).toEqual(["charged_failure", "charged_failure", "charged_failure", "charged_failure"]);
	});

	it("still release the admission when nothing was charged", async () => {
		await cancelWithCharge("free", admit("free"), null);
		await cancelWithCharge("zero", admit("zero"), 0);
		expect(budget.used).toBe(0);
		expect(budget.open.size).toBe(0);
		expect(auditFailureMock.mock.calls[0][0].costNanos).toBeUndefined();
	});

	it("are not counted against a key for an OAuth access token, which has no admission", async () => {
		await cancelWithCharge("oauth", admit("oauth"), 300, { authMethod: "oauth", apiKeyRef: "oauth_client_1" });
		expect(budget.used).toBe(0);
		expect(budget.open.size).toBe(0);
	});

	it("settle a stepped request refunded to 0 at 0, recording it rather than releasing it", async () => {
		// Checkpoints are not reported to the coordinator: the final settlement is its only record.
		await cancelWithCharge("refunded", admit("refunded"), 0, { __chargedInSteps: true });
		expect(budget.recorded.get("bill_refunded")).toBe(0);
		expect(budget.used).toBe(0);
		expect(budget.open.size).toBe(0);
	});

	describe("a delivered request whose charge did not go through", () => {
		// recordUsageAndChargeOnce leaves the intended bill and what the database holds on ctx.
		async function finalizationFailed(id: string, pending: { uncollected: number; confirmed: number | null }, meta?: Record<string, unknown>) {
			const ctx = context(id, admit(id), meta);
			ctx.uncollectedChargeNanos = pending.uncollected;
			ctx.confirmedChargeNanos = pending.confirmed;
			await handleFailureAudit(
				ctx,
				{ provider: "openai", bill: { cost_cents: 0, currency: "USD", usage: {}, finish_reason: "stop" } } as any,
				500, "gateway", "stream_finalization_failed", "The response was delivered but accounting finalization failed.",
				{ billing_status: "pending_reconciliation" },
			);
			await Promise.all(background.splice(0));
			return auditFailureMock.mock.calls.at(-1)![0];
		}

		it("records an unpaid bill as expected cost, with the 0 the database confirmed", async () => {
			const row = await finalizationFailed("unpaid", { uncollected: 300, confirmed: 0 });
			expect(row).toMatchObject({ costNanos: 0, expectedCostNanos: 300 });
			// Spend limits count the bill the wallet did not take.
			expect(budget.recorded.get("bill_unpaid")).toBe(300);
		});

		it("records a debit that committed while every response was lost as the row's cost", async () => {
			const row = await finalizationFailed("committed", { uncollected: 300, confirmed: 300 });
			expect(row).toMatchObject({ costNanos: 300, expectedCostNanos: 300 });
			expect(budget.recorded.get("bill_committed")).toBe(300);
		});

		it("leaves the cost unknown, not 0, when the stored charge could not be read", async () => {
			const row = await finalizationFailed("unreadable", { uncollected: 300, confirmed: null });
			expect(row.expectedCostNanos).toBe(300);
			expect(row).not.toHaveProperty("costNanos");
			expect(budget.recorded.get("bill_unreadable")).toBe(300);
		});

		it("counts a committed one-off debit even when its failure row is not written", async () => {
			auditFailureMock.mockRejectedValueOnce(new Error("insert failed"));
			const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
			const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
			await finalizationFailed("lost_row", { uncollected: 300, confirmed: 300 });
			error.mockRestore();
			warn.mockRestore();
			expect(budget.recorded.get("bill_lost_row")).toBe(300);
			expect(budget.open.size).toBe(0);
		});

		it("keeps a 300 checkpoint charge when the stream's refund to 0 did not go through", async () => {
			budget.recorded.set("bill_refund_failed", 300);
			const row = await finalizationFailed("refund_failed", { uncollected: 0, confirmed: 300 }, { __chargedInSteps: true });
			// The intended bill is 0, but the wallet still holds the 300 debit: the row records both.
			expect(row).toMatchObject({ costNanos: 300, expectedCostNanos: 0 });
			expect(budget.recorded.get("bill_refund_failed")).toBe(300);
		});

		it("records a kept checkpoint charge against the SKU meters the checkpoints priced", async () => {
			// The highest checkpoint priced 200 input + 400 output; 300 was charged and kept. The
			// row's lines (its v2_request_pricing_lines, which promotion budgets sum) add up to 300.
			const row = await finalizationFailed("kept_lines", { uncollected: 0, confirmed: 300 }, {
				__chargedInSteps: true,
				__checkpointPricingLines: [
					{ dimension: "input_text_tokens", rule_id: "meter_in", line_nanos: 200, line_cost_usd: "0.000000200" },
					{ dimension: "output_text_tokens", rule_id: "meter_out", line_nanos: 400, line_cost_usd: "0.000000400" },
				],
			});
			expect(row.costNanos).toBe(300);
			expect(row.pricingLines.map((line: any) => [line.rule_id, line.line_nanos, line.line_cost_usd])).toEqual([
				["meter_in", 100, "0.000000100"],
				["meter_out", 200, "0.000000200"],
			]);
		});

		it("keeps the bill's own pricing lines when it has them", async () => {
			const ctx = context("own_lines", admit("own_lines"), {
				__chargedInSteps: true,
				__checkpointPricingLines: [{ dimension: "output_text_tokens", rule_id: "meter_checkpoint", line_nanos: 999 }],
			});
			ctx.confirmedChargeNanos = 300;
			ctx.uncollectedChargeNanos = 300;
			const ownLines = [{ dimension: "output_text_tokens", rule_id: "meter_final", line_nanos: 300 }];
			await handleFailureAudit(
				ctx,
				{ provider: "openai", bill: { cost_cents: 0, currency: "USD", usage: { pricing: { lines: ownLines } }, finish_reason: "stop" } } as any,
				500, "gateway", "stream_finalization_failed", "The response was delivered but accounting finalization failed.",
				{ billing_status: "pending_reconciliation" },
			);
			await Promise.all(background.splice(0));
			expect(auditFailureMock.mock.calls.at(-1)![0].pricingLines).toEqual(ownLines);
		});
	});

	describe("a request that fails after its one-off charge went through", () => {
		// recordUsageAndChargeOnce succeeded ($6 debited), then something failed before the success
		// audit: the failure row records the $6, and spend limits count it once, as 0 requests.
		async function failedAfterCharge(id: string, errorCode: string, billingStatus: string, rowLands = true) {
			const ctx = context(id, admit(id), { __usageChargeRecorded: true, __chargedNanos: 600, __intendedChargeNanos: 600 });
			if (!rowLands) auditFailureMock.mockRejectedValueOnce(new Error("insert failed"));
			const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
			const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
			await handleFailureAudit(
				ctx,
				{ provider: "openai", bill: { cost_cents: 0, currency: "USD", usage: {}, finish_reason: "stop" } } as any,
				500, "gateway", errorCode, "Accounting finalization failed.",
				{ billing_status: billingStatus },
			);
			await Promise.all(background.splice(0));
			error.mockRestore();
			warn.mockRestore();
			return auditFailureMock.mock.calls.at(-1)![0];
		}

		it.each([
			["a stream, audited as recorded", "stream_finalization_failed", "recorded"],
			["streamed speech, pending reconciliation", "speech_finalization_failed", "pending_reconciliation"],
		])("keeps the charge of %s", async (_label, errorCode, billingStatus) => {
			const id = `charged_${errorCode}`;
			const row = await failedAfterCharge(id, errorCode, billingStatus);
			expect(row.costNanos).toBe(600);
			expect(budget.recorded.get(`bill_${id}`)).toBe(600);
			expect(budget.settledAs).toEqual(["charged_failure"]);
			expect(budget.open.size).toBe(0);
		});

		it("still counts the charge when the failure row does not land", async () => {
			await failedAfterCharge("charged_no_row", "stream_finalization_failed", "recorded", false);
			expect(budget.recorded.get("bill_charged_no_row")).toBe(600);
			expect(budget.settledAs).toEqual(["charged_failure"]);
		});
	});
});
