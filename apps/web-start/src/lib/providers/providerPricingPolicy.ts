export type RegionalPricingMode =
	| "unknown"
	| "same_as_global"
	| "uplift"
	| "source_region_rates"
	| "offer_specific";

export type PricingPolicyBadge = {
	key: string;
	label: string;
};

function formatMultiplier(value: number): string {
	const rounded = value >= 10 ? value.toFixed(1) : value.toFixed(2);
	return `${rounded.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}x`;
}

export function formatDerivedPricingMultiplierLabel(args: {
	derivedMultiplier?: number | null;
	derivedMinMultiplier?: number | null;
	derivedMaxMultiplier?: number | null;
	derivedComparisonProviderName?: string | null;
	includeComparedProvider?: boolean;
}): string | null {
	if (
		typeof args.derivedMultiplier !== "number" ||
		!Number.isFinite(args.derivedMultiplier) ||
		args.derivedMultiplier <= 0
	) {
		return null;
	}

	const min = args.derivedMinMultiplier ?? args.derivedMultiplier;
	const max = args.derivedMaxMultiplier ?? args.derivedMultiplier;
	const variable =
		Number.isFinite(min) &&
		Number.isFinite(max) &&
		min > 0 &&
		max > 0 &&
		max / min > 1.02;
	const comparedProvider =
		args.includeComparedProvider && args.derivedComparisonProviderName
			? ` vs ${args.derivedComparisonProviderName}`
			: " vs Base";

	return variable
		? `${formatMultiplier(args.derivedMultiplier)}+${comparedProvider}`
		: `${formatMultiplier(args.derivedMultiplier)}${comparedProvider}`;
}

export function formatRegionalPricingMode(mode: RegionalPricingMode): string {
	switch (mode) {
		case "same_as_global":
			return "Same as global";
		case "uplift":
			return "Regional uplift";
		case "source_region_rates":
			return "Source region rates";
		case "offer_specific":
			return "Offer-specific pricing";
		default:
			return "Unknown";
	}
}

export function buildPricingPolicyBadges(args: {
	regionalPricingMode?: RegionalPricingMode | null;
	regionalPricingUpliftPercent?: number | null;
	derivedMultiplier?: number | null;
	derivedMinMultiplier?: number | null;
	derivedMaxMultiplier?: number | null;
	derivedComparisonProviderName?: string | null;
	maxBadges?: number;
}): PricingPolicyBadge[] {
	const maxBadges = Math.max(1, args.maxBadges ?? 2);
	const badges: PricingPolicyBadge[] = [];

	if (
		typeof args.derivedMultiplier === "number" &&
		Number.isFinite(args.derivedMultiplier) &&
		args.derivedMultiplier > 0
	) {
		badges.push({
			key: "pricing-derived-multiplier",
			label:
				formatDerivedPricingMultiplierLabel({
					derivedMultiplier: args.derivedMultiplier,
					derivedMinMultiplier: args.derivedMinMultiplier,
					derivedMaxMultiplier: args.derivedMaxMultiplier,
					derivedComparisonProviderName:
						args.derivedComparisonProviderName ?? null,
					includeComparedProvider: false,
				}) ?? "Regional Pricing",
		});
		return badges.slice(0, maxBadges);
	}

	switch (args.regionalPricingMode ?? "unknown") {
		case "same_as_global":
			badges.push({ key: "pricing-same-global", label: "Same Global Price" });
			break;
		case "uplift":
			badges.push({
				key: "pricing-uplift",
				label:
					typeof args.regionalPricingUpliftPercent === "number"
						? `Regional +${args.regionalPricingUpliftPercent}%`
						: "Regional Uplift",
			});
			break;
		case "source_region_rates":
			badges.push({
				key: "pricing-source-rates",
				label: "Source Region Rates",
			});
			break;
		case "offer_specific":
			badges.push({
				key: "pricing-offer-specific",
				label: "Region-Specific Pricing",
			});
			break;
		default:
			break;
	}

	return badges.slice(0, maxBadges);
}

export function getRegionalPricingHint(args: {
	regionalPricingMode?: RegionalPricingMode | null;
	regionalPricingUpliftPercent?: number | null;
	derivedMultiplier?: number | null;
	derivedMinMultiplier?: number | null;
	derivedMaxMultiplier?: number | null;
	derivedComparisonProviderName?: string | null;
	derivedRuleCount?: number | null;
}): string | null {
	if (
		typeof args.derivedMultiplier === "number" &&
		Number.isFinite(args.derivedMultiplier) &&
		args.derivedMultiplier > 0
	) {
		const comparedProvider = args.derivedComparisonProviderName || "the base offer";
		const pairCount =
			typeof args.derivedRuleCount === "number" && args.derivedRuleCount > 0
				? ` from ${args.derivedRuleCount} comparable current pricing rule${
						args.derivedRuleCount === 1 ? "" : "s"
				  }`
				: "";
		const min = args.derivedMinMultiplier ?? args.derivedMultiplier;
		const max = args.derivedMaxMultiplier ?? args.derivedMultiplier;
		const variable =
			Number.isFinite(min) &&
			Number.isFinite(max) &&
			min > 0 &&
			max > 0 &&
			max / min > 1.02;
		if (variable) {
			return `Compared with ${comparedProvider}, comparable current rates range from ${formatMultiplier(
				min,
			)} to ${formatMultiplier(max)}${pairCount}. Showing the lowest observed multiplier.`;
		}
		return `Compared with ${comparedProvider}, comparable current pricing is ${formatMultiplier(
			args.derivedMultiplier,
		)}${pairCount}.`;
	}

	switch (args.regionalPricingMode ?? "unknown") {
		case "same_as_global":
			return "Regional execution follows the provider's standard published pricing.";
		case "uplift":
			return typeof args.regionalPricingUpliftPercent === "number"
				? `Regional processing endpoints carry a ${args.regionalPricingUpliftPercent}% pricing uplift.`
				: "Regional processing endpoints carry a documented pricing uplift.";
		case "source_region_rates":
			return "Cross-region or geographic routing is billed at source-region rates with no separate routing surcharge.";
		case "offer_specific":
			return "Pricing varies by offer or region. Compare the provider offers directly for the exact rate.";
		default:
			return null;
	}
}
