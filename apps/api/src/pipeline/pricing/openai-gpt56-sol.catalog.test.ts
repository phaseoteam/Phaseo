import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

const DATA_ROOT = path.resolve(process.cwd(), "../../packages/data/catalog/src/data");

function loadCard(relativePath: string): PriceCard {
	return JSON.parse(fs.readFileSync(path.join(DATA_ROOT, relativePath), "utf8")) as PriceCard;
}

const canonicalCard = loadCard("pricing/openai/openai-gpt-5.6-sol/text.generate/pricing.json");
const proAliasCard = loadCard("pricing/openai/openai-gpt-5.6-sol-pro/text.generate/pricing.json");

describe("GPT-5.6 Sol catalogue billing", () => {
	it.each([
		["canonical slug", canonicalCard],
		["Pro compatibility alias", proAliasCard],
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

		expect(result.cost_usd_str).toBe("3.500000000");
		expect(result.lines.find((line) => line.dimension === "output_text_tokens")?.quantity).toBe(100_000);
		expect(result.lines.find((line) => line.dimension === "output_reasoning_tokens")).toBeUndefined();
	});

	it.each([
		["canonical slug", canonicalCard],
		["Pro compatibility alias", proAliasCard],
	])("applies the published high-context Priority rates for the %s", (_label, card) => {
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

		expect(result.cost_usd_str).toBe("15.000000000");
		expect(result.lines.find((line) => line.dimension === "input_text_tokens")?.unit_price_usd).toBe("20.000000000");
		expect(result.lines.find((line) => line.dimension === "output_text_tokens")?.unit_price_usd).toBe("90.000000000");
	});
});
