import type { PriceCard } from "./types";

// A workspace private model carries a placeholder $0 card for the customer's
// own endpoint (see loadWorkspacePrivateModel). It is not a Phaseo free offer.
const PRIVATE_MODEL_PROVIDER_ID = "private-model";

function isZeroPrice(value: unknown): boolean {
	const price = Number(value);
	return Number.isFinite(price) && price === 0;
}

/**
 * A Phaseo free route: a non-empty card on which every rule, including any
 * time-window override, bills exactly zero.
 *
 * The rule's `pricing_plan` label is deliberately not consulted. The v2
 * catalogue derives it from the SKU's service tier (`standard` when unset), and
 * `free` stopped being a canonical tier for new catalogue writes in August
 * 2026, so a $0 free route can arrive labelled `standard`. Price is what
 * decides whether a request can cost anything.
 *
 * The same definition admits a request without credit (before/guards.ts),
 * counts it against the daily free allowance (core/customer-rate-limits.ts)
 * and selects the phaseo/free pool, so nothing reaches a $0 wallet uncapped.
 */
export function isFreePriceCard(
	card: PriceCard | null | undefined,
): card is PriceCard {
	if (!card || !Array.isArray(card.rules) || card.rules.length === 0) {
		return false;
	}
	if (card.provider === PRIVATE_MODEL_PROVIDER_ID) return false;
	return card.rules.every((rule) =>
		isZeroPrice(rule.price_per_unit) &&
		(rule.time_windows ?? []).every((window) =>
			window.price_per_unit == null || isZeroPrice(window.price_per_unit),
		),
	);
}
