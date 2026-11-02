import { describe, expect, it, vi } from "vitest";
import { fetchSubscriptionPlansForModels, mergeOrderedPlanLists, subscriptionPayload } from "./subscriptions";

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
		const rpc = vi.fn(async (_name: string, args: { p_model_slug: string | null }) => ({
			data: args.p_model_slug === "one"
				? [{ plan_uuid: "shared", models: [] }, { plan_uuid: "only-one", models: [] }]
				: [{ plan_uuid: "shared", models: [] }],
			error: null,
		}));
		const plans = await fetchSubscriptionPlansForModels({ rpc } as never, ["one", "two"]);
		expect(rpc.mock.calls.map(([, args]) => args.p_model_slug)).toEqual(["one", "two"]);
		expect(plans.map((row) => row.plan_uuid)).toEqual(["shared", "only-one"]);
	});
});
