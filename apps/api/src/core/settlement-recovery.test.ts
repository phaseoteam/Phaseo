import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ env: {} as any, charge: vi.fn(), send: vi.fn(), dead: vi.fn(), release: vi.fn() }));
vi.mock("@/runtime/env", () => ({ getBindingsIfConfigured: () => state.env, configureRuntime: vi.fn(), clearRuntime: vi.fn(), setWaitUntil: () => state.release }));
vi.mock("@/pipeline/pricing/persist", () => ({ recordUsageAndCharge: state.charge }));
import { enqueueSettlementRecovery, handleSettlementRecoveryBatch, SettlementRecoveryRecord } from "./settlement-recovery";

const input = { workspaceId: "10000000-0000-4000-8000-000000000001", requestId: "G-server-owned", cost_nanos: 100,
    creditSnapshotBalanceNanos: 500 };
const record = () => ({ ...input, version: 1, createdAtMs: Date.now() });
const message = (body: unknown = record(), attempts = 1) => ({ id: "transport-id", body, attempts, timestamp: new Date(), ack: vi.fn(), retry: vi.fn() });
const batch = (...messages: ReturnType<typeof message>[]) => ({ queue: "recovery-test", messages, ackAll: vi.fn(), retryAll: vi.fn() });
const execution = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;
const drain = (messages: ReturnType<typeof batch>) => handleSettlementRecoveryBatch(messages as any, state.env, execution);
beforeEach(() => {
    vi.clearAllMocks();
    state.send.mockReset().mockResolvedValue(undefined);
    state.dead.mockReset().mockResolvedValue(undefined);
    state.charge.mockReset().mockResolvedValue({ applied: true });
    state.env = { GATEWAY_SETTLEMENT_RECOVERY_ENABLED: "true", GATEWAY_SETTLEMENT_RECOVERY_QUEUE_NAME: "recovery-test",
        SETTLEMENT_RECOVERY_QUEUE: { send: state.send }, SETTLEMENT_RECOVERY_DEAD_LETTER: { send: state.dead } };
});

