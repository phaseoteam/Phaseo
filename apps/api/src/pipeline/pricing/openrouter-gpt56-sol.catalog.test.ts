import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

// Rules copied from the openrouter/openai-gpt-5.6-sol text.generate price card.
const contextRule = (meter: string, price: number, op: "lte" | "gt") => {
	const condition = { path: "input_tokens", op, or_group: 1, and_index: 1, value: 272000 };
	return {
		meter,
		unit: "token",
		unit_size: 1000000,
		price_per_unit: price,
		currency: "USD",
		pricing_plan: "standard",
		match: [condition],
		priority: 100,
		region: null,
		cache_duration_seconds: null,
		conditions: [condition],
	};
};

const canonicalCard = {
	key: "openrouter:openai/gpt-5.6-sol:text.generate",
	api_provider_id: "openrouter",
	capability_id: "text.generate",
	rules: [
		contextRule("cached_read_text_tokens", 0.5, "lte"),
		contextRule("cached_write_text_tokens", 6.25, "lte"),
		contextRule("input_text_tokens", 5, "lte"),
		contextRule("output_text_tokens", 30, "lte"),
		contextRule("cached_read_text_tokens", 1, "gt"),
		contextRule("cached_write_text_tokens", 12.5, "gt"),
		contextRule("input_text_tokens", 10, "gt"),
		contextRule("output_text_tokens", 45, "gt"),
	],
} as unknown as PriceCard;

describe("OpenRouter GPT-5.6 Sol catalogue billing", () => {
	it.each([
		["canonical slug", canonicalCard, 272_000, "4.360000000", "5.000000000", "30.000000000"],
		["canonical slug", canonicalCard, 272_001, "7.220010000", "10.000000000", "45.000000000"],
	])(
		"uses only the matching context tier for the %s at %i input tokens",
		(_label, card, inputTokens, total, inputRate, outputRate) => {
			const result = computeBillSummary(
				{
					input_tokens: inputTokens,
					input_text_tokens: inputTokens,
					output_tokens: 100_000,
					output_text_tokens: 100_000,
				},
				card,
				{},
				"standard",
			);

			expect(result.cost_usd_str).toBe(total);
			expect(result.lines.find((line) => line.dimension === "input_text_tokens")?.unit_price_usd).toBe(inputRate);
			expect(result.lines.find((line) => line.dimension === "output_text_tokens")?.unit_price_usd).toBe(outputRate);
		},
	);
});
