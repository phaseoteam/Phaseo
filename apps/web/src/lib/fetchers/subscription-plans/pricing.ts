export interface SubscriptionPriceComponent {
	component_key: string;
	pricing_type: "free" | "fixed" | "starting_at" | "custom" | "usage_based" | "unknown";
	amount: number | null;
	charge_basis: "account" | "seat" | "unit";
	seat_type?: string | null;
	unit?: string | null;
	unit_quantity?: number;
	phase?: "standard" | "introductory" | "renewal";
	starts_at_cycle?: number;
	duration_cycles?: number | null;
	display_text?: string | null;
}

export interface SubscriptionPrice {
	price: number | null;
	currency: string | null;
	frequency: string | null;
	offer_uuid?: string;
	plan_uuid?: string;
	pricing_type?: SubscriptionPriceComponent["pricing_type"];
	charge_basis?: SubscriptionPriceComponent["charge_basis"];
	billing_interval?: string | null;
	billing_interval_count?: number;
	components?: SubscriptionPriceComponent[];
	minimum_seats?: number | null;
	region_code?: string | null;
	tax_treatment?: string;
}

export function formatSubscriptionPrice(price: SubscriptionPrice, formatAmount = (value: number, currency: string) =>
	new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value),
	labels = { custom: "Custom pricing", usage: "Usage-based", unknown: "Price unavailable" }): string {
	const interval = price.billing_interval;
	const count = price.billing_interval_count ?? 1;
	const period = interval ? ` / ${count === 1 ? interval : `${count} ${interval}s`}` :
		({ monthly: " / month", quarterly: " / 3 months", yearly: " / year", weekly: " / week", daily: " / day" } as Record<string, string>)[price.frequency ?? ""] ?? "";
	const components: SubscriptionPriceComponent[] = price.components?.length ? price.components : [{ component_key: "base",
		pricing_type: price.pricing_type ?? (price.frequency === "custom" ? "custom" : price.frequency === "usage" ? "usage_based" : price.price == null ? "unknown" : "fixed"),
		amount: price.price, charge_basis: price.charge_basis ?? "account" } satisfies SubscriptionPriceComponent];
	const phases = new Map<string, SubscriptionPriceComponent[]>();
	for (const component of components) {
		const key = `${component.starts_at_cycle ?? 1}:${component.phase ?? "standard"}`;
		phases.set(key, [...(phases.get(key) ?? []), component]);
	}
	return [...phases.values()].sort((a, b) => (a[0].starts_at_cycle ?? 1) - (b[0].starts_at_cycle ?? 1)).map((phaseComponents) => phaseComponents.map((component) => {
		if (component.pricing_type === "custom") return labels.custom;
		if (component.pricing_type === "unknown" || component.amount == null) return component.pricing_type === "usage_based" ? labels.usage : labels.unknown;
		const amount = price.currency ? formatAmount(component.amount, price.currency) : String(component.amount);
		const basis = component.charge_basis === "seat" ? " / seat" : component.charge_basis === "unit" ? ` / ${component.unit_quantity ?? 1} ${component.unit ?? "unit"}` : "";
		const phase = component.phase === "renewal" ? ` (from billing cycle ${component.starts_at_cycle ?? 1})` :
			component.phase === "introductory" ? ` (introductory${component.duration_cycles ? `, ${component.duration_cycles} cycles` : ""})` : "";
		return `${component.pricing_type === "starting_at" ? "From " : ""}${amount}${basis}${component.charge_basis === "unit" ? "" : period}${phase}`;
	}).join(" + ")).join(" → ");
}
