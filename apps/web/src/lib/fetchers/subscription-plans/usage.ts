/** Measured monthly token volume for one model on one subscription plan. */
export interface SubscriptionPlanUsage {
	model_slug: string;
	model_name: string | null;
	scenario: "standard" | "peak" | "off_peak" | "fast" | string;
	monthly_price_usd: number | null;
	monthly_tokens: number;
	effective_usd_per_mtok: number | null;
	api_equivalent_usd_per_mtok: number | null;
	share_of_api_price: number | null;
	workload: string | null;
	basis: "measured" | "derived" | "official" | "assumed" | "unknown" | string;
	confidence: "high" | "medium" | "low" | "assumed" | string;
	source_name: string | null;
	source_url: string | null;
	measured_on: string | null;
	promo_until: string | null;
}

export const USAGE_SOURCE_URL = "https://github.com/FeiZhuLulu/real-api-pricing";

const usable = (row: SubscriptionPlanUsage) => row.effective_usd_per_mtok != null && Number.isFinite(row.effective_usd_per_mtok);

/** Standard scenarios first, then cheapest per 1M tokens, then most tokens. */
export function sortUsage(rows: readonly SubscriptionPlanUsage[]): SubscriptionPlanUsage[] {
	return rows.toSorted((a, b) =>
		Number(a.scenario !== "standard") - Number(b.scenario !== "standard")
		|| Number(!usable(a)) - Number(!usable(b))
		|| (a.effective_usd_per_mtok ?? 0) - (b.effective_usd_per_mtok ?? 0)
		|| b.monthly_tokens - a.monthly_tokens);
}

/** The plan's headline numbers: the most tokens and the lowest price per 1M tokens, both on the standard scenario when there is one. */
export function summarizeUsage(rows: readonly SubscriptionPlanUsage[] | null | undefined): { mostTokens: SubscriptionPlanUsage; cheapest: SubscriptionPlanUsage | null } | null {
	if (!rows?.length) return null;
	const standard = rows.filter((row) => row.scenario === "standard");
	const pool = standard.length ? standard : [...rows];
	const mostTokens = pool.toSorted((a, b) => b.monthly_tokens - a.monthly_tokens)[0];
	const cheapest = sortUsage(pool).find(usable) ?? null;
	return { mostTokens, cheapest };
}

/** Below this, "1.2× cheaper" reads as noise, so the share of the API price is shown instead. */
export const MIN_API_MULTIPLE = 1.5;

/** How many times more tokens the plan gives than the same money at API prices, e.g. 63 for 1.6% of the API price. */
export function apiMultiple(row: Pick<SubscriptionPlanUsage, "share_of_api_price">): number | null {
	const share = row.share_of_api_price;
	if (share == null || !Number.isFinite(share) || share <= 0) return null;
	return 1 / share;
}

/** The cheapest current plan for each model across all plans, cheapest relative to the API first. */
export function bestPlanPerModel<T extends { usage?: SubscriptionPlanUsage[] | null }>(plans: readonly T[]): Array<{ plan: T; usage: SubscriptionPlanUsage }> {
	const best = new Map<string, { plan: T; usage: SubscriptionPlanUsage }>();
	for (const plan of plans) {
		for (const usage of plan.usage ?? []) {
			if (usage.scenario !== "standard" || !usable(usage)) continue;
			const current = best.get(usage.model_slug);
			if (!current || (usage.effective_usd_per_mtok ?? Infinity) < (current.usage.effective_usd_per_mtok ?? Infinity)) best.set(usage.model_slug, { plan, usage });
		}
	}
	return [...best.values()].toSorted((a, b) =>
		Number(apiMultiple(a.usage) == null) - Number(apiMultiple(b.usage) == null)
		|| (apiMultiple(b.usage) ?? 0) - (apiMultiple(a.usage) ?? 0)
		|| (a.usage.effective_usd_per_mtok ?? 0) - (b.usage.effective_usd_per_mtok ?? 0));
}

/** Price per 1M tokens with enough precision to tell small numbers apart: $0.0063, $0.13, $2.50. */
export function perMillionFractionDigits(value: number): Intl.NumberFormatOptions {
	if (value >= 1) return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
	return { minimumSignificantDigits: 2, maximumSignificantDigits: 2 };
}
