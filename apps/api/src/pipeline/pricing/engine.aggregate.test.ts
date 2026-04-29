import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

const aggregateCard: PriceCard = {
	provider: "gmicloud",
	model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
	endpoint: "text.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			id: "aggregate-input",
			pricing_plan: "standard",
			meter: "input_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: "0.1",
			currency: "USD",
			match: [],
			priority: 100,
		},
		{
			id: "aggregate-output",
			pricing_plan: "standard",
			meter: "output_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: "0.4",
			currency: "USD",
			match: [],
			priority: 100,
		},
	],
};

describe("pricing engine aggregate token meters", () => {
	it("bills aggregate input/output tokens without requiring split modality meters", () => {
		const result = computeBillSummary(
			{
				input_tokens: 281,
				input_text_tokens: 281,
				output_tokens: 8,
				output_text_tokens: 8,
				total_tokens: 289,
			},
			aggregateCard,
			{},
			"standard",
		);

		expect(result.lines).toHaveLength(2);
		expect(result.lines.find((line) => line.dimension === "input_tokens")?.rule_id).toBe("aggregate-input");
		expect(result.lines.find((line) => line.dimension === "output_tokens")?.rule_id).toBe("aggregate-output");
		expect(result.lines.find((line) => line.dimension === "input_text_tokens")).toBeUndefined();
		expect(result.lines.find((line) => line.dimension === "output_text_tokens")).toBeUndefined();
		expect(result.cost_usd_str).toBe("0.000031300");
	});
});
