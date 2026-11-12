import { describe, expect, it } from "vitest";
import { canonicalPricingPlan, normalizePriceCardPlans, requiresExplicitServiceTier, resolveBasePricingPlan } from "./service-tiers";
import type { PriceCard } from "./types";

const cardWith = (plans: string[]) => ({ rules: plans.map((pricing_plan) => ({ pricing_plan })) } as PriceCard);

describe("dedicated service tier classification", () => {
    it.each([
        [["priority"], true], [["ultrafast"], true], [["flex"], true], [["batch"], true], [["priority", "flex"], true],
        [["fast"], true],
        [["standard", "priority"], false], [["on-demand"], false], [["llm-plus"], false],
        [["free"], false], [[], false],
    ] as Array<[string[], boolean]>)("classifies %j", (plans, expected) => {
        expect(requiresExplicitServiceTier(cardWith(plans))).toBe(expected);
    });
});

describe("pricing plan names", () => {
    it("prices the stored fast tier as priority", () => {
        expect(canonicalPricingPlan("fast")).toBe("priority");
        expect(canonicalPricingPlan(" Fast ")).toBe("priority");
        expect(canonicalPricingPlan("priority")).toBe("priority");
        expect(canonicalPricingPlan(null)).toBe("standard");
        expect(canonicalPricingPlan("early_access")).toBe("early_access");
    });

    it("normalises a card only when a plan name changes", () => {
        const canonical = cardWith(["standard", "priority"]);
        expect(normalizePriceCardPlans(canonical)).toBe(canonical);
        const stored = cardWith(["standard", "fast"]);
        expect(normalizePriceCardPlans(stored).rules.map((rule) => rule.pricing_plan)).toEqual(["standard", "priority"]);
        expect(stored.rules[1]!.pricing_plan).toBe("fast");
    });

    it.each([
        [["standard", "priority"], "standard"],
        [["default"], "default"],
        [["early_access"], "early_access"],
        [["early_access", "priority"], "early_access"],
        [["free"], "free"],
        [["priority"], null],
        [["fast"], null],
        // Several provider labels and no standard: nothing ties one to the route, so none is guessed.
        [["64k", "256k"], null],
        [["upstream-1", "upstream-2", "priority"], null],
        [["default", "default"], "default"],
        [[], "standard"],
    ] as Array<[string[], string | null]>)("takes %j as the base plan %s", (plans, expected) => {
        expect(resolveBasePricingPlan(cardWith(plans))).toBe(expected);
    });
});
