import type { PriceCard } from "./types";

export function isFreePriceCard(
	card: PriceCard | null | undefined,
): boolean {
	if (!card || !Array.isArray(card.rules) || card.rules.length === 0) {
		return false;
	}
	return card.rules.every((rule) => {
		const pricingPlan = String(rule.pricing_plan ?? "")
			.trim()
			.toLowerCase();
		const pricePerUnit = Number(rule.price_per_unit);
		return (
			(typeof rule.price_per_unit === "number" || (typeof rule.price_per_unit === "string" && rule.price_per_unit.trim() !== "")) &&
			pricingPlan === "free" &&
			Number.isFinite(pricePerUnit) &&
			pricePerUnit === 0
		);
	});
}
