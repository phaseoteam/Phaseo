import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardFreeModelAdmission } from "./free-model-admission";
import type { PipelineContext } from "../before/types";
import type { PriceCard } from "../pricing";
const mocks = vi.hoisted(() => ({ enabled: "true", admit: vi.fn(), limit: vi.fn(), getByName: vi.fn(), count: vi.fn(), outcome: vi.fn() }));
vi.mock("@/runtime/env", () => ({ getBindingsIfConfigured: () => ({ GATEWAY_FREE_MODEL_QUOTA_ENABLED: mocks.enabled,
    FREE_MODEL_QUOTA: { getByName: mocks.getByName }, FREE_MODEL_RATE_LIMITER: { limit: mocks.limit } }) }));
vi.mock("@/runtime/request-operations", () => ({ countOperation: mocks.count, recordQuotaAdmission: mocks.outcome }));
const owner = "10000000-0000-4000-8000-000000000001";
const free = { rules: [{ pricing_plan: "free", price_per_unit: "0" }] } as PriceCard;
const paid = { rules: [{ pricing_plan: "standard", price_per_unit: "1" }] } as PriceCard;
const ctx = (workspaceId = "ws-a") => ({ workspaceId, workspaceOwnerUserId: owner, workspaceRuntimeExpiresAt: Date.now() + 60_000 } as PipelineContext);
beforeEach(() => {
    vi.clearAllMocks(); mocks.enabled = "true";
    mocks.getByName.mockReturnValue({ admit: mocks.admit });
    mocks.admit.mockResolvedValue({ allowed: true, mode: "included", feeNanos: 0, remaining: 1499, policyVersion: 0 });
    mocks.limit.mockResolvedValue({ success: true });
});
describe("free-model routing admission", () => {
    it("shares the owner's object across workspaces, never by API key", async () => {
        await guardFreeModelAdmission(ctx(), free, "gateway");
        await guardFreeModelAdmission(ctx("ws-b"), free, "gateway");
        expect(mocks.getByName.mock.calls).toEqual([[`owner:${owner}`], [`owner:${owner}`]]);
    });
    it("uses one RPC and edge check across concurrent retries/fallbacks", async () => {
        const request = ctx();
        expect(await Promise.all(Array.from({ length: 32 }, () => guardFreeModelAdmission(request, free, "gateway")))).toEqual(Array(32).fill(null));
        expect(mocks.admit).toHaveBeenCalledOnce(); expect(mocks.limit).toHaveBeenCalledOnce();
        expect(mocks.count).toHaveBeenCalledExactlyOnceWith("quotaRpc");
        expect((await guardFreeModelAdmission(request, paid, "gateway"))?.status).toBe(503);
        expect(mocks.outcome).toHaveBeenCalledExactlyOnceWith("included");
    });
    it("keeps paid, BYOK and disabled traffic off the coordinator", async () => {
        await guardFreeModelAdmission(ctx(), paid, "gateway");
        await guardFreeModelAdmission(ctx(), free, "byok");
        mocks.enabled = "false";
        await guardFreeModelAdmission(ctx(), free, "gateway");
        expect(mocks.admit).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
        expect(mocks.outcome).not.toHaveBeenCalled();
    });
    it("fails closed without a fresh trusted owner, never falls back to key creator", async () => {
        for (const overrides of [{ workspaceOwnerUserId: null }, { workspaceOwnerUserId: "forged" }, { workspaceRuntimeExpiresAt: Date.now() - 1 }]) {
            expect((await guardFreeModelAdmission({ ...ctx(), ...overrides }, free, "gateway"))?.status).toBe(503);
        }
        expect(mocks.admit).not.toHaveBeenCalled();
        expect(mocks.outcome).toHaveBeenCalledTimes(3);
        expect(mocks.outcome).toHaveBeenLastCalledWith("unavailable");
    });
    it("sheds edge bursts before calling the DO", async () => {
        mocks.limit.mockResolvedValue({ success: false });
        expect((await guardFreeModelAdmission(ctx(), free, "gateway"))?.status).toBe(429);
        expect(mocks.admit).not.toHaveBeenCalled();
        expect(mocks.outcome).toHaveBeenCalledExactlyOnceWith("edge_limited");
    });
    it("propagates limits and never retries an ambiguous RPC", async () => {
        mocks.admit.mockResolvedValue({ allowed: false, reason: "daily_limit", retryAfterSeconds: 321 });
        const rejection = await guardFreeModelAdmission(ctx(), free, "gateway");
        expect(rejection?.status).toBe(429); expect(rejection?.headers.get("Retry-After")).toBe("321");
        mocks.admit.mockRejectedValue(new Error("unknown response"));
        const request = ctx();
        expect((await guardFreeModelAdmission(request, free, "gateway"))?.status).toBe(503);
        expect((await guardFreeModelAdmission(request, free, "gateway"))?.status).toBe(503);
        expect(mocks.admit).toHaveBeenCalledTimes(2);
        expect(mocks.outcome.mock.calls).toEqual([["daily_limited"], ["unavailable"]]);
    });
    it("cannot charge or dispatch an overage before accounting rollout", async () => {
        mocks.admit.mockResolvedValue({ allowed: true, mode: "overage", feeNanos: 100_000, remaining: 0, policyVersion: 1 });
        expect((await guardFreeModelAdmission(ctx(), free, "gateway"))?.status).toBe(503);
        expect(mocks.outcome).toHaveBeenCalledExactlyOnceWith("overage_blocked");
    });
    it("accepts the final included slot and valid denial boundaries", async () => {
        mocks.admit.mockResolvedValue({ allowed: true, mode: "included", feeNanos: 0, remaining: 0, policyVersion: 1 });
        expect(await guardFreeModelAdmission(ctx(), free, "gateway")).toBeNull();
        for (const [reason, retryAfterSeconds] of [["rpm_limit", 1], ["daily_limit", 86_400]] as const) {
            mocks.admit.mockResolvedValue({ allowed: false, reason, retryAfterSeconds });
            const result = await guardFreeModelAdmission(ctx(), free, "gateway");
            expect(result?.status).toBe(429);
            expect(result?.headers.get("Retry-After")).toBe(String(retryAfterSeconds));
            expect(await result?.json()).toMatchObject({ error: `free_model_${reason}` });
        }
        expect(mocks.outcome.mock.calls).toEqual([["included"], ["rpm_limited"], ["daily_limited"]]);
    });
    it.each([
        undefined, null, {}, [], true, "allowed", { allowed: "true" },
        { allowed: true }, { allowed: true, mode: "unexpected", feeNanos: 0, remaining: 1, policyVersion: 0 },
        ...[1, -1, NaN, undefined].map(feeNanos => ({ allowed: true, mode: "included", feeNanos, remaining: 1, policyVersion: 0 })),
        ...[-1, 1500, 0.5, undefined].map(remaining => ({ allowed: true, mode: "included", feeNanos: 0, remaining, policyVersion: 0 })),
        ...[-1, Number.MAX_SAFE_INTEGER + 1, undefined].map(policyVersion => ({ allowed: true, mode: "included", feeNanos: 0, remaining: 1, policyVersion })),
        { allowed: false, reason: "sensitive-unexpected-value", retryAfterSeconds: 1 },
        ...[0, -1, 0.5, NaN, Infinity, 86401, "1", undefined].map(retryAfterSeconds => ({ allowed: false, reason: "daily_limit", retryAfterSeconds })),
    ])("rejects malformed coordinator reply %# without retry or raw diagnostics", async decision => {
        mocks.admit.mockResolvedValue(decision);
        const request = ctx();
        const responses = await Promise.all(Array.from({ length: 8 }, () => guardFreeModelAdmission(request, free, "gateway")));
        for (const response of responses) {
            expect(response?.status).toBe(503);
            expect(await response?.json()).toEqual({ error: "free_model_quota_unavailable", error_type: "system", error_origin: "gateway" });
            expect(response?.headers.get("Retry-After")).toBeNull();
        }
        expect(mocks.admit).toHaveBeenCalledOnce();
        expect(mocks.limit).toHaveBeenCalledOnce();
        expect(mocks.outcome).toHaveBeenCalledExactlyOnceWith("unavailable");
    });
    it.each([{}, { success: "true" }, { success: 1 }, null])("rejects malformed edge reply %# before the coordinator", async edge => {
        mocks.limit.mockResolvedValue(edge);
        const response = await guardFreeModelAdmission(ctx(), free, "gateway");
        expect(response?.status).toBe(503);
        expect(mocks.admit).not.toHaveBeenCalled();
        expect(mocks.outcome).toHaveBeenCalledExactlyOnceWith("unavailable");
    });
    it("does not treat missing pricing as free or allow a paid route for explicit free intent", async () => {
        expect((await guardFreeModelAdmission({ ...ctx(), model: "lab/model:free" }, paid, "gateway"))?.status).toBe(503);
        expect((await guardFreeModelAdmission({ ...ctx(), model: "phaseo/free" }, paid, "gateway"))?.status).toBe(503);
        const malformed = { rules: [{ pricing_plan: "free", price_per_unit: null }] } as unknown as PriceCard;
        expect((await guardFreeModelAdmission({ ...ctx(), model: "lab/model:free" }, malformed, "gateway"))?.status).toBe(503);
        expect(mocks.admit).not.toHaveBeenCalled();
    });
});
