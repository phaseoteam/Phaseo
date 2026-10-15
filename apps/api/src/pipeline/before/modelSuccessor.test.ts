import { describe, expect, it } from "vitest";
import {
    modelSubstitutionHeader,
    parseModelSuccessorResolution,
    parseSuccessorRedirectPolicy,
    successorPriceAllowed,
    successorRedirectTarget,
    type ModelSuccessorResolution,
    type SuccessorRedirectPolicy,
} from "./modelSuccessor";

const eligible: ModelSuccessorResolution = {
    model: "lab/old",
    replacementModel: "lab/new",
    unservedSince: "2026-10-01T00:00:00Z",
    target: "lab/new",
    chain: ["lab/new"],
    reason: "eligible",
    priceRatio: 1,
    priceComparable: true,
};
const on: SuccessorRedirectPolicy = { enabled: true, pricePolicy: "never", maxPriceIncreasePercent: 0 };

describe("model successor redirect", () => {
    it("parses the database resolution", () => {
        expect(parseModelSuccessorResolution({
            model: "lab/old", replacement_model: "lab/mid", unserved_since: "2026-10-01T00:00:00+00:00", target: "lab/new",
            chain: ["lab/mid", "lab/new", 3], reason: "eligible", price_ratio: "1.25", price_comparable: true,
        })).toEqual({
            model: "lab/old", replacementModel: "lab/mid", unservedSince: "2026-10-01T00:00:00+00:00", target: "lab/new",
            chain: ["lab/mid", "lab/new"], reason: "eligible", priceRatio: 1.25, priceComparable: true,
        });
        expect(parseModelSuccessorResolution(null)).toBeNull();
        expect(parseModelSuccessorResolution({ target: "lab/new" })).toBeNull();
    });

    it("reads workspace settings and stays off by default", () => {
        expect(parseSuccessorRedirectPolicy(null)).toEqual({ enabled: false, pricePolicy: "never", maxPriceIncreasePercent: 0 });
        expect(parseSuccessorRedirectPolicy({
            model_successor_redirect_enabled: true, model_successor_price_policy: "limit", model_successor_max_price_increase_percent: 25,
        })).toEqual({ enabled: true, pricePolicy: "limit", maxPriceIncreasePercent: 25 });
        expect(parseSuccessorRedirectPolicy({ model_successor_redirect_enabled: "true", model_successor_price_policy: "other" }))
            .toEqual({ enabled: false, pricePolicy: "never", maxPriceIncreasePercent: 0 });
    });

    it.each([
        ["never", 0, 1, true],
        ["never", 0, 0.5, true],
        ["never", 0, 1.01, false],
        ["limit", 25, 1.25, true],
        ["limit", 25, 1.26, false],
        ["any", 0, 9, true],
    ] as const)("applies the %s price policy (limit %s%%) to ratio %s", (pricePolicy, percent, ratio, allowed) => {
        expect(successorPriceAllowed({ ...eligible, priceRatio: ratio }, { enabled: true, pricePolicy, maxPriceIncreasePercent: percent }))
            .toBe(allowed);
    });

    it("only allows an unknown price under the any policy", () => {
        const unknown = { ...eligible, priceRatio: null, priceComparable: false };
        expect(successorPriceAllowed(unknown, { ...on, pricePolicy: "limit", maxPriceIncreasePercent: 1000 })).toBe(false);
        expect(successorPriceAllowed(unknown, { ...on, pricePolicy: "any" })).toBe(true);
    });

    it("redirects only eligible models for workspaces that turned it on", () => {
        expect(successorRedirectTarget(eligible, on)).toEqual({
            from: "lab/old", to: "lab/new", reason: "unserved", chain: ["lab/new"], unservedSince: "2026-10-01T00:00:00Z", priceRatio: 1,
        });
        expect(successorRedirectTarget(eligible, { ...on, enabled: false })).toBeNull();
        expect(successorRedirectTarget({ ...eligible, reason: "free_to_paid", target: null }, on)).toBeNull();
        expect(successorRedirectTarget({ ...eligible, reason: "within_grace_period" }, on)).toBeNull();
        expect(successorRedirectTarget(null, on)).toBeNull();
    });

    it("describes the substitution in one header", () => {
        expect(modelSubstitutionHeader(successorRedirectTarget(eligible, on)!)).toBe("reason=unserved; from=lab/old; to=lab/new");
    });
});
