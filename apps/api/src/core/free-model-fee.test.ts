import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "@/pipeline/before/types";
const mocks = vi.hoisted(() => ({ enabled: "true", prepare: vi.fn(), finish: vi.fn(), get: vi.fn(), debit: vi.fn(), count: vi.fn() }));
vi.mock("@/runtime/env", () => ({ getBindingsIfConfigured: () => ({ GATEWAY_FREE_MODEL_OVERAGE_ENABLED: mocks.enabled,
    FREE_MODEL_QUOTA: { getByName: mocks.get } }) }));
vi.mock("@/runtime/request-operations", () => ({ countOperation: mocks.count, recordSettlement: vi.fn(), recordSettlementAttempt: vi.fn() }));
vi.mock("@/pipeline/pricing/persist", () => ({ recordUsageAndCharge: mocks.debit }));
import { authorizeFreeModelFee, applyFreeModelFee, releaseFailedFreeModelFee, freeModelFeeAudit, settleFreeModelFee } from "./free-model-fee";
import { recordUsageAndChargeOnce } from "@/pipeline/after/charge";
const context = () => ({ workspaceId: "10000000-0000-4000-8000-000000000001", workspaceOwnerUserId: "10000000-0000-4000-8000-000000000002",
    keyId: "20000000-0000-4000-8000-000000000001", billingRequestId: "private-server", requestId: "public-client",
    responseCache: { enabled: true }, meta: {} } as PipelineContext);
