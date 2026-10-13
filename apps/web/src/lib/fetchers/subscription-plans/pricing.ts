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

export interface SubscriptionPriceLabels {
	custom: string;
	usage: string;
	unknown: string;
	from?: string;
	seat?: string;
	introductory?: string;
	firstCycle?: string;
	cycleCount?: string;
	period?: (count: number, interval: string) => string;
}

export function localizedSubscriptionPriceLabels(locale: string, labels: SubscriptionPriceLabels): SubscriptionPriceLabels {
	return { ...labels, period: (count, interval) => new Intl.NumberFormat(locale, {
		style: "unit", unit: interval, unitDisplay: "long",
	}).format(count) };
}

export function formatSubscriptionPrice(price: SubscriptionPrice, formatAmount = (value: number, currency: string) =>
	new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 8 }).format(value),
	labels: SubscriptionPriceLabels = { custom: "Custom pricing", usage: "Usage-based", unknown: "Price unavailable" }): string {
	const interval = price.billing_interval;
	const count = price.billing_interval_count ?? 1;
	const period = interval ? ` / ${labels.period ? labels.period(count, interval) : count === 1 ? interval : `${count} ${interval}s`}` :
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
		const basis = component.charge_basis === "seat" ? ` / ${labels.seat ?? "seat"}` : component.charge_basis === "unit" ? ` / ${component.unit_quantity ?? 1} ${component.unit ?? "unit"}` : "";
		const phase = component.phase === "renewal" ? ` (${labels.firstCycle ? `${labels.firstCycle}:` : "from billing cycle"} ${component.starts_at_cycle ?? 1})` :
			component.phase === "introductory" ? ` (${labels.introductory ?? "introductory"}${component.duration_cycles ? labels.cycleCount ? `, ${labels.cycleCount}: ${component.duration_cycles}` : `, ${component.duration_cycles} ${component.duration_cycles === 1 ? "cycle" : "cycles"}` : ""})` : "";
		return `${component.pricing_type === "starting_at" ? `${labels.from ?? "From"} ` : ""}${amount}${basis}${component.charge_basis === "unit" ? "" : period}${phase}`;
	}).join(" + ")).join(" → ");
}
