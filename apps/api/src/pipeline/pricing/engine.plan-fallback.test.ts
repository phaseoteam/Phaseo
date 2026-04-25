import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

const makeCard = (rules: PriceCard["rules"]): PriceCard => ({
	provider: "openai",
	model: "openai/gpt-5.5",
	endpoint: "text.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules,
});

describe("pricing engine non-standard plan fallback", () => {
	it("falls back to standard when requested plan is missing for a meter", () => {
		const card = makeCard([
			{
				id: "standard-input",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "2",
				currency: "USD",
				match: [],
				priority: 100,
			},
			{
				id: "standard-output",
				pricing_plan: "standard",
				meter: "output_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "10",
				currency: "USD",
				match: [],
				priority: 100,
			},
		]);

		const result = computeBillSummary(
			{ input_text_tokens: 100_000, output_text_tokens: 10_000 },
			card,
			{},
			"priority",
		);

		expect(result.lines).toHaveLength(2);
		expect(result.cost_usd_str).toBe("0.300000000");
		expect(result.lines.find((line) => line.dimension === "input_text_tokens")?.rule_id).toBe("standard-input");
		expect(result.lines.find((line) => line.dimension === "output_text_tokens")?.rule_id).toBe("standard-output");
	});

	it("falls back to standard for long-context holes in non-standard plans", () => {
		const card = makeCard([
			{
				id: "priority-input-lt-272k",
				pricing_plan: "priority",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "12.5",
				currency: "USD",
				match: [{ path: "input_tokens", op: "lt", value: 272000, or_group: 1, and_index: 1 }],
				priority: 100,
			},
			{
				id: "priority-output-lt-272k",
				pricing_plan: "priority",
				meter: "output_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "75",
				currency: "USD",
				match: [{ path: "input_tokens", op: "lt", value: 272000, or_group: 1, and_index: 1 }],
				priority: 100,
			},
			{
				id: "standard-input-gte-272k",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "15",
				currency: "USD",
				match: [{ path: "input_tokens", op: "gte", value: 272000, or_group: 1, and_index: 1 }],
				priority: 100,
			},
			{
				id: "standard-output-gte-272k",
				pricing_plan: "standard",
				meter: "output_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "120",
				currency: "USD",
				match: [{ path: "input_tokens", op: "gte", value: 272000, or_group: 1, and_index: 1 }],
				priority: 100,
			},
		]);

		const result = computeBillSummary(
			{
				input_tokens: 300_000,
				input_text_tokens: 300_000,
				output_text_tokens: 45_000,
			},
			card,
			{},
			"priority",
		);

		expect(result.lines).toHaveLength(2);
		expect(result.cost_usd_str).toBe("9.900000000");
		expect(result.lines.find((line) => line.dimension === "input_text_tokens")?.rule_id).toBe("standard-input-gte-272k");
		expect(result.lines.find((line) => line.dimension === "output_text_tokens")?.rule_id).toBe("standard-output-gte-272k");
	});
});

