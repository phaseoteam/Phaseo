import { formatPriceLine } from "./SubscriptionPlansComparison";
import type { SubscriptionPrice } from "@/lib/fetchers/subscription-plans/pricing";

test("comparison cards display all concurrent charges and sequential price phases", () => {
	const price: SubscriptionPrice = { price: 80, currency: "USD", frequency: "monthly", billing_interval: "month", components: [
		{ component_key: "base", pricing_type: "fixed", amount: 80, charge_basis: "account" },
		{ component_key: "seat", pricing_type: "fixed", amount: 40, charge_basis: "seat" },
	] };
	const amount: Parameters<typeof formatPriceLine>[1] = (value) => `$${value}`;
	const t = ((key: string) => key) as Parameters<typeof formatPriceLine>[2];
	const labels = { custom: "Custom", usage: "Usage", unknown: "Unknown" };
	expect(formatPriceLine(price, amount, t, labels)).toBe("$80 / month + $40 / seat / month");
	price.components = [
		{ component_key: "base", pricing_type: "fixed", amount: 1, charge_basis: "account", phase: "introductory", duration_cycles: 1 },
		{ component_key: "base", pricing_type: "fixed", amount: 80, charge_basis: "account", phase: "renewal", starts_at_cycle: 2 },
	];
	expect(formatPriceLine(price, amount, t, labels)).toContain("$1 / month (introductory, 1 cycle) → $80 / month (from billing cycle 2)");
});
