import { beforeEach, describe, expect, it, vi } from "vitest";

const recordUsageAndChargeMock = vi.hoisted(() => vi.fn(async (_args: any) => {}));
const recordRequestChargeTotalMock = vi.hoisted(() => vi.fn(async (_args: any) => {}));

vi.mock("../pricing/persist", () => ({
	recordUsageAndCharge: recordUsageAndChargeMock,
	recordRequestChargeTotal: recordRequestChargeTotalMock,
}));

import { recordProvisionalStreamCharge, recordUsageAndChargeOnce, requestChargedInSteps } from "./charge";

describe("recordUsageAndChargeOnce", () => {
    it.each([false, true])("charges admin internal requests only with verified pricing (%s)", async (priced) => {
        const ctx: any = { requestId: "internal", workspaceId: "admin-workspace", testingMode: true,
            billableInternalTesting: true, internalPricingAvailable: priced, meta: {} };
        await recordUsageAndChargeOnce({ ctx, costNanos: 100, endpoint: "responses" });
        expect(recordUsageAndChargeMock).toHaveBeenCalledTimes(priced ? 1 : 0);
    });
    it("passes the server-owned admission balance into settlement", async () => {
        const ctx: any = { requestId: "r", billingRequestId: "bill", workspaceId: "ws", meta: {},
            gating: { credit: { balanceNanos: 100_000_000_000_000 } }, rawBody: { creditSnapshotBalanceNanos: 1 } };
        await recordUsageAndChargeOnce({ ctx, costNanos: 10, endpoint: "responses" });
        expect(recordUsageAndChargeMock).toHaveBeenCalledWith({ requestId: "bill", workspaceId: "ws", cost_nanos: 10,
            creditSnapshotBalanceNanos: 100_000_000_000_000 });
    });
    it("does not debit or invalidate until this request's credit snapshot is persisted", async () => {
        let finish!: () => void;
        const write = new Promise<void>(resolve => { finish = resolve; });
        const ctx: any = { requestId: "r", billingRequestId: "bill", workspaceId: "ws", meta: {}, creditCacheWrites: [write] };
        const charge = recordUsageAndChargeOnce({ ctx, costNanos: 10, endpoint: "responses" });
        await Promise.resolve();
        expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
        finish(); await charge;
        expect(recordUsageAndChargeMock).toHaveBeenCalledOnce();
    });
	beforeEach(() => {
		recordUsageAndChargeMock.mockReset().mockResolvedValue(undefined);
	});

	it("records usage charge once per request context", async () => {
		const ctx: any = {
			requestId: "req_charge",
			billingRequestId: "G-01K4D24Q8Y8RN8Z8Z8RN8Z8Z8R",
			workspaceId: "team_charge",
			endpoint: "responses",
			meta: {},
		};

		await recordUsageAndChargeOnce({
			ctx,
			costNanos: 12345,
			endpoint: "responses",
		});
		await recordUsageAndChargeOnce({
			ctx,
			costNanos: 12345,
			endpoint: "responses",
		});

		expect(recordUsageAndChargeMock).toHaveBeenCalledTimes(1);
		expect(recordUsageAndChargeMock).toHaveBeenCalledWith({
			requestId: ctx.billingRequestId,
			workspaceId: "team_charge",
			cost_nanos: 12345,
			creditSnapshotBalanceNanos: null,
		});
		expect(recordUsageAndChargeMock.mock.calls[0]?.[0]?.requestId).not.toBe(ctx.requestId);
	});

	it("skips non-positive charge values", async () => {
		const ctx: any = {
			requestId: "req_charge_zero",
			billingRequestId: "G-01K4D24Q8Y8RN8Z8Z8RN8Z8Z8S",
			workspaceId: "team_charge",
			endpoint: "responses",
			meta: {},
		};

		await recordUsageAndChargeOnce({
			ctx,
			costNanos: 0,
			endpoint: "responses",
		});

		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
	});

	it("never charges an internally-authorized testing-mode request", async () => {
		const ctx: any = {
			requestId: "req_charge_synthetic",
			billingRequestId: "G-01K4D24Q8Y8RN8Z8Z8RN8Z8Z8T",
			workspaceId: "team_perf",
			endpoint: "responses",
			testingMode: true,
			meta: {},
		};

		await recordUsageAndChargeOnce({
			ctx,
			costNanos: 999_000_000,
			endpoint: "responses",
		});

		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
	});

	it("retries an idempotent charge after a transient persistence failure", async () => {
		recordUsageAndChargeMock
			.mockRejectedValueOnce(new Error("temporary_supabase_failure"))
			.mockResolvedValueOnce(undefined);
		const ctx: any = {
			requestId: "req_charge_retry",
			billingRequestId: "G-01K4D24Q8Y8RN8Z8Z8RN8Z8Z8V",
			workspaceId: "team_charge",
			endpoint: "responses",
			meta: {},
		};

		await recordUsageAndChargeOnce({
			ctx,
			costNanos: 54321,
			endpoint: "responses",
		});

		expect(recordUsageAndChargeMock).toHaveBeenCalledTimes(2);
		expect(recordUsageAndChargeMock.mock.calls[0]?.[0]?.requestId).toBe(
			recordUsageAndChargeMock.mock.calls[1]?.[0]?.requestId,
		);
		expect(recordUsageAndChargeMock.mock.calls[0]?.[0]?.requestId).not.toBe(ctx.requestId);
		expect(ctx.meta.__usageChargeRecorded).toBe(true);
	});

	it("uses distinct billing IDs when clients reuse a public request ID", async () => {
		const firstCtx: any = {
			requestId: "client-controlled-id",
			billingRequestId: "G-01K4D24Q8Y8RN8Z8Z8RN8Z8Z8W",
			workspaceId: "team_charge",
			meta: {},
		};
		const secondCtx: any = {
			requestId: "client-controlled-id",
			billingRequestId: "G-01K4D24Q8Y8RN8Z8Z8RN8Z8Z8X",
			workspaceId: "team_charge",
			meta: {},
		};

		await recordUsageAndChargeOnce({ ctx: firstCtx, costNanos: 1, endpoint: "responses" });
		await recordUsageAndChargeOnce({ ctx: secondCtx, costNanos: 2, endpoint: "responses" });

		expect(recordUsageAndChargeMock).toHaveBeenCalledTimes(2);
		expect(recordUsageAndChargeMock.mock.calls[0]?.[0]?.requestId).not.toBe(
			recordUsageAndChargeMock.mock.calls[1]?.[0]?.requestId,
		);
	});

	it("surfaces exhausted stream charging retries for durable failure auditing", async () => {
		recordUsageAndChargeMock.mockRejectedValue(new Error("database_unavailable"));
		const ctx: any = { requestId: "req_charge_failed", workspaceId: "team_charge", meta: {} };
		await expect(recordUsageAndChargeOnce({ ctx, costNanos: 54321, endpoint: "responses", throwOnFailure: true }))
			.rejects.toThrow("usage_charge_persistence_failed");
		expect(recordUsageAndChargeMock).toHaveBeenCalledTimes(3);
		expect(ctx.meta.__usageChargeRecorded).not.toBe(true);
	});

	describe("drain checkpoint charges", () => {
		// One-off charges and stored-total charges (gateway_charge_request_total), in call order.
		const calls = () => [
			...recordUsageAndChargeMock.mock.invocationCallOrder.map((order, i) =>
				[order, "one_off", recordUsageAndChargeMock.mock.calls[i][0].requestId, recordUsageAndChargeMock.mock.calls[i][0].cost_nanos] as const),
			...recordRequestChargeTotalMock.mock.invocationCallOrder.map((order, i) => {
				const args = recordRequestChargeTotalMock.mock.calls[i][0];
				return [order, args.final ? "final_total" : "checkpoint_total", args.requestId, args.total_nanos] as const;
			}),
		].sort((a, b) => a[0] - b[0]).map(([, ...rest]) => rest);
		const ctxFor = (): any => ({ requestId: "r", billingRequestId: "bill", workspaceId: "ws", meta: {} });
		beforeEach(() => { recordRequestChargeTotalMock.mockReset().mockResolvedValue(undefined); });

		it("sends running totals under the request's own key, then the final bill as the total", async () => {
			const ctx = ctxFor();
			await recordProvisionalStreamCharge({ ctx, costNanos: 100, endpoint: "chat.completions" });
			await recordProvisionalStreamCharge({ ctx, costNanos: 250, endpoint: "chat.completions" });
			expect(requestChargedInSteps(ctx)).toBe(true);
			await recordUsageAndChargeOnce({ ctx, costNanos: 400, endpoint: "chat.completions" });
			expect(calls()).toEqual([["checkpoint_total", "bill", 100], ["checkpoint_total", "bill", 250], ["final_total", "bill", 400]]);
			// Nothing after the final charge.
			await recordProvisionalStreamCharge({ ctx, costNanos: 900, endpoint: "chat.completions" });
			expect(calls()).toHaveLength(3);
		});

		it("reconciles a checkpoint whose responses were all lost from the stored total, without a second charge", async () => {
			// The debit may have committed; the gateway only saw errors.
			recordRequestChargeTotalMock.mockRejectedValueOnce(new Error("lost")).mockRejectedValueOnce(new Error("lost")).mockRejectedValueOnce(new Error("lost"));
			const ctx = ctxFor();
			await recordProvisionalStreamCharge({ ctx, costNanos: 100, endpoint: "responses" });
			await recordUsageAndChargeOnce({ ctx, costNanos: 300, endpoint: "responses", throwOnFailure: true });
			// The final bill is the total (300), never 300 on top of a committed 100.
			expect(calls()).toEqual([
				["checkpoint_total", "bill", 100], ["checkpoint_total", "bill", 100], ["checkpoint_total", "bill", 100],
				["final_total", "bill", 300],
			]);
			expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		});

		it("sends a final bill below the estimates, so the database refunds the difference", async () => {
			const ctx = ctxFor();
			await recordProvisionalStreamCharge({ ctx, costNanos: 500, endpoint: "responses" });
			await recordUsageAndChargeOnce({ ctx, costNanos: 400, endpoint: "responses", throwOnFailure: true });
			expect(calls()).toEqual([["checkpoint_total", "bill", 500], ["final_total", "bill", 400]]);
			expect(ctx.meta.__usageChargeRecorded).toBe(true);
		});

		it("sends a waived final bill of 0, so the estimates are refunded", async () => {
			const ctx = ctxFor();
			await recordProvisionalStreamCharge({ ctx, costNanos: 300, endpoint: "responses" });
			await recordUsageAndChargeOnce({ ctx, costNanos: 0, endpoint: "responses" });
			expect(calls()).toEqual([["checkpoint_total", "bill", 300], ["final_total", "bill", 0]]);
		});

		it("waits for a checkpoint in flight before the final charge", async () => {
			let release: (() => void) | undefined;
			recordRequestChargeTotalMock.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
			const ctx = ctxFor();
			void recordProvisionalStreamCharge({ ctx, costNanos: 100, endpoint: "responses" });
			while (!release) await new Promise((resolve) => setImmediate(resolve));
			const final = recordUsageAndChargeOnce({ ctx, costNanos: 300, endpoint: "responses" });
			for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
			expect(calls()).toEqual([["checkpoint_total", "bill", 100]]);
			release!();
			await final;
			expect(calls()).toEqual([["checkpoint_total", "bill", 100], ["final_total", "bill", 300]]);
		});

		it("charges a request with no checkpoint once, exactly as before", async () => {
			const ctx = ctxFor();
			// Registered but not started before the final charge: dropped, never sent.
			void recordProvisionalStreamCharge({ ctx, costNanos: 100, endpoint: "responses" });
			await recordUsageAndChargeOnce({ ctx, costNanos: 300, endpoint: "responses" });
			expect(calls()).toEqual([["one_off", "bill", 300]]);
			expect(requestChargedInSteps(ctx)).toBe(false);
			// No checkpoint and nothing to bill: no call at all.
			const free = ctxFor();
			await recordUsageAndChargeOnce({ ctx: free, costNanos: 0, endpoint: "responses" });
			expect(calls()).toHaveLength(1);
		});
	});
});
