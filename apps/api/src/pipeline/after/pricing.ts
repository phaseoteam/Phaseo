// lib/gateway/after/pricing.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Loads pricing cards and applies the cost model with tier-based markup.

import { loadPriceCard, computeBill } from "../pricing";
import { applyTierMarkupToUsage } from "../pricing/tier-markup";
import type { PriceCard } from "../pricing";
import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";

export async function loadProviderPricing(
    ctx: PipelineContext,
    result: RequestResult
): Promise<PriceCard | null> {
    try {
        let card = ctx.pricing?.[result.provider] ?? null;

        if (!card) {
            const baseModel = ctx.model.split(":")[0];
            card = await loadPriceCard(result.provider, baseModel, ctx.capability);
        }

        return card;
    } catch (err) {
        console.error("pricing card lookup failed", err);
        return null;
    }
}

export function calculatePricing(
    usage: any,
    card: PriceCard | null,
    body: any,
    tier?: string | null
): {
    pricedUsage: any;
    totalCents: number;
    totalNanos: number;
    currency: string;
} {
    let pricedUsage = usage;
    let totalCents = 0;
    let totalNanos = 0;
    let currency = card?.currency ?? "USD";

    if (card) {
        try {
            // Step 1: Calculate base pricing (provider costs)
            pricedUsage = computeBill(usage ?? {}, card, body ?? {});

            // Step 2: Apply tier-based markup (Basic 7%, Enterprise 5%)
            // This applies the markup to all pricing calculations
            pricedUsage = applyTierMarkupToUsage(pricedUsage, tier);

            const pricingInfo = (pricedUsage as any)?.pricing ?? {};
            totalCents = pricingInfo.total_cents ?? 0;
            totalNanos = pricingInfo.total_nanos ?? Math.round(totalCents * 1e7);
            currency = pricingInfo.currency ?? currency;
        } catch (calcErr) {
            console.error("computeBill failed", calcErr);
            pricedUsage = usage;
        }
    }

    return { pricedUsage, totalCents, totalNanos, currency };
}










