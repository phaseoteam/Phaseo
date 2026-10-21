export type HeadlinePriceKind = "input" | "output" | "cached";

type PricedRow = {
	meter?: string | null;
	pricing_plan?: string | null;
};

const NON_TEXT_MODALITY = /image|audio|video/;

/**
 * How well a pricing meter stands for a model's headline input, output or
 * cached-input price: 0 for text tokens (or legacy rows without a meter), 1 for
 * other token modalities, null when it doesn't count at all. Reasoning tokens
 * never count: providers list them separately, sometimes at $0 because output
 * pricing already covers them.
 */
export function headlineMeterRank(
	meter: string | null | undefined,
	kind: HeadlinePriceKind
): number | null {
	const key = String(meter ?? "").trim().toLowerCase();
	if (!key) return 0;
	if (!key.includes("token") || key.includes("reasoning")) return null;
	const cached = key.includes("cached");
	if (kind === "cached") {
		if (!cached || key.includes("write")) return null;
	} else if (cached) {
		return null;
	} else if (kind === "input" ? !key.includes("input") || key.includes("output") : !key.includes("output")) {
		return null;
	}
	return NON_TEXT_MODALITY.test(key) ? 1 : 0;
}

function isStandardPlan(plan: string | null | undefined): boolean {
	const key = plan?.trim().toLowerCase();
	return !key || key === "standard";
}

/** Standard-plan rows when there are any, so batch and flex discounts don't pass as list prices. */
export function preferStandardPlan<T extends PricedRow>(prices: T[]): T[] {
	const standard = prices.filter((price) => isStandardPlan(price.pricing_plan));
	return standard.length ? standard : prices;
}

/** The cheapest row among the best-ranked headline meters for `kind`. */
export function pickHeadlinePrice<T extends PricedRow>(
	prices: T[],
	kind: HeadlinePriceKind,
	valuePerMillion: (price: T) => number | null
): { price: T; valuePerMillion: number } | null {
	let best: { price: T; valuePerMillion: number; rank: number } | null = null;
	for (const price of prices) {
		const rank = headlineMeterRank(price.meter, kind);
		if (rank == null) continue;
		const value = valuePerMillion(price);
		if (value == null || !Number.isFinite(value)) continue;
		if (!best || rank < best.rank || (rank === best.rank && value < best.valuePerMillion)) {
			best = { price, valuePerMillion: value, rank };
		}
	}
	return best ? { price: best.price, valuePerMillion: best.valuePerMillion } : null;
}

type RoutableSource = {
	compare_provider_pricing?: Array<{
		provider: { api_provider_id: string };
		provider_models?: Array<{ is_active_gateway?: boolean | null }> | null;
	}> | null;
};

/**
 * Providers Phaseo routes the model through. The rest are price listings from
 * elsewhere, some carrying discounted rows Phaseo can't serve.
 */
export function getRoutableProviderIds(model: object): Set<string> {
	return new Set(
		((model as RoutableSource).compare_provider_pricing ?? [])
			.filter((group) => group.provider_models?.some((providerModel) => providerModel.is_active_gateway))
			.map((group) => group.provider.api_provider_id)
	);
}

/** "flex" → "Flex", "ultra_fast" → "Ultra fast". */
export function formatServiceTierLabel(tier: string): string {
	const spaced = tier.replace(/[_-]+/g, " ").trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
