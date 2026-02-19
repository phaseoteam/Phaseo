import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

const card: PriceCard = {
	provider: "anthropic",
	model: "anthropic/claude-sonnet-4.6",
	endpoint: "text.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			pricing_plan: "standard",
			meter: "input_text_tokens",
			unit: "token",
			unit_size: 1,
			price_per_unit: "0.000001",
			currency: "USD",
			match: [],
			priority: 100,
		},
		{
			pricing_plan: "standard",
			meter: "input_text_tokens",
			unit: "token",
			unit_size: 1,
			price_per_unit: "0.000002",
			currency: "USD",
			match: [{ path: "long_context_input_tokens", op: "gt", value: 200000, or_group: 1 }],
			priority: 100,
		},
		{
			pricing_plan: "standard",
			meter: "output_text_tokens",
			unit: "token",
			unit_size: 1,
			price_per_unit: "0.000003",
			currency: "USD",
			match: [],
			priority: 100,
		},
		{
			pricing_plan: "standard",
			meter: "output_text_tokens",
			unit: "token",
			unit_size: 1,
			price_per_unit: "0.000004",
			currency: "USD",
			match: [{ path: "long_context_input_tokens", op: "gt", value: 200000, or_group: 1 }],
			priority: 100,
		},
		{
			pricing_plan: "standard",
			meter: "cached_read_text_tokens",
			unit: "token",
			unit_size: 1,
			price_per_unit: "0.0000001",
			currency: "USD",
			match: [],
			priority: 100,
		},
		{
			pricing_plan: "standard",
			meter: "cached_read_text_tokens",
			unit: "token",
			unit_size: 1,
			price_per_unit: "0.0000002",
			currency: "USD",
			match: [{ path: "long_context_input_tokens", op: "gt", value: 200000, or_group: 1 }],
			priority: 100,
		},
		{
			pricing_plan: "standard",
			meter: "cached_write_text_tokens",
			unit: "token",
			unit_size: 1,
			price_per_unit: "0.00000125",
			currency: "USD",
			match: [{ path: "cache_ttl", op: "eq", value: "5m", or_group: 1 }],
			priority: 100,
		},
		{
			pricing_plan: "standard",
			meter: "cached_write_text_tokens",
			unit: "token",
			unit_size: 1,
			price_per_unit: "0.0000025",
			currency: "USD",
			match: [
				{ path: "cache_ttl", op: "eq", value: "5m", or_group: 1, and_index: 1 },
				{ path: "long_context_input_tokens", op: "gt", value: 200000, or_group: 1, and_index: 2 },
			],
			priority: 100,
		},
	],
};

describe("computeBillSummary long context thresholds", () => {
	it("uses cache-aware threshold to select long-context rates", () => {
		const result = computeBillSummary(
			{
				input_text_tokens: 150000,
				cached_read_text_tokens: 30000,
				cached_write_text_tokens: 30000,
				output_text_tokens: 10,
				cache_ttl: "5m",
			},
			card,
			{ cache_ttl: "5m" },
			"standard"
		);

		const byDim = new Map(result.lines.map((line) => [line.dimension, line]));
		expect(byDim.get("input_text_tokens")?.unit_price_usd).toBe("0.000002000");
		expect(byDim.get("output_text_tokens")?.unit_price_usd).toBe("0.000004000");
		expect(byDim.get("cached_read_text_tokens")?.unit_price_usd).toBe("0.000000200");
		expect(byDim.get("cached_write_text_tokens")?.unit_price_usd).toBe("0.000002500");
	});
});
