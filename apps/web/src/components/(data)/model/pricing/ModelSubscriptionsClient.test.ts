import { describe, test, expect } from "vitest";
import {
	dedupeSubscriptionPlanPrices,
	sortSubscriptionPlanPricesForDisplay,
	getStartingPriceText,
	resolveSubscriptionOrganisationName,
	sortSubscriptionGroups,
	type SubscriptionPlanGroup,
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
	test("does not deduplicate unknown prices with a free offer", () => {
		const unknown: SubscriptionPrice = { frequency: "monthly", currency: "USD", price: null };
		const free: SubscriptionPrice = { ...unknown, price: 0 };
		expect(dedupeSubscriptionPlanPrices([unknown, free])).toEqual([unknown, free]);
	});
});

describe("subscription organisation names", () => {
	test("keeps a real name that only differs from the id in case", () => {
		expect(resolveSubscriptionOrganisationName("OpenAI", "openai")).toBe("OpenAI");
	});

	test("generates a label when the name is missing or just the id", () => {
		expect(resolveSubscriptionOrganisationName("openai", "openai")).not.toBe("openai");
		expect(resolveSubscriptionOrganisationName(null, "openai")).toBeTruthy();
	});
});

describe("subscription plan groups", () => {
	const group = (organisationId: string, price: number) => ({
		organisationId, organisationName: organisationId, organisationColour: null,
		plans: [{ plan_id: `${organisationId}-plan`, name: "Plan", organisation_id: organisationId, organisation: null, prices: [{ frequency: "monthly", currency: "USD", price }] }],
	}) as unknown as SubscriptionPlanGroup;

	test("puts the model owner's plans first even when resellers are cheaper", () => {
		const sorted = sortSubscriptionGroups([group("cursor", 20), group("github", 10), group("anthropic", 100)], "anthropic", "Anthropic");
		expect(sorted.map((entry) => entry.organisationId)).toEqual(["anthropic", "github", "cursor"]);
	});
});
