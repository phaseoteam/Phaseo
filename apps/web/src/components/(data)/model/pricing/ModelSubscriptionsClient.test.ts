import {
	dedupeSubscriptionPlanPrices,
	sortSubscriptionPlanPricesForDisplay,
	getStartingPriceText,
	type SubscriptionPrice,
} from "./ModelSubscriptionsClient";

describe("subscription price normalization", () => {
	const prices: SubscriptionPrice[] = [
		{ frequency: "month", currency: "usd", price: 20 },
		{ frequency: "monthly", currency: " USD ", price: 20 },
		{ frequency: "yearly", currency: "USD", price: 20 },
		{ frequency: "monthly", currency: "EUR", price: 20 },
		{ frequency: "monthly", currency: "USD", price: 21 },
	];

	test("deduplicates normalized matches while retaining every distinct key", () => {
		expect(dedupeSubscriptionPlanPrices(prices)).toEqual([
			prices[1],
			prices[2],
			prices[3],
			prices[4],
		]);
	});

	test("preserves deterministic display ordering after deduplication", () => {
		expect(sortSubscriptionPlanPricesForDisplay(prices)).toEqual([
			prices[1],
			prices[4],
			prices[2],
			prices[3],
		]);
	});
	test("keeps unknown offers visible but excludes them from starting price ranking", () => {
		const unknown: SubscriptionPrice = { frequency: "monthly", currency: "USD", price: null, components: [{ component_key: "base", amount: null, pricing_type: "unknown", charge_basis: "account" }] };
		const known: SubscriptionPrice = { frequency: "monthly", currency: "USD", price: 20 };
		expect(sortSubscriptionPlanPricesForDisplay([unknown, known])).toEqual([known, unknown]);
		const labels = { other: "Other", monthly: "monthly", quarterly: "quarterly", yearly: "yearly", weekly: "weekly", daily: "daily", usageBased: "Usage", customPricing: "Custom" };
		const plan = { prices: [unknown, known] } as Parameters<typeof getStartingPriceText>[0][number];
		expect(getStartingPriceText([plan], (value) => `$${value}`, labels)).toBe("$20 monthly");
		expect(getStartingPriceText([{ ...plan, prices: [unknown] }], (value) => `$${value}`, labels)).toBeNull();
	});
});
