import { describe, expect, it } from "vitest";
import { computeBill } from "./engine";
import { calculatePricing } from "../after/pricing";
import type { PriceCard } from "./types";

function textCard(price: string, plan = "standard"): PriceCard {
	return {
		provider: "google-ai-studio",
		model: "google/gemma-4-31b",
		endpoint: "text.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: [
			{ pricing_plan: plan, meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD", match: [], priority: 100 },
			{ pricing_plan: plan, meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD", match: [], priority: 100 },
		],
	};
}

describe("Phaseo-managed web search and fetch pricing", () => {
	it("bills the gateway's own searches and fetches on a card with no rows for them", () => {
		const priced = computeBill(
			{
				input_text_tokens: 1_000,
				output_text_tokens: 100,
				server_tool_web_search_requests: 2,
				server_tool_web_search_extra_results: 3,
				server_tool_web_fetch_requests: 1,
			},
			textCard("1"),
			{},
			"standard",
		);

		const lines = Object.fromEntries(priced.pricing.lines.map((line: any) => [line.dimension, line.line_nanos]));
		// 2 searches at $0.007, 3 extra results at $0.001, 1 fetch at $0.001.
		expect(lines.server_tool_web_search_requests).toBe(14_000_000);
		expect(lines.server_tool_web_search_extra_results).toBe(3_000_000);
		expect(lines.server_tool_web_fetch_requests).toBe(1_000_000);
		// Tokens: 1,100 at $1 per million.
		expect(priced.pricing.total_nanos).toBe(18_000_000 + 1_100_000);
	});

	it("bills managed searches on a free model's card too", () => {
		const priced = calculatePricing(
			{ input_tokens: 500, output_tokens: 50, server_tool_web_search_requests: 1 },
			textCard("0", "free"),
			{ model: "google/gemma-4-31b:free" },
		);

		expect(priced.totalNanos).toBe(7_000_000);
	});

	it("keeps a card's own row for a managed meter ahead of the default", () => {
		const card = textCard("1");
		card.rules.push({
			pricing_plan: "standard",
			meter: "server_tool_web_search_requests",
			unit: "request",
			unit_size: 1,
			price_per_unit: "0.02",
			currency: "USD",
			match: [],
			priority: 100,
		});
		const priced = computeBill({ server_tool_web_search_requests: 1 }, card, {}, "standard");

		expect(priced.pricing.total_nanos).toBe(20_000_000);
	});
});
