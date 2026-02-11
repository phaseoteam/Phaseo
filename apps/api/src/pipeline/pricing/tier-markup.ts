// Purpose: Apply tier-based markup to pricing calculations
// Why: Simplified two-tier pricing (Basic 7%, Enterprise 5%)
// How: Applies markup multiplier after base cost calculation

import type { PricingResult } from "./types";

/**
 * Tier-based markup rates
 * Basic: 7% markup (1.07x)
 * Enterprise: 5% markup (1.05x)
 */
const TIER_MARKUP = {
    basic: 1.07,      // 7% markup
    enterprise: 1.05, // 5% markup
} as const;

export type PricingTier = keyof typeof TIER_MARKUP;

/**
 * Get markup multiplier for a tier
 */
export function getTierMarkup(tier: string | null | undefined): number {
    const normalizedTier = (tier || 'basic').toLowerCase();
    return TIER_MARKUP[normalizedTier as PricingTier] ?? TIER_MARKUP.basic;
}

/**
 * Get markup percentage for display (e.g., 7 for Basic, 5 for Enterprise)
 */
export function getTierMarkupPercentage(tier: string | null | undefined): number {
    const multiplier = getTierMarkup(tier);
    return Math.round((multiplier - 1) * 100);
}

/**
 * Apply tier-based markup to a pricing result
 *
 * Example:
 * - Base cost: $1.00
 * - Basic tier (7%): $1.07
 * - Enterprise tier (5%): $1.05
 *
 * @param pricingResult - Base pricing calculation (before markup)
 * @param tier - Team tier ('basic' or 'enterprise')
 * @returns Pricing result with markup applied
 */
export function applyTierMarkup(
    pricingResult: PricingResult,
    tier: string | null | undefined
): PricingResult {
    const markup = getTierMarkup(tier);

    // If no markup (1.0x) or invalid result, return as-is
    if (markup === 1.0 || !pricingResult) {
        return pricingResult;
    }

    // Apply markup to each line
    const markedUpLines = pricingResult.lines.map((line) => {
        const markedUpLineNanos = Math.ceil(line.line_nanos * markup);
        const markedUpUnitPriceNanos = Math.ceil(parseUsdToNanos(line.unit_price_usd) * markup);

        return {
            ...line,
            unit_price_usd: formatUsdFromNanos(markedUpUnitPriceNanos),
            line_cost_usd: formatUsdFromNanos(markedUpLineNanos),
            line_nanos: markedUpLineNanos,
            // Preserve original for transparency
            base_unit_price_usd: line.unit_price_usd,
            base_line_cost_usd: line.line_cost_usd,
            base_line_nanos: line.line_nanos,
            markup_applied: markup,
        };
    });

    // Calculate new totals
    const totalNanos = markedUpLines.reduce((sum, line) => sum + line.line_nanos, 0);
    const totalCents = Math.ceil(totalNanos / 10_000_000);

    return {
        cost_usd: totalNanos / 1_000_000_000,
        cost_usd_str: formatUsdFromNanos(totalNanos),
        cost_cents: totalCents,
        currency: pricingResult.currency,
        lines: markedUpLines,
        // Add metadata about markup
        tier,
        markup_applied: markup,
        markup_percentage: getTierMarkupPercentage(tier),
        base_cost_usd: pricingResult.cost_usd,
        base_cost_cents: pricingResult.cost_cents,
    } as PricingResult;
}

/**
 * Apply tier markup to usage object (with pricing field)
 * This is the main entry point used by the pricing pipeline
 */
export function applyTierMarkupToUsage(
    usageWithPricing: any,
    tier: string | null | undefined
): any {
    if (!usageWithPricing || !usageWithPricing.pricing) {
        return usageWithPricing;
    }

    const markup = getTierMarkup(tier);
    if (markup === 1.0) {
        return usageWithPricing; // No markup to apply
    }

    const pricing = usageWithPricing.pricing;

    // Apply markup to totals
    const baseNanos = pricing.total_nanos;
    const markedUpNanos = Math.ceil(baseNanos * markup);
    const markedUpCents = Math.ceil(markedUpNanos / 10_000_000);

    // Apply markup to lines
    const markedUpLines = (pricing.lines || []).map((line: any) => {
        const markedUpLineNanos = Math.ceil(line.line_nanos * markup);
        const markedUpUnitPriceNanos = Math.ceil(parseUsdToNanos(line.unit_price_usd) * markup);

        return {
            ...line,
            unit_price_usd: formatUsdFromNanos(markedUpUnitPriceNanos),
            line_cost_usd: formatUsdFromNanos(markedUpLineNanos),
            line_nanos: markedUpLineNanos,
        };
    });

    return {
        ...usageWithPricing,
        pricing: {
            ...pricing,
            total_nanos: markedUpNanos,
            total_usd_str: formatUsdFromNanos(markedUpNanos),
            total_cents: markedUpCents,
            lines: markedUpLines,
            // Add metadata
            tier,
            markup_applied: markup,
            markup_percentage: getTierMarkupPercentage(tier),
            base_total_nanos: baseNanos,
            base_total_cents: pricing.total_cents,
        },
    };
}

// ============================================================================
// HELPER FUNCTIONS (from money.ts)
// ============================================================================

function parseUsdToNanos(usdString: string | number): number {
    const usd = typeof usdString === "string" ? parseFloat(usdString) : usdString;
    if (!Number.isFinite(usd)) return 0;
    return Math.round(usd * 1_000_000_000);
}

function formatUsdFromNanos(nanos: number): string {
    if (!Number.isFinite(nanos)) return "0.000000000";
    const usd = nanos / 1_000_000_000;
    return usd.toFixed(9);
}
