export function readablePricingLabel(value: string) {
	return value.replace(/[_.]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function billingUnit(quantity: string | number, unit: string) {
	const amount = Number(quantity);
	const label = amount === 1_000_000 ? "1M" : amount === 1_000 ? "1K" : amount.toLocaleString("en");
	return `${label} ${unit}${amount === 1 || unit.endsWith("s") ? "" : "s"}`;
}

export function rebasePrice(price: string, oldQuantity: string, quantity: string) {
	if (!price.trim() || !Number.isFinite(Number(price)) || Number(oldQuantity) <= 0 || Number(quantity) <= 0) return price;
	return String(Number((Number(price) * Number(quantity) / Number(oldQuantity)).toPrecision(12)));
}

export function formatPrice(price: string, currency: string) {
	const amount = Number(price);
	if (!price.trim() || !Number.isFinite(amount)) return "Enter a price";
	return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 9 }).format(amount);
}

export function validatePriceAmounts(meters: Array<{ price_usd: string; unit_quantity: string }>) {
	if (!meters.length) throw new Error("Add at least one charge before saving.");
	for (const meter of meters) {
		if (!meter.price_usd.trim() || !Number.isFinite(Number(meter.price_usd)) || Number(meter.price_usd) < 0) {
			throw new Error("Enter a price of zero or more for every charge.");
		}
		if (!meter.unit_quantity.trim() || !Number.isFinite(Number(meter.unit_quantity)) || Number(meter.unit_quantity) <= 0) {
			throw new Error("Every billing quantity must be greater than zero.");
		}
	}
}
