import { describe, expect, it, vi } from "vitest";
import { fetchRelatedPlans, fetchSubscriptionCatalogue, fetchSubscriptionPlansForModels, mergeOrderedPlanLists, subscriptionPayload } from "./subscriptions";

describe("structured subscription payload", () => {
	it("preserves offer identity, composite charges, allowances and model access", () => {
		const row = { plan_uuid: "plan", plan_id: "team", offers: [{ offer_uuid: "offer", billing_interval: "month", billing_interval_count: 1,
			currency: "USD", minimum_seats: 2, components: [
				{ component_key: "base", pricing_type: "fixed", amount: 80, charge_basis: "account" },
				{ component_key: "seat", pricing_type: "fixed", amount: 40, charge_basis: "seat" },
			] }], allowances: [{ allowance_key: "points", quantity: 1000 }], models: [{ model_id: "model", access_mode: "conditional", mapping_status: "example", conditions: "Admin enabled" }] };
		const plan = subscriptionPayload(row, "model");
		expect(plan.prices).toMatchObject([{ offer_uuid: "offer", price: 80, minimum_seats: 2, components: row.offers[0].components }]);
		expect(plan.allowances).toEqual(row.allowances);
		expect(plan.model_info).toMatchObject({ access_mode: "conditional", mapping_status: "example", conditions: "Admin enabled" });
	});
	it.each(["custom", "usage_based", "unknown"])("keeps %s amounts unknown instead of treating them as free", (pricingType) => {
		const result = subscriptionPayload({ offers: [{ currency: "USD", components: [{ component_key: "base", pricing_type: pricingType, amount: null }] }] });
		expect(result.prices[0].price).toBeNull();
		expect(result.prices[0].pricing_type).toBe(pricingType);
	});
	it("keeps quarterly and annual offers distinct", () => {
		const plan = subscriptionPayload({ offers: [
			{ offer_uuid: "quarter", billing_interval: "month", billing_interval_count: 3, components: [] },
			{ offer_uuid: "year", billing_interval: "year", billing_interval_count: 1, components: [] },
		] });
		expect(plan.prices.map((price: { frequency: string }) => price.frequency)).toEqual(["quarterly", "yearly"]);
	});
});

describe("subscription plans for selected models", () => {
	const plan = (id: string) => ({ plan_uuid: id });

	it("keeps each model's catalogue order when the lists overlap", () => {
		// Catalogue order is a, b, c, d. One model has a, c, d; the other b, c.
		const merged = mergeOrderedPlanLists([[plan("a"), plan("c"), plan("d")], [plan("b"), plan("c")]]).map((row) => row.plan_uuid);
		expect(merged).toHaveLength(4);
		expect(merged.indexOf("a")).toBeLessThan(merged.indexOf("c"));
		expect(merged.indexOf("b")).toBeLessThan(merged.indexOf("c"));
		expect(merged.indexOf("c")).toBeLessThan(merged.indexOf("d"));
	});

	it("reads only the selected models' plans", async () => {
		const rpc = vi.fn(async (name: string, args: { p_model_slug: string | null }) => ({
			data: name !== "get_v2_subscription_catalogue" ? [] : args.p_model_slug === "one"
				? [{ plan_uuid: "shared", models: [] }, { plan_uuid: "only-one", models: [] }]
				: [{ plan_uuid: "shared", models: [] }],
			error: null,
		}));
		const plans = await fetchSubscriptionPlansForModels({ rpc } as never, ["one", "two"]);
		expect(rpc.mock.calls.filter(([name]) => name === "get_v2_subscription_catalogue").map(([, args]) => args.p_model_slug)).toEqual(["one", "two"]);
		expect(plans.map((row) => row.plan_uuid)).toEqual(["shared", "only-one"]);
	});
});

describe("subscription usage", () => {
	const catalogue = [{ plan_uuid: "max", plan_id: "max", offers: [] }, { plan_uuid: "pro", plan_id: "pro", offers: [] }];

	it("attaches each plan's measured usage with numbers as numbers", async () => {
		const rpc = vi.fn(async (name: string) => name === "get_v2_subscription_catalogue"
			? { data: catalogue, error: null }
			: { data: [{ plan_uuid: "max", model_slug: "lab/model", model_name: "Model", scenario: "standard", monthly_tokens: "31500000000", effective_usd_per_mtok: "0.006349", share_of_api_price: null }], error: null });
		const plans = await fetchSubscriptionCatalogue({ rpc } as never, "max");
		expect(rpc).toHaveBeenCalledWith("get_v2_subscription_model_usage", { p_model_slug: null, p_plan_id: "max" });
		expect(plans[0].usage).toMatchObject([{ model_slug: "lab/model", model_name: "Model", monthly_tokens: 31_500_000_000, effective_usd_per_mtok: 0.006349, share_of_api_price: null }]);
		expect(plans[1].usage).toEqual([]);
	});

	it("still returns plans when usage cannot be read", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const rpc = vi.fn(async (name: string) => name === "get_v2_subscription_catalogue"
			? { data: catalogue, error: null }
			: { data: null, error: { message: "function does not exist" } });
		const plans = await fetchSubscriptionCatalogue({ rpc } as never);
		expect(plans.map((plan) => plan.usage)).toEqual([[], []]);
		warn.mockRestore();
	});
});

describe("related plans", () => {
	it("returns the lab's plans cheapest first with their standard usage", async () => {
		const query = { select: () => query, eq: () => query, lte: () => query, or: async () => ({ data: [
			{ plan_uuid: "ultra", plan_id: "ultra", name: "Ultra", price: 200, currency: "USD", frequency: "monthly" },
			{ plan_uuid: "pro", plan_id: "pro", name: "Pro", price: 20, currency: "USD", frequency: "monthly" },
			{ plan_uuid: "ent", plan_id: "ent", name: "Enterprise", price: null, currency: "USD", frequency: "custom" },
		], error: null }) };
		const client = { from: () => query, rpc: async () => ({ data: [
			{ plan_uuid: "pro", lab_slug: "lab", model_slug: "lab/a", scenario: "standard", monthly_tokens: "1000" },
			{ plan_uuid: "pro", lab_slug: "lab", model_slug: "lab/a", scenario: "off_peak", monthly_tokens: "2000" },
			{ plan_uuid: "other", lab_slug: "other-lab", model_slug: "x/y", scenario: "standard", monthly_tokens: "5" },
		], error: null }) };
		const related = await fetchRelatedPlans(client as never, { organisation_id: "lab" });
		expect(related.map((plan) => [plan.plan_id, plan.monthly_price_usd, plan.usage.length])).toEqual([["pro", 20, 1], ["ultra", 200, 0], ["ent", null, 0]]);
	});
});
