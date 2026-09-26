import { describe, expect, it } from "vitest";
import { decideFreeQuota, FREE_MODEL_OVERAGE_NANOS, freeQuotaSettings, initialFreeQuota } from "./free-model-quota";

describe("owner free-model quota", () => {
    it("defaults to no paid overage", () => {
        const state = { ...initialFreeQuota(0), used: 1500 };
        expect(decideFreeQuota(state, 100).decision).toEqual({ allowed: false, reason: "daily_limit", retryAfterSeconds: 86400 });
    });
    it("allows precisely 1,500 included admissions per UTC day", () => {
        let state = initialFreeQuota(0);
        for (let i = 0; i < 1500; i++) {
            const result = decideFreeQuota(state, i * 2400);
            expect(result.decision).toMatchObject({ allowed: true, mode: "included", feeNanos: 0, remaining: 1499 - i });
            state = result.next!;
        }
        expect(decideFreeQuota(state, 1500 * 2400)).toMatchObject({ decision: { allowed: false, reason: "daily_limit" } });
        expect(decideFreeQuota(state, 86_400_000).decision).toMatchObject({ allowed: true, remaining: 1499 });
    });
    it("enforces a global 25-token burst with 25/minute refill", () => {
        let state = initialFreeQuota(1000);
        for (let i = 0; i < 25; i++) state = decideFreeQuota(state, 1000).next!;
        expect(decideFreeQuota(state, 1000)).toEqual({ decision: { allowed: false, reason: "rpm_limit", retryAfterSeconds: 3 } });
        expect(decideFreeQuota(state, 3399).decision.allowed).toBe(false);
        expect(decideFreeQuota(state, 3400).decision.allowed).toBe(true);
    });
    it("denials do not write state; overage remains constant-sized", () => {
        const state = { ...initialFreeQuota(0), used: 1500, allowOverage: true, policyVersion: 7 };
        const result = decideFreeQuota(state, 100);
        expect(result.decision).toMatchObject({ mode: "overage", feeNanos: FREE_MODEL_OVERAGE_NANOS, policyVersion: 7 });
        expect(result.next?.used).toBe(1500);
        expect(state.tokens).toBe(25);
    });
    it("does not reset backwards or reset policy at midnight", () => {
        const state = { ...initialFreeQuota(86_400_000), used: 1500, tokens: 0, allowOverage: true };
        expect(decideFreeQuota(state, 0).decision.allowed).toBe(false);
        expect(freeQuotaSettings(state, 2 * 86_400_000)).toMatchObject({ requestsUsedToday: 0, allowOverage: true });
    });
});
