import { formatSubscriptionPrice, localizedSubscriptionPriceLabels, type SubscriptionPrice } from "./pricing";

const monthly: SubscriptionPrice = { price: 30, currency: "USD", frequency: "monthly", billing_interval: "month", billing_interval_count: 1 };
describe("subscription offer formatting", () => {
	test("distinguishes missing, free, custom and usage prices", () => {
		expect(formatSubscriptionPrice({ ...monthly, price: null })).toBe("Price unavailable");
		expect(formatSubscriptionPrice({ ...monthly, price: null, pricing_type: "custom" })).toBe("Custom pricing");
		expect(formatSubscriptionPrice({ ...monthly, price: null, pricing_type: "usage_based" })).toBe("Usage-based");
		expect(formatSubscriptionPrice({ ...monthly, price: 0, pricing_type: "free" })).toBe("$0.00 / month");
	});
	test("shows starting prices, seats and actual annual totals", () => {
		expect(formatSubscriptionPrice({ ...monthly, pricing_type: "starting_at", charge_basis: "seat" })).toBe("From $30.00 / seat / month");
		expect(formatSubscriptionPrice({ ...monthly, price: 240, frequency: "yearly", billing_interval: "year" })).toBe("$240.00 / year");
		expect(formatSubscriptionPrice({ ...monthly, price: 54, billing_interval_count: 3 })).toBe("$54.00 / 3 months");
	});
	test("adds concurrent charges but separates sequential price phases", () => {
		const composite = { ...monthly, components: [
			{ component_key: "base", pricing_type: "fixed" as const, amount: 80, charge_basis: "account" as const },
			{ component_key: "seat", pricing_type: "fixed" as const, amount: 40, charge_basis: "seat" as const },
		] };
		expect(formatSubscriptionPrice(composite)).toBe("$80.00 / month + $40.00 / seat / month");
		expect(formatSubscriptionPrice({ ...monthly, components: [
			{ ...composite.components[0], amount: 1, phase: "introductory", starts_at_cycle: 1, duration_cycles: 1 },
			{ ...composite.components[0], amount: 30, phase: "renewal", starts_at_cycle: 2 },
		] })).toBe("$1.00 / month (introductory, 1 cycle) → $30.00 / month (from billing cycle 2)");
	});
	test("localizes periods and price qualifiers and preserves small unit prices", () => {
		const labels = localizedSubscriptionPriceLabels("de-DE", { custom: "Individuell", usage: "Nach Nutzung", unknown: "Unbekannt", from: "Ab", seat: "Platz" });
		const format = (amount: number, currency: string) => new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(amount);
		const value = formatSubscriptionPrice({ ...monthly, pricing_type: "starting_at", charge_basis: "seat" }, format, labels);
		expect(value).toContain("Ab 30,00"); expect(value).toContain("Platz / 1 Monat");
		expect(formatSubscriptionPrice({ ...monthly, components: [{ component_key: "metered", pricing_type: "usage_based", amount: 0.003, charge_basis: "unit", unit: "line" }] })).toBe("$0.003 / 1 line");
	});
	test("does not invent a currency or subscription period for metered charges", () => {
		expect(formatSubscriptionPrice({ ...monthly, currency: null })).toBe("30 / month");
		expect(formatSubscriptionPrice({ ...monthly, components: [{ component_key: "overage", pricing_type: "usage_based", amount: 0.01, charge_basis: "unit", unit: "credit", unit_quantity: 1 }] })).toBe("$0.01 / 1 credit");
	});
});
