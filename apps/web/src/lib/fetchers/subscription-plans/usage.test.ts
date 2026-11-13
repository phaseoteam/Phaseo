import { describe, expect, it } from "vitest";
import { apiMultiple, bestPlanPerModel, perMillionFractionDigits, summarizeUsage, type SubscriptionPlanUsage } from "./usage";

const row = (overrides: Partial<SubscriptionPlanUsage>): SubscriptionPlanUsage => ({
	model_slug: "lab/model", model_name: "Model", scenario: "standard", monthly_price_usd: 200, monthly_tokens: 1e9,
	effective_usd_per_mtok: 0.2, api_equivalent_usd_per_mtok: 4, share_of_api_price: 0.05, workload: "measured", basis: "measured",
	confidence: "high", source_name: "real-api-pricing", source_url: null, measured_on: null, promo_until: null, ...overrides,
});

describe("subscription usage summaries", () => {
	it("prefers standard scenarios for the headline numbers", () => {
		const summary = summarizeUsage([
			row({ model_slug: "a", monthly_tokens: 2e9, effective_usd_per_mtok: 0.1 }),
			row({ model_slug: "b", monthly_tokens: 5e9, effective_usd_per_mtok: 0.04 }),
			row({ model_slug: "c", scenario: "off_peak", monthly_tokens: 9e9, effective_usd_per_mtok: 0.01 }),
		]);
		expect(summary?.mostTokens.model_slug).toBe("b");
		expect(summary?.cheapest?.model_slug).toBe("b");
	});

	it("falls back to other scenarios when a plan has no standard measurement", () => {
		expect(summarizeUsage([row({ scenario: "fast", monthly_tokens: 3e9 })])?.mostTokens.monthly_tokens).toBe(3e9);
		expect(summarizeUsage([])).toBeNull();
	});

	it("turns the share of API price into a multiple", () => {
		expect(apiMultiple({ share_of_api_price: 0.016 })).toBeCloseTo(62.5);
		expect(apiMultiple({ share_of_api_price: null })).toBeNull();
		expect(apiMultiple({ share_of_api_price: 0 })).toBeNull();
	});

	it("picks the cheapest plan per model, biggest saving first, models without an API price last", () => {
		const plans = [
			{ plan_id: "pro", usage: [row({ model_slug: "x", effective_usd_per_mtok: 0.5, share_of_api_price: 0.1 }), row({ model_slug: "new", effective_usd_per_mtok: 0.3, share_of_api_price: null })] },
			{ plan_id: "max", usage: [row({ model_slug: "x", effective_usd_per_mtok: 0.2, share_of_api_price: 0.04 }), row({ model_slug: "y", effective_usd_per_mtok: 0.4, share_of_api_price: 0.08 })] },
		];
		expect(bestPlanPerModel(plans).map(({ plan, usage }) => `${usage.model_slug}@${plan.plan_id}`)).toEqual(["x@max", "y@max", "new@pro"]);
	});

	it("keeps two significant digits below $1", () => {
		const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", ...perMillionFractionDigits(value) }).format(value);
		expect([money(0.006349), money(0.13), money(2.5)]).toEqual(["$0.0063", "$0.13", "$2.50"]);
	});
});
