import { beforeEach, describe, expect, it, vi } from "vitest";

const recordUsageAndChargeMock = vi.hoisted(() => vi.fn(async () => {}));
const recoveryMock = vi.hoisted(() => vi.fn(async () => false));
vi.mock("@/core/settlement-recovery", () => ({ enqueueSettlementRecovery: recoveryMock }));

vi.mock("../pricing/persist", () => ({
	recordUsageAndCharge: recordUsageAndChargeMock,
}));

import { recordUsageAndChargeOnce } from "./charge";

describe("recordUsageAndChargeOnce", () => {
    it("bounds stalled debit transports and hands off once after three ambiguous attempts", async () => {
        vi.useFakeTimers();
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const signals: AbortSignal[] = [];
        recordUsageAndChargeMock.mockImplementation((args: any) => new Promise<void>((_resolve, reject) => {
            signals.push(args.debitSignal);
            args.debitSignal?.addEventListener("abort", () => reject(new Error("response unknown")), { once: true });
        }));
        recoveryMock.mockResolvedValue(true);
        try {
            const ctx: any = { requestId: "public", billingRequestId: "server", workspaceId: "workspace", meta: {} };
            const pending = Promise.all(Array.from({ length: 16 }, () => recordUsageAndChargeOnce({ ctx, costNanos: 100, endpoint: "responses" })));
            await vi.advanceTimersByTimeAsync(4_999);
            expect(signals[0]).toBeInstanceOf(AbortSignal);
            expect(signals[0].aborted).toBe(false);
            expect(recoveryMock).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(10_601); await pending;
            expect(signals).toHaveLength(3);
            expect(new Set(signals).size).toBe(3);
            expect(signals.every(signal => signal.aborted)).toBe(true);
            expect(recoveryMock).toHaveBeenCalledExactlyOnceWith({ requestId: "server", workspaceId: "workspace", cost_nanos: 100, creditSnapshotBalanceNanos: null });
            expect(ctx.meta.__usageChargeRecorded).not.toBe(true);
            expect(ctx.meta.__usageChargeRecoveryEnqueued).toBe(true);
            expect(vi.getTimerCount()).toBe(0);
        } finally { log.mockRestore(); vi.useRealTimers(); }
    });
    it("clears successful debit deadlines and never transfers a successful charge", async () => {
        vi.useFakeTimers();
        try {
            const ctx: any = { requestId: "public", billingRequestId: "server", workspaceId: "workspace", meta: {} };
            await recordUsageAndChargeOnce({ ctx, costNanos: 100, endpoint: "responses" });
            const signal = (recordUsageAndChargeMock.mock.calls[0] as any)[0].debitSignal;
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(vi.getTimerCount()).toBe(0);
            await vi.advanceTimersByTimeAsync(10_000);
            expect(signal.aborted).toBe(false);
            expect(recoveryMock).not.toHaveBeenCalled();
        } finally { vi.useRealTimers(); }
    });
    it("coalesces concurrent finalizers before the credit-write barrier", async () => {
        let finish!: () => void;
        let settle!: () => void;
        recordUsageAndChargeMock.mockImplementation(() => new Promise<void>(resolve => { settle = resolve; }));
        const ctx: any = { requestId: "r", billingRequestId: "bill", workspaceId: "ws", meta: {},
            creditCacheWrites: [new Promise<void>(resolve => { finish = resolve; })] };
        const pending = Array.from({ length: 32 }, () => recordUsageAndChargeOnce({ ctx, costNanos: 10, endpoint: "responses" }));
        await Promise.resolve(); expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
        finish();
        await vi.waitFor(() => expect(recordUsageAndChargeMock).toHaveBeenCalled());
        expect(recordUsageAndChargeMock).toHaveBeenCalledOnce();
        settle(); await Promise.all(pending);
        expect(ctx.meta.__usageChargeRecorded).toBe(true);
    });

    it("coalesces different context wrappers sharing one request's metadata", async () => {
        const meta = {};
        const ctx: any = { requestId: "r", billingRequestId: "bill", workspaceId: "ws", meta };
        await Promise.all([
            recordUsageAndChargeOnce({ ctx, costNanos: 10, endpoint: "responses" }),
            recordUsageAndChargeOnce({ ctx: { ...ctx }, costNanos: 10, endpoint: "responses" }),
        ]);
        expect(recordUsageAndChargeMock).toHaveBeenCalledOnce();
    });

    it("does not silently accept a conflicting amount or identity for one settlement", async () => {
        const ctx: any = { requestId: "r", billingRequestId: "bill", workspaceId: "ws", meta: {} };
        await recordUsageAndChargeOnce({ ctx, costNanos: 10, endpoint: "responses" });
        await expect(recordUsageAndChargeOnce({ ctx, costNanos: 20, endpoint: "responses" })).rejects.toThrow("settlement_identity_conflict");
        await expect(recordUsageAndChargeOnce({ ctx: { ...ctx, workspaceId: "other" }, costNanos: 10, endpoint: "responses" })).rejects.toThrow("settlement_identity_conflict");
        expect(recordUsageAndChargeMock).toHaveBeenCalledOnce();
    });

    it("shares retry attempts and permits recovery after an exhausted attempt", async () => {
        vi.useFakeTimers();
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            recordUsageAndChargeMock.mockRejectedValue(new Error("unavailable"));
            const ctx: any = { requestId: "r", billingRequestId: "bill", workspaceId: "ws", meta: {} };
            const pending = Promise.all(Array.from({ length: 16 }, () => recordUsageAndChargeOnce({ ctx, costNanos: 10, endpoint: "responses" })));
            await vi.runAllTimersAsync(); await pending;
            expect(recordUsageAndChargeMock).toHaveBeenCalledTimes(3);
            expect(log).toHaveBeenCalledOnce();
            expect(ctx.meta.__usageChargeRecorded).not.toBe(true);
            recordUsageAndChargeMock.mockResolvedValue(undefined);
            await recordUsageAndChargeOnce({ ctx, costNanos: 10, endpoint: "responses" });
            expect(recordUsageAndChargeMock).toHaveBeenCalledTimes(4);
            expect(ctx.meta.__usageChargeRecorded).toBe(true);
        } finally { log.mockRestore(); vi.useRealTimers(); }
    });
    it("passes the server-owned admission balance into settlement", async () => {
        const ctx: any = { requestId: "r", billingRequestId: "bill", workspaceId: "ws", meta: {},
            gating: { credit: { balanceNanos: 100_000_000_000_000 } }, rawBody: { creditSnapshotBalanceNanos: 1 } };
        await recordUsageAndChargeOnce({ ctx, costNanos: 10, endpoint: "responses" });
        expect(recordUsageAndChargeMock).toHaveBeenCalledWith({ requestId: "bill", workspaceId: "ws", cost_nanos: 10,
            creditSnapshotBalanceNanos: 100_000_000_000_000, debitSignal: expect.any(AbortSignal) });
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
		recoveryMock.mockReset().mockResolvedValue(false);
	});

	it("transfers exhausted retries to durable recovery once across concurrent finalizers", async () => {
		vi.useFakeTimers();
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			recordUsageAndChargeMock.mockRejectedValue(new Error("down"));
			recoveryMock.mockResolvedValue(true);
			const ctx: any = { requestId: "client", billingRequestId: "server", workspaceId: "workspace", meta: {} };
			const pending = Promise.all(Array.from({ length: 16 }, () => recordUsageAndChargeOnce({ ctx, costNanos: 100, endpoint: "responses" })));
			await vi.runAllTimersAsync(); await pending;
			expect(recordUsageAndChargeMock).toHaveBeenCalledTimes(3);
			expect(recoveryMock).toHaveBeenCalledExactlyOnceWith({ requestId: "server", workspaceId: "workspace", cost_nanos: 100, creditSnapshotBalanceNanos: null });
			expect(ctx.meta.__usageChargeRecorded).not.toBe(true);
			expect(ctx.meta.__usageChargeRecoveryEnqueued).toBe(true);
			await recordUsageAndChargeOnce({ ctx, costNanos: 100, endpoint: "responses" });
			expect(recoveryMock).toHaveBeenCalledOnce();
			await expect(recordUsageAndChargeOnce({ ctx, costNanos: 101, endpoint: "responses" })).rejects.toThrow("settlement_identity_conflict");
		} finally { log.mockRestore(); vi.useRealTimers(); }
	});

	it("keeps failed enqueue recoverable and adds no queue work on successful settlement", async () => {
		vi.useFakeTimers();
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			recordUsageAndChargeMock.mockRejectedValue(new Error("down"));
			recoveryMock.mockRejectedValue(new Error("queue unavailable"));
			const ctx: any = { requestId: "client", billingRequestId: "server", workspaceId: "workspace", meta: {} };
			const pending = recordUsageAndChargeOnce({ ctx, costNanos: 100, endpoint: "responses" });
			await vi.runAllTimersAsync(); await pending;
			expect(ctx.meta.__usageChargeRecoveryEnqueued).not.toBe(true);
			recordUsageAndChargeMock.mockResolvedValue(undefined);
			await recordUsageAndChargeOnce({ ctx, costNanos: 100, endpoint: "responses" });
			expect(ctx.meta.__usageChargeRecorded).toBe(true);
			expect(recoveryMock).toHaveBeenCalledOnce();
		} finally { log.mockRestore(); vi.useRealTimers(); }
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
			debitSignal: expect.any(AbortSignal),
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
});
