import { describe, expect, it } from "vitest";
import { computeBill, computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

const card: PriceCard = {
	provider: "openai",
	model: "openai/gpt-image-1-mini",
	endpoint: "image.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			pricing_plan: "standard",
			meter: "input_text_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: "2.0",
			currency: "USD",
			match: [],
			priority: 100,
		},
	],
};

describe("pricing engine unit_size handling", () => {
	it("pro-rates partial units in computeBillSummary", () => {
		const result = computeBillSummary(
			{ input_text_tokens: 8 },
			card,
			{},
			"standard",
		);

		expect(result.lines).toHaveLength(1);
		expect(result.lines[0].billable_units).toBeCloseTo(0.000008, 12);
		expect(result.lines[0].line_nanos).toBe(16_000);
		expect(result.lines[0].line_cost_usd).toBe("0.000016000");
		expect(result.cost_usd_str).toBe("0.000016000");
		expect(result.cost_cents).toBe(1); // ceil from nanos in summary
	});

	it("preserves nanos totals in computeBill output", () => {
		const priced = computeBill(
			{ input_text_tokens: 8 },
			card,
			{},
			"standard",
		);

		expect(priced.pricing.total_nanos).toBe(16_000);
		expect(priced.pricing.total_usd_str).toBe("0.000016");
		expect(priced.pricing.total_cents).toBe(0); // floor at persistence/charge stage
		expect(priced.pricing.lines).toHaveLength(1);
		expect(priced.pricing.lines[0].line_nanos).toBe(16_000);
	});
});
