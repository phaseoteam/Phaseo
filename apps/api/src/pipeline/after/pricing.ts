// lib/gateway/after/pricing.ts
import { loadPriceCard, computeBill } from "../pricing";
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
            card = await loadPriceCard(result.provider, baseModel, ctx.endpoint);
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
    body: any
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
            pricedUsage = computeBill(usage ?? {}, card, body ?? {});
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
