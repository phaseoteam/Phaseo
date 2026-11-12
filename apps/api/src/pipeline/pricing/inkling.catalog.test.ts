import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

// Rules copied from the thinking-machines/thinkingmachines-inkling text.generate price card.
const rule = (meter: string, price: number, plan: string, priority: number) => ({
	meter,
	unit: "token",
	unit_size: 1000000,
	price_per_unit: price,
	currency: "USD",
	pricing_plan: plan,
	match: [],
	priority,
	effective_from: "2026-08-24T00:00:00Z",
	region: null,
	cache_duration_seconds: null,
	conditions: [],
});

const inklingCard = {
	key: "thinking-machines:thinkingmachines/inkling:text.generate",
	api_provider_id: "thinking-machines",
	capability_id: "text.generate",
	rules: [
		// Undiscounted list rates kept as fallback for the limited-time 50% promotion.
		rule("input_text_tokens", 7.48, "256k", 100),
		rule("cached_read_text_tokens", 1.496, "256k", 100),
		rule("output_text_tokens", 18.72, "256k", 100),
		rule("input_text_tokens", 3.74, "64k", 100),
		rule("cached_read_text_tokens", 0.748, "64k", 100),
		rule("output_text_tokens", 9.36, "64k", 100),
		// Promotional rates.
		rule("input_text_tokens", 1.87, "64k", 200),
		rule("cached_read_text_tokens", 0.374, "64k", 200),
		rule("output_text_tokens", 4.68, "64k", 200),
		rule("input_text_tokens", 3.74, "256k", 200),
		rule("cached_read_text_tokens", 0.748, "256k", 200),
		rule("output_text_tokens", 9.36, "256k", 200),
		rule("input_text_tokens", 1, "serverless-beta", 200),
		rule("cached_read_text_tokens", 0.17, "serverless-beta", 200),
		rule("output_text_tokens", 4.05, "serverless-beta", 200),
	],
} as unknown as PriceCard;

describe("Thinking Machines Inkling promotional billing", () => {
	it.each([
		["256K", inklingCard, "13.848000000"],
	])("selects the active %s promotional rules", (_label, card, expectedCost) => {
		const result = computeBillSummary(
			{
				input_text_tokens: 1_000_000,
				cached_read_text_tokens: 1_000_000,
				output_text_tokens: 1_000_000,
			},
			card,
			{},
			"256k",
		);

		expect(result.cost_usd_str).toBe(expectedCost);
		expect(result.lines).toHaveLength(3);
		expect(result.lines.every((line) => line.rule_priority === 200)).toBe(true);
	});
});
