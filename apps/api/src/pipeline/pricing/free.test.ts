import { describe, expect, it } from "vitest";
import { isFreePriceCard } from "./free";

function card(rules: Array<{
	pricingPlan: string;
	pricePerUnit: string;
}>) {
	return {
		provider: "test-provider",
		model: "publisher/model:free",
		endpoint: "responses",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: rules.map((rule) => ({
			pricing_plan: rule.pricingPlan,
			meter: "input_tokens",
			unit: "token",
			unit_size: 1,
			price_per_unit: rule.pricePerUnit,
			currency: "USD",
			match: [],
			priority: 100,
		})),
	} as any;
}

describe("isFreePriceCard", () => {
	it("accepts a non-empty card whose rules are explicitly free and zero", () => {
		expect(
			isFreePriceCard(card([
				{ pricingPlan: "free", pricePerUnit: "0" },
				{ pricingPlan: "FREE", pricePerUnit: "0.000000" },
			])),
		).toBe(true);
	});

	it("rejects missing and empty pricing cards", () => {
		expect(isFreePriceCard(null)).toBe(false);
		expect(isFreePriceCard(card([]))).toBe(false);
	});

	it("rejects a free-labelled card containing a positive price", () => {
		expect(
			isFreePriceCard(card([
				{ pricingPlan: "free", pricePerUnit: "0" },
				{ pricingPlan: "free", pricePerUnit: "0.000001" },
			])),
		).toBe(false);
	});

	it("rejects negative prices instead of treating them as free", () => {
		expect(
			isFreePriceCard(card([
				{ pricingPlan: "free", pricePerUnit: "-0.000001" },
			])),
		).toBe(false);
	});

	// The v2 catalogue derives pricing_plan from the SKU's service tier, and
	// "free" stopped being a canonical tier in August 2026, so $0 free routes
	// are also written on the standard tier. Price, not the label, decides.
	it("accepts a zero-priced card labelled with the standard plan", () => {
		expect(
			isFreePriceCard(card([
				{ pricingPlan: "standard", pricePerUnit: "0" },
				{ pricingPlan: "standard", pricePerUnit: "0.000000000" },
			])),
		).toBe(true);
	});

	it("rejects a zero-priced card whose time window charges", () => {
		const peakPriced = card([{ pricingPlan: "standard", pricePerUnit: "0" }]);
		peakPriced.rules[0].time_windows = [{
			label: "peak",
			timezone: "UTC",
			start_time: "09:00",
			end_time: "17:00",
			price_per_unit: "0.000001",
		}];
		expect(isFreePriceCard(peakPriced)).toBe(false);

		peakPriced.rules[0].time_windows[0].price_per_unit = null;
		expect(isFreePriceCard(peakPriced)).toBe(true);
	});

	it("rejects a card that mixes a free plan with a paid one", () => {
		expect(
			isFreePriceCard(card([
				{ pricingPlan: "free", pricePerUnit: "0" },
				{ pricingPlan: "standard", pricePerUnit: "0.000002" },
			])),
		).toBe(false);
	});

	it("rejects a workspace private model's placeholder $0 card", () => {
		expect(
			isFreePriceCard({
				...card([{ pricingPlan: "standard", pricePerUnit: "0" }]),
				provider: "private-model",
			}),
		).toBe(false);
	});
});
