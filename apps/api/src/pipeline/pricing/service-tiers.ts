import type { PriceCard } from "./types";

const DEDICATED_TIER_PLANS = ["priority", "ultrafast", "flex", "batch"];

// Plans a client can ask for by name. Any other label on a card (default, early_access,
// on-demand, ...) is a provider SKU name for the route's ordinary price.
const REQUESTABLE_PLANS = new Set(["standard", "free", ...DEDICATED_TIER_PLANS]);

/**
 * The engine's name for a stored pricing plan. The catalogue stores Fireworks and Venice
 * fast SKUs as `fast` (`service_tier_slug`), while requests for the fast tier are priced
 * as `priority`. Both card loaders (the request-context RPC via `before/schemas.ts` and
 * `pricing/loader.ts`) and the engine use this, so a fast card is found whichever loaded it.
 */
export function canonicalPricingPlan(plan: unknown): string {
    const value = typeof plan === "string" ? plan.trim().toLowerCase() : "";
    if (!value) return "standard";
    return value === "fast" ? "priority" : value;
}

/** The card with every rule's plan in canonical form; the same object when nothing changes. */
export function normalizePriceCardPlans<T extends PriceCard | null | undefined>(card: T): T {
    if (!card || !Array.isArray(card.rules)) return card;
    if (card.rules.every((rule) => rule.pricing_plan === canonicalPricingPlan(rule.pricing_plan))) return card;
    return {
        ...card,
        rules: card.rules.map((rule) => ({ ...rule, pricing_plan: canonicalPricingPlan(rule.pricing_plan) })),
    } as T;
}

/**
 * The plan that prices a request which names no tier, and the plan a tier request falls
 * back to for meters its own plan does not price. `standard` when the card has standard
 * rules; otherwise the provider's own label for its ordinary price (DeepInfra `default`,
 * Xiaomi `early_access`); otherwise `free` for a free-only card. Null for a card that only
 * sells dedicated tiers, which requires the tier to be requested.
 */
export function resolveBasePricingPlan(card: PriceCard | null | undefined): string | null {
    const plans = new Set((card?.rules ?? []).map((rule) => canonicalPricingPlan(rule.pricing_plan)));
    if (!plans.size || plans.has("standard")) return "standard";
    const labels = [...plans].filter((plan) => !REQUESTABLE_PLANS.has(plan)).sort();
    if (labels.length) return labels[0]!;
    if (plans.has("free")) return "free";
    return null;
}

// Provider SKU names (for example on-demand or llm-plus) are not public
// service tiers. Only an exclusively dedicated tier card requires opt-in.
export function requiresExplicitServiceTier(card: PriceCard | null | undefined): boolean {
    return Boolean(card?.rules.length && card.rules.every((rule) =>
        DEDICATED_TIER_PLANS.includes(canonicalPricingPlan(rule.pricing_plan)),
    ));
}
