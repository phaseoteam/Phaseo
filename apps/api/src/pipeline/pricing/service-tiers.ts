import type { PriceCard } from "./types";

// Provider SKU names (for example on-demand or llm-plus) are not public
// service tiers. Only an exclusively dedicated tier card requires opt-in.
export function requiresExplicitServiceTier(card: PriceCard | null | undefined): boolean {
    return Boolean(card?.rules.length && card.rules.every((rule) =>
        ["priority", "flex", "batch"].includes(rule.pricing_plan),
    ));
}
