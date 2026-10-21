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

export type GatewayRouteFields = {
	is_active_gateway?: boolean | null;
	capability_status?: string | null;
	endpoint?: string | null;
	effective_from?: string | null;
	effective_to?: string | null;
};

type RoutableSource = {
	compare_provider_pricing?: Array<{
		provider: { api_provider_id: string };
		provider_models?: GatewayRouteFields[] | null;
	}> | null;
};

function parseTime(value: string | null | undefined): number | null {
	if (!value) return null;
	const time = new Date(value).getTime();
	return Number.isFinite(time) ? time : null;
}

/** The same checks the model page uses: enabled, mapped and inside its effective window. */
export function isCurrentGatewayRoute(providerModel: GatewayRouteFields, now = Date.now()): boolean {
	if (!providerModel.is_active_gateway) return false;
	if (providerModel.capability_status === "disabled") return false;
	if (!providerModel.endpoint || providerModel.endpoint === "unmapped") return false;
	const from = parseTime(providerModel.effective_from);
	const to = parseTime(providerModel.effective_to);
	if (from != null && now < from) return false;
	if (to != null && now >= to) return false;
	return true;
}

/**
 * Providers Phaseo routes the model through today. The rest are price listings
 * from elsewhere, some carrying discounted rows Phaseo can't serve.
 */
export function getRoutableProviderIds(model: object, now = Date.now()): Set<string> {
	return new Set(
		((model as RoutableSource).compare_provider_pricing ?? [])
			.filter((group) => group.provider_models?.some((providerModel) => isCurrentGatewayRoute(providerModel, now)))
			.map((group) => group.provider.api_provider_id)
	);
}

/** "flex" → "Flex", "ultra_fast" → "Ultra fast". */
export function formatServiceTierLabel(tier: string): string {
	const spaced = tier.replace(/[_-]+/g, " ").trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
