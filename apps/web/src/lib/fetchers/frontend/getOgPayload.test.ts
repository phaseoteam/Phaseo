import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import type { PricingRule, ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { buildModelOgStats } from "@/lib/fetchers/frontend/getOgPayload";

function makeRule(
	providerId: string,
	overrides: Partial<PricingRule> = {},
): PricingRule {
	return {
		id: `${providerId}-${overrides.meter ?? "input"}-${overrides.priority ?? 100}`,
		model_key: `${providerId}:example/model:text.generate`,
		pricing_plan: "standard",
		meter: "input_text_tokens",
		unit: "token",
		unit_size: 1_000_000,
		price_per_unit: 1,
		currency: "USD",
		note: null,
		match: [],
		priority: 100,
		effective_from: "2020-01-01T00:00:00Z",
		effective_to: null,
		...overrides,
	};
}

function makeProvider(providerId: string, pricing_rules: PricingRule[]): ProviderPricing {
	return {
		provider: {
			api_provider_id: providerId,
			api_provider_name: providerId,
		},
		provider_models: [],
		pricing_rules,
	};
}

const model = {
	model_details: [{ detail_name: "input_context_length", detail_value: 128_000 }],
	release_date: null,
	announcement_date: null,
} as ModelOverviewPage;

test("uses the lowest current Standard list price and ignores Flex", () => {
	const stats = buildModelOgStats(model, [
		makeProvider("openai", [
			makeRule("openai", { price_per_unit: 0.3 }),
			makeRule("openai", {
				meter: "output_text_tokens",
				price_per_unit: 1.2,
			}),
			makeRule("openai", { pricing_plan: "flex", price_per_unit: 0.2, note: "Flex costs 50% of Standard" }),
			makeRule("openai", {
				pricing_plan: "flex",
				meter: "output_text_tokens",
				price_per_unit: 0.8,
			}),
		]),
	]);

	expect(stats).toEqual(expect.arrayContaining([
		{ label: "CONTEXT", value: "128K", helper: "tokens" },
		{ label: "INPUT", value: "$0.30", helper: "per 1M tokens" },
		{ label: "OUTPUT", value: "$1.20", helper: "per 1M tokens" },
	]));
});

test("uses the discounted price while preserving the Standard list price", () => {
	const stats = buildModelOgStats(model, [
		makeProvider("promo-provider", [
			makeRule("promo-provider", { price_per_unit: 1 }),
			makeRule("promo-provider", {
				price_per_unit: 0.5,
				priority: 200,
				note: "Limited-time 50% discount",
			}),
		]),
		makeProvider("other-provider", [
			makeRule("other-provider", { price_per_unit: 1.25 }),
		]),
	]);

	expect(stats).toEqual(expect.arrayContaining([
		{
			label: "INPUT",
			value: "$0.50",
			originalValue: "$1.00",
			helper: "per 1M tokens",
			promotion: "50% off",
		},
	]));
});

test("only uses primary token meters and derives the baseline priority", () => {
	const stats = buildModelOgStats(model, [
		makeProvider("priority-provider", [
			makeRule("priority-provider", { price_per_unit: 1, priority: 90 }),
			makeRule("priority-provider", {
				price_per_unit: 0.5,
				priority: 100,
				note: "Limited-time 50% discount",
			}),
			makeRule("priority-provider", {
				meter: "implicit_cached_input_text_tokens",
				price_per_unit: 0.01,
				priority: 90,
			}),
		]),
	]);

	expect(stats).toEqual(expect.arrayContaining([
		{
			label: "INPUT",
			value: "$0.50",
			originalValue: "$1.00",
			helper: "per 1M tokens",
			promotion: "50% off",
		},
	]));
});
