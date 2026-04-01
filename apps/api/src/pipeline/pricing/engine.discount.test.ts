import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

const makeCard = (rules: PriceCard["rules"]): PriceCard => ({
	provider: "openai",
	model: "openai/gpt-5.4-nano",
	endpoint: "text.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules,
});

describe("pricing engine discount priority behavior", () => {
	it("applies higher-priority discounted rule even without end date metadata", () => {
		const card = makeCard([
			{
				id: "base-input",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "0.2",
				currency: "USD",
				match: [],
				priority: 100,
			},
			{
				id: "discount-input",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "0.1",
				currency: "USD",
				match: [],
				priority: 110,
			},
		]);

		const result = computeBillSummary(
			{ input_text_tokens: 1_000_000 },
			card,
			{},
			"standard",
		);
		const line = result.lines.find((l) => l.dimension === "input_text_tokens");

		expect(line?.rule_id).toBe("discount-input");
		expect(line?.unit_price_usd).toBe("0.100000000");
		expect(line?.line_cost_usd).toBe("0.100000000");
		expect(result.cost_usd_str).toBe("0.100000000");
	});

	it("does not apply discount when base has higher priority", () => {
		const card = makeCard([
			{
				id: "base-input",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "0.2",
				currency: "USD",
				match: [],
				priority: 100,
			},
			{
				id: "discount-input",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "0.1",
				currency: "USD",
				match: [],
				priority: 90,
			},
		]);

		const result = computeBillSummary(
			{ input_text_tokens: 1_000_000 },
			card,
			{},
			"standard",
		);
		const line = result.lines.find((l) => l.dimension === "input_text_tokens");

		expect(line?.rule_id).toBe("base-input");
		expect(line?.unit_price_usd).toBe("0.200000000");
		expect(line?.line_cost_usd).toBe("0.200000000");
		expect(result.cost_usd_str).toBe("0.200000000");
	});
});

