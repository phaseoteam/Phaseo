import { describe, expect, it } from "vitest";
import { subscriptionPayload } from "./subscriptions";

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