const priced = (totalNanos = 0, billingSuppressed = false) => ({ pricedUsage: { output_tokens: 1, pricing: { lines: [], total_nanos: totalNanos } }, totalNanos, totalCents: 0, billingSuppressed });
beforeEach(() => {
    vi.clearAllMocks(); mocks.enabled = "true";
    mocks.get.mockReturnValue({ prepareFee: mocks.prepare, finishFee: mocks.finish });
    mocks.prepare.mockResolvedValue({ allowed: true }); mocks.finish.mockResolvedValue({ settled: true, review: false });
});
describe("free fee lifecycle", () => {
    it("keeps included/disabled inference free of coordinator calls", async () => {
        const ctx = context(), cost = priced(); mocks.enabled = "false";
        expect(await authorizeFreeModelFee(ctx, 0)).toBe(false);
        expect(applyFreeModelFee(ctx, cost)).toBe(cost);
        await recordUsageAndChargeOnce({ ctx, costNanos: 0, endpoint: "responses" });
        expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.debit).not.toHaveBeenCalled();
    });
    it("captures exactly one fee, preserving private/public identity and preventing double debit", async () => {
        const ctx = context(); await authorizeFreeModelFee(ctx, 3);
        expect(mocks.prepare).toHaveBeenCalledWith({ workspaceId: ctx.workspaceId, keyId: ctx.keyId,
            requestId: "private-server", auditRequestId: "public-client" }, 3);
        expect(mocks.get).toHaveBeenCalledWith(`owner:${ctx.workspaceOwnerUserId}`);
        expect(ctx.responseCache?.enabled).toBe(false);
        const cost = applyFreeModelFee(ctx, priced());
        expect(cost.totalNanos).toBe(100000);
        expect(applyFreeModelFee(ctx, cost).totalNanos).toBe(100000);
        expect(freeModelFeeAudit(ctx)).toEqual({ free_model_fee_request_id: "private-server" });
        await Promise.all(Array.from({ length: 16 }, () => recordUsageAndChargeOnce({ ctx, costNanos: cost.totalNanos, endpoint: "responses" })));
        expect(mocks.finish).toHaveBeenCalledOnce(); expect(mocks.finish.mock.calls[0][1]).toBe("capture");
        expect(mocks.debit).not.toHaveBeenCalled();
        await releaseFailedFreeModelFee(ctx); expect(mocks.finish).toHaveBeenCalledOnce();
    });
    it("only debits non-fee costs through the ordinary ledger", async () => {
        const ctx = context(); await authorizeFreeModelFee(ctx, 0);
        const cost = applyFreeModelFee(ctx, priced(123));
        await recordUsageAndChargeOnce({ ctx, costNanos: cost.totalNanos, endpoint: "responses" });
        expect(mocks.debit).toHaveBeenCalledWith(expect.objectContaining({ cost_nanos: 123 }));
    });
    it.each(["failure", "suppressed"])("releases %s without charging", async mode => {
        const ctx = context(); await authorizeFreeModelFee(ctx, 0);
        if (mode === "suppressed") {
            expect(applyFreeModelFee(ctx, priced(0, true)).totalNanos).toBe(0);
            await recordUsageAndChargeOnce({ ctx, costNanos: 0, endpoint: "responses" });
        } else await releaseFailedFreeModelFee(ctx);
        expect(mocks.finish.mock.calls[0][1]).toBe("release"); expect(mocks.debit).not.toHaveBeenCalled();
        expect(freeModelFeeAudit(ctx)).toEqual({});
    });
    it("does not create release work for a definitive admission denial", async () => {
        mocks.prepare.mockResolvedValue({ allowed: false }); const ctx = context();
        expect(await authorizeFreeModelFee(ctx, 0)).toBe(false);
        await releaseFailedFreeModelFee(ctx); expect(mocks.finish).not.toHaveBeenCalled();
    });
    it("releases an unconfirmed hold when the provider was never dispatched", async () => {
        mocks.prepare.mockRejectedValueOnce(new Error("lost")); const ctx = context();
        await expect(authorizeFreeModelFee(ctx, 0)).rejects.toThrow("lost");
        await releaseFailedFreeModelFee(ctx); expect(mocks.finish.mock.calls[0][1]).toBe("release");
    });
    it("never switches an ambiguous capture to release or another debit", async () => {
        const ctx = context(); await authorizeFreeModelFee(ctx, 0); applyFreeModelFee(ctx, priced());
        mocks.finish.mockRejectedValueOnce(new Error("lost"));
        await expect(settleFreeModelFee(ctx, true)).rejects.toThrow("lost");
        await releaseFailedFreeModelFee(ctx); expect(mocks.finish).toHaveBeenCalledOnce();
        await settleFreeModelFee(ctx, true); expect(mocks.finish).toHaveBeenCalledTimes(2);
        expect(mocks.finish.mock.calls.every(call => call[1] === "capture")).toBe(true);
    });
    it("accepts durable recovery without inventing a second debit", async () => {
        const ctx = context(); await authorizeFreeModelFee(ctx, 0); applyFreeModelFee(ctx, priced());
        mocks.finish.mockResolvedValue({ settled: false, review: true });
        await recordUsageAndChargeOnce({ ctx, costNanos: 100000, endpoint: "responses" });
        expect(mocks.debit).not.toHaveBeenCalled();
    });
    it("rejects keyless overage rather than bypassing key budgets", async () => {
        const ctx = context(); ctx.keyId = null;
        await expect(authorizeFreeModelFee(ctx, 0)).rejects.toThrow(); expect(mocks.prepare).not.toHaveBeenCalled();
    });
    it("rejects mismatched audit/authorization keys before making a hold", async () => {
        const ctx = context(); ctx.meta.apiKeyId = "20000000-0000-4000-8000-000000000002";
        await expect(authorizeFreeModelFee(ctx, 0)).rejects.toThrow("key_identity_conflict");
        expect(mocks.prepare).not.toHaveBeenCalled();
    });
    it("rejects invalid fee totals before capture", async () => {
        const ctx = context(); await authorizeFreeModelFee(ctx, 0); applyFreeModelFee(ctx, priced());
        await expect(recordUsageAndChargeOnce({ ctx, costNanos: 0, endpoint: "responses" })).rejects.toThrow("pricing_mismatch");
        expect(mocks.finish).not.toHaveBeenCalled();
    });
});
