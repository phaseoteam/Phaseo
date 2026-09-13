import { describe, expect, it } from "vitest";
import { requiresExplicitServiceTier } from "./service-tiers";
import type { PriceCard } from "./types";

describe("dedicated service tier classification", () => {
    it.each([
        [["priority"], true], [["flex"], true], [["batch"], true], [["priority", "flex"], true],
        [["standard", "priority"], false], [["on-demand"], false], [["llm-plus"], false],
        [["free"], false], [[], false],
    ] as Array<[string[], boolean]>)("classifies %j", (plans, expected) => {
        const card = { rules: plans.map((pricing_plan) => ({ pricing_plan })) } as PriceCard;
        expect(requiresExplicitServiceTier(card)).toBe(expected);
    });
});
