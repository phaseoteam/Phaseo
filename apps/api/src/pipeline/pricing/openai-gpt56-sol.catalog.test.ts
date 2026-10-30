import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard } from "./types";
import { gpt56LunaCard, gpt56SolCard, gpt56TerraCard } from "./__fixtures__/openai-gpt56-cards";

const canonicalCard = gpt56SolCard as unknown as PriceCard;
const terraCard = gpt56TerraCard as unknown as PriceCard;
const lunaCard = gpt56LunaCard as unknown as PriceCard;

describe("GPT-5.6 Sol catalogue billing", () => {
	it.each([
		["canonical slug", canonicalCard],
	])("bills reported reasoning tokens once for the %s", (_label, card) => {
		const result = computeBillSummary(
			{
				input_tokens: 100_000,
				input_text_tokens: 100_000,
				output_tokens: 100_000,
				output_text_tokens: 100_000,
				reasoning_tokens: 80_000,
			},
			card,
			{},
			"standard",
		);

		expect(result.cost_usd_str).toBe("2.400000000");
		expect(result.lines.find((line) => line.dimension === "output_text_tokens")?.quantity).toBe(100_000);
		expect(result.lines.find((line) => line.dimension === "output_reasoning_tokens")).toBeUndefined();
	});

	it.each([
		["Sol canonical slug", canonicalCard, "10.800000000", "16.000000000", "60.000000000"],
		["Terra canonical slug", terraCard, "6.000000000", "8.000000000", "36.000000000"],
		["Luna canonical slug", lunaCard, "0.600000000", "0.800000000", "3.600000000"],
	])("applies the published high-context Priority rates for the %s", (_label, card, total, inputRate, outputRate) => {
		const result = computeBillSummary(
			{
				input_tokens: 300_000,
				input_text_tokens: 300_000,
				output_tokens: 100_000,
				output_text_tokens: 100_000,
				reasoning_tokens: 80_000,
			},
			card,
			{},
			"priority",
		);

		expect(result.cost_usd_str).toBe(total);
		expect(result.lines.find((line) => line.dimension === "input_text_tokens")?.unit_price_usd).toBe(inputRate);
		expect(result.lines.find((line) => line.dimension === "output_text_tokens")?.unit_price_usd).toBe(outputRate);
	});

	it.each([
		[272_000, "6.176000000", "8.000000000", "40.000000000"],
		[272_001, "10.352016000", "16.000000000", "60.000000000"],
	])(
		"switches Priority pricing only above 272K input tokens (%i)",
		(inputTokens, total, inputRate, outputRate) => {
			const result = computeBillSummary(
				{
					input_tokens: inputTokens,
					input_text_tokens: inputTokens,
					output_tokens: 100_000,
					output_text_tokens: 100_000,
				},
				canonicalCard,
				{},
				"priority",
			);

			expect(result.cost_usd_str).toBe(total);
			expect(result.lines.find((line) => line.dimension === "input_text_tokens")?.unit_price_usd).toBe(inputRate);
			expect(result.lines.find((line) => line.dimension === "output_text_tokens")?.unit_price_usd).toBe(outputRate);
		},
	);
});