describe("failed charge recovery", () => {
    it.each(["resolve", "reject", "throw"])("clears the transfer timer on immediate %s", async mode => {
        vi.useFakeTimers();
        try {
            if (mode === "reject") state.send.mockRejectedValue(new Error("unavailable"));
            if (mode === "throw") state.send.mockImplementation(() => { throw new Error("unavailable"); });
            if (mode === "resolve") expect(await enqueueSettlementRecovery(input)).toBe(true);
            else await expect(enqueueSettlementRecovery(input)).rejects.toThrow("unavailable");
            expect(vi.getTimerCount()).toBe(0);
            expect(state.send).toHaveBeenCalledOnce();
        } finally { vi.useRealTimers(); }
    });
    it("observes late send rejection without an unhandled rejection or a second send", async () => {
        vi.useFakeTimers();
        let fail!: (error: Error) => void;
        state.send.mockReturnValue(new Promise<void>((_resolve, reject) => { fail = reject; }));
        try {
            const pending = enqueueSettlementRecovery(input).catch(error => error.message);
            await vi.advanceTimersByTimeAsync(5_000);
            expect(await pending).toBe("settlement_transfer_unconfirmed");
            fail(new Error("late transport failure"));
            await vi.advanceTimersByTimeAsync(1);
            expect(state.send).toHaveBeenCalledOnce();
            expect(vi.getTimerCount()).toBe(0);
        } finally { vi.useRealTimers(); }
    });
    it("times out unconfirmed enqueue without treating late acceptance as confirmation", async () => {
        vi.useFakeTimers();
        let finish!: () => void;
        state.send.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
        try {
            let outcome = "pending";
            const pending = enqueueSettlementRecovery(input).then(() => { outcome = "confirmed"; }, () => { outcome = "unknown"; });
            await vi.advanceTimersByTimeAsync(4_999);
            expect(outcome).toBe("pending");
            await vi.advanceTimersByTimeAsync(1);
            expect(outcome).toBe("unknown");
            await pending;
            finish(); await Promise.resolve();
            expect(outcome).toBe("unknown");
            expect(state.send).toHaveBeenCalledOnce();
            expect(vi.getTimerCount()).toBe(0);
        } finally { vi.useRealTimers(); }
    });
    it("continues a mixed batch after stalled quarantine and never acknowledges late transfer", async () => {
        vi.useFakeTimers();
        let finish!: () => void;
        state.dead.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
        try {
            const poison = message(null), healthy = message();
            const pending = drain(batch(poison, healthy));
            await vi.advanceTimersByTimeAsync(5_000);
            expect(poison.retry).toHaveBeenCalledExactlyOnceWith({ delaySeconds: 300 });
            await pending;
            expect(poison.ack).not.toHaveBeenCalled();
            expect(healthy.ack).toHaveBeenCalledOnce();
            expect(healthy.retry).not.toHaveBeenCalled();
            finish(); await Promise.resolve();
            expect(poison.ack).not.toHaveBeenCalled();
            expect(state.charge).toHaveBeenCalledOnce();
            expect(vi.getTimerCount()).toBe(0);
        } finally { vi.useRealTimers(); }
    });
    it("does no queue work when disabled and fails closed with incomplete configuration", async () => {
        state.env.GATEWAY_SETTLEMENT_RECOVERY_ENABLED = "false";
        expect(await enqueueSettlementRecovery(input)).toBe(false);
        expect(state.send).not.toHaveBeenCalled();
        state.env.GATEWAY_SETTLEMENT_RECOVERY_ENABLED = "true";
        delete state.env.SETTLEMENT_RECOVERY_DEAD_LETTER;
        await expect(enqueueSettlementRecovery(input)).rejects.toThrow("not_configured");
        expect(state.send).not.toHaveBeenCalled();
    });
    it("awaits confirmed enqueue and preserves the immutable billing identity", async () => {
        let finish!: () => void;
        state.send.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
        let confirmed = false;
        const pending = enqueueSettlementRecovery(input).then(result => { confirmed = result; });
        await Promise.resolve();
        expect(confirmed).toBe(false);
        expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ ...input, version: 1 }), { contentType: "json" });
        finish(); await pending;
        expect(confirmed).toBe(true);
        expect(JSON.stringify(state.send.mock.calls[0][0]).length).toBeLessThan(512);
    });
    it.each([NaN, Infinity, -1, 0, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe charge amount %s", async cost_nanos => {
        await expect(enqueueSettlementRecovery({ ...input, cost_nanos })).rejects.toThrow();
        expect(state.send).not.toHaveBeenCalled();
    });
    it("rejects payload expansion and credential fields", () => {
        expect(SettlementRecoveryRecord.safeParse({ ...record(), token: "secret" }).success).toBe(false);
        expect(SettlementRecoveryRecord.safeParse({ ...record(), requestId: "x".repeat(129) }).success).toBe(false);
    });
    it("does not charge from the transport ID and acknowledges after confirmed debit", async () => {
        const item = message();
        let finish!: (result: unknown) => void;
        state.charge.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const pending = drain(batch(item));
        await vi.waitFor(() => expect(state.charge).toHaveBeenCalledOnce());
        expect(item.ack).not.toHaveBeenCalled();
        expect(state.charge).toHaveBeenCalledWith({ ...input, debitSignal: expect.any(AbortSignal) });
        finish({ already_applied: true }); await pending;
        expect(item.ack).toHaveBeenCalledOnce();
        expect(item.retry).not.toHaveBeenCalled();
    });
    it("aborts a stalled debit and retries without acknowledging an unknown outcome", async () => {
        vi.useFakeTimers();
        let signal!: AbortSignal;
        state.charge.mockImplementation(({ debitSignal }) => new Promise((_resolve, reject) => {
            signal = debitSignal;
            signal.addEventListener("abort", () => reject(new Error("ambiguous debit timeout")), { once: true });
        }));
        try {
            const item = message();
            const pending = drain(batch(item));
            await vi.advanceTimersByTimeAsync(4_999);
            expect(signal.aborted).toBe(false);
            expect(item.retry).not.toHaveBeenCalled();
            expect(item.ack).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1); await pending;
            expect(signal.aborted).toBe(true);
            expect(item.ack).not.toHaveBeenCalled();
            expect(item.retry).toHaveBeenCalledExactlyOnceWith({ delaySeconds: 30 });
            expect(vi.getTimerCount()).toBe(0);
        } finally { vi.useRealTimers(); }
    });
    it("clears debit deadlines on success and uses independent signals per record", async () => {
        vi.useFakeTimers();
        try {
            const first = message(), second = message({ ...record(), requestId: "other" });
            await drain(batch(first, second));
            expect(first.ack).toHaveBeenCalledOnce(); expect(second.ack).toHaveBeenCalledOnce();
            const signals = state.charge.mock.calls.map(([args]) => args.debitSignal);
            expect(signals[0]).not.toBe(signals[1]);
            expect(vi.getTimerCount()).toBe(0);
            await vi.advanceTimersByTimeAsync(10_000);
            expect(signals.every(signal => !signal.aborted)).toBe(true);
        } finally { vi.useRealTimers(); }
    });
    it("replays a timeout-after-commit with no duplicate debit after a fresh invocation", async () => {
        const ledger = new Map<string, number>(); let debits = 0;
        state.charge.mockImplementation(async (value: typeof input) => {
            const key = `${value.workspaceId}:${value.requestId}`;
            if (ledger.has(key)) {
                if (ledger.get(key) !== value.cost_nanos) throw new Error("amount mismatch");
                return { already_applied: true };
            }
            ledger.set(key, value.cost_nanos); debits++;
            throw new Error("response lost after commit");
        });
        const first = message(); await drain(batch(first));
        expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
        const replay = message(first.body, 2); await drain(batch(replay));
        expect(replay.ack).toHaveBeenCalledOnce();
        const duplicate = message(first.body, 1); await drain(batch(duplicate));
        expect(duplicate.ack).toHaveBeenCalledOnce();
        expect(debits).toBe(1);
    });
    it("handles mixed outcomes individually without retrying successful records", async () => {
        state.charge.mockResolvedValueOnce({ applied: true }).mockRejectedValueOnce(new Error("down"));
        const ok = message(), failed = message({ ...record(), requestId: "G-other" }, 3);
        const items = batch(ok, failed); await drain(items);
        expect(ok.ack).toHaveBeenCalledOnce();
        expect(ok.retry).not.toHaveBeenCalled();
        expect(failed.retry).toHaveBeenCalledWith({ delaySeconds: 120 });
        expect(items.ackAll).not.toHaveBeenCalled();
        expect(items.retryAll).not.toHaveBeenCalled();
    });
    it("quarantines exhausted records only after confirmed transfer", async () => {
        state.charge.mockRejectedValue(new Error("permanent"));
        let finish!: () => void;
        state.dead.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
        const item = message(record(), 5);
        const pending = drain(batch(item));
        await vi.waitFor(() => expect(state.dead).toHaveBeenCalled());
        expect(item.ack).not.toHaveBeenCalled();
        finish(); await pending;
        expect(item.ack).toHaveBeenCalledOnce();
        expect(state.dead).toHaveBeenCalledWith(item.body, { contentType: "json" });
    });
    it("does not retry financial work past the attempt budget if DLQ is unavailable", async () => {
        state.dead.mockRejectedValue(new Error("DLQ down"));
        const item = message(record(), 6); await drain(batch(item));
        expect(state.charge).not.toHaveBeenCalled();
        expect(item.ack).not.toHaveBeenCalled();
        expect(item.retry).toHaveBeenCalledWith({ delaySeconds: 300 });
    });
    it.each([null, { version: 2 }, { ...record(), createdAtMs: 0 }, { ...record(), createdAtMs: Date.now() + 120_000 }])("quarantines invalid, expired and future records without charging", async body => {
        const item = message(body); await drain(batch(item));
        expect(state.charge).not.toHaveBeenCalled();
        expect(state.dead).toHaveBeenCalledWith(body, { contentType: "json" });
        expect(item.ack).toHaveBeenCalledOnce();
    });
    it("never acknowledges an unexpected queue or disabled recovery handler", async () => {
        const items = { ...batch(message()), queue: "wrong" };
        await drain(items);
        expect(items.retryAll).toHaveBeenCalledWith({ delaySeconds: 300 });
        expect(state.charge).not.toHaveBeenCalled();
        expect(state.dead).not.toHaveBeenCalled();
    });
});
