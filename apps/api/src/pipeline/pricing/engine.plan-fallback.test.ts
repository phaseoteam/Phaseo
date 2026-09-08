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
    it("rejects a missing standard plan instead of reporting zero for paid usage", () => {
        const card = makeCard([{ pricing_plan: "priority", meter: "input_text_tokens", unit: "token",
            unit_size: 1_000_000, price_per_unit: "2", currency: "USD", match: [], priority: 100 }]);
        expect(() => computeBillSummary({ input_text_tokens: 1000 }, card)).toThrow("pricing_plan_missing:standard");
        expect(computeBillSummary({ input_text_tokens: 1000 }, card, {}, "priority").cost_usd_str).toBe("0.002000000");
    });

    it("preserves explicitly free cards", () => {
        const card = makeCard([{ pricing_plan: "free", meter: "input_text_tokens", unit: "token",
            unit_size: 1_000_000, price_per_unit: "0", currency: "USD", match: [], priority: 100 }]);
        expect(computeBillSummary({ input_text_tokens: 1000 }, card).cost_usd_str).toBe("0.000000000");
    });

	it("keeps matching standard-meter fallback for batch pricing", () => {
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
			"batch",
		);

		expect(result.lines).toHaveLength(2);
		expect(result.cost_usd_str).toBe("0.300000000");
		expect(result.lines.find((line) => line.dimension === "input_text_tokens")?.rule_id).toBe("standard-input");
		expect(result.lines.find((line) => line.dimension === "output_text_tokens")?.rule_id).toBe("standard-output");
	});

	it("bills condition holes at the highest applicable configured rate", () => {
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

		expect(result.lines.map((line) => line.rule_id)).toEqual([
			"standard-input-gte-272k",
			"standard-output-gte-272k",
		]);
		expect(result.cost_usd_str).toBe("9.900000000");
	});

	it("leaves batch coverage holes unpriced so settlement retains the hold", () => {
		const card = makeCard([
			{
				id: "batch-high-quality-image",
				pricing_plan: "batch",
				meter: "output_image",
				unit: "image",
				unit_size: 1,
				price_per_unit: "0.25",
				currency: "USD",
				match: [{ path: "image_params.quality", op: "eq", value: "high" }],
				priority: 100,
			},
		]);

		const result = computeBillSummary(
			{ output_image: 1 },
			card,
			{ image_params: { quality: "low" } },
			"batch",
		);

		expect(result.lines).toHaveLength(0);
		expect(result.cost_usd_str).toBe("0.000000000");
	});
});
