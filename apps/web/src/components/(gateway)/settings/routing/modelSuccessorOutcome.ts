export type SuccessorPricePolicyValue = "never" | "limit" | "any";

/** One of the workspace's models as returned by GET /routing/successor. */
export type SuccessorOverviewModel = {
	model: string;
	name: string | null;
	status: string;
	retiredAt: string | null;
	unservedSince: string | null;
	lastUsedAt: string | null;
	requests: number;
	suggestedReplacement: string | null;
	replacement: string | null;
	replacementName: string | null;
	workspaceOverride: boolean;
	reason: string | null;
	priceRatio: number | null;
	priceComparable: boolean;
	priceSkippedMeters: string[];
	servedBy: Array<{ model: string; requests: number; lastAt: string | null }>;
};

export type SuccessorPolicyState = { enabled: boolean; pricePolicy: SuccessorPricePolicyValue; maxPriceIncreasePercent: number };

export type SuccessorOutcome =
	/** Not served for 72 hours and routed to the replacement now. */
	| "redirecting"
	/** Still served, or within the grace period: the replacement takes over once the 72 hours pass. */
	| "will_redirect"
	| "off"
	| "never"
	| "no_replacement"
	| "replacement_unavailable"
	| "free_to_paid"
	| "price_higher"
	| "price_unknown";

export const GRACE_PERIOD_MS = 72 * 3_600_000;

/**
 * What a plain text request for the model gets with these settings. Mirrors
 * the gateway: the workspace's own replacement ignores the price policy, and
 * "any" allows prices that can't be compared.
 */
export function successorOutcome(model: SuccessorOverviewModel, policy: SuccessorPolicyState): SuccessorOutcome {
	if (model.reason === "never") return "never";
	if (model.reason === "free_to_paid") return "free_to_paid";
	if (!model.replacement) return "no_replacement";
	if (model.reason === "no_served_successor") return "replacement_unavailable";
	if (!policy.enabled) return "off";
	const priceAllowed = successorPriceAllowed(model, policy);
	if (priceAllowed !== true) return priceAllowed;
	return model.reason === "eligible" ? "redirecting" : "will_redirect";
}

function successorPriceAllowed(model: SuccessorOverviewModel, policy: SuccessorPolicyState): true | "price_higher" | "price_unknown" {
	if (model.workspaceOverride || policy.pricePolicy === "any") return true;
	if (!model.priceComparable || model.priceRatio == null) return "price_unknown";
	const limit = policy.pricePolicy === "limit" ? 1 + policy.maxPriceIncreasePercent / 100 : 1;
	// Ratios are rounded to 6 places in SQL; the gateway tolerates that at the limit.
	return model.priceRatio <= limit + 1e-6 ? true : "price_higher";
}

/** The replacement's price change as a whole percentage, or null when the prices can't be compared. */
export function priceChangePercent(model: Pick<SuccessorOverviewModel, "priceRatio" | "priceComparable">): number | null {
	if (!model.priceComparable || model.priceRatio == null) return null;
	return Math.round((model.priceRatio - 1) * 100);
}

export type SkippedCharge = "webSearch" | "images" | "audio" | "video";

/**
 * Charges the price comparison left out because the old model never billed
 * them. A request that uses one still fails, unless the replacement is the
 * workspace's own or the policy is "any".
 */
export function skippedCharges(model: SuccessorOverviewModel, policy: SuccessorPolicyState): SkippedCharge[] {
	if (model.workspaceOverride || policy.pricePolicy === "any") return [];
	const charges = new Set<SkippedCharge>();
	for (const meter of model.priceSkippedMeters) {
		if (/web_(search|fetch)/.test(meter)) charges.add("webSearch");
		else if (meter.includes("_image")) charges.add("images");
		else if (meter.includes("_audio")) charges.add("audio");
		else if (meter.includes("_video")) charges.add("video");
	}
	return [...charges];
}

/** When the replacement takes over a model that has stopped being served, or null while it is still served. */
export function redirectStartsAt(model: Pick<SuccessorOverviewModel, "unservedSince">): Date | null {
	if (!model.unservedSince) return null;
	const since = Date.parse(model.unservedSince);
	return Number.isNaN(since) ? null : new Date(since + GRACE_PERIOD_MS);
}
