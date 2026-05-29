// lib/gateway/after/pricing.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Loads pricing cards and applies the cost model with tier-based markup.

import { loadPriceCard, computeBill } from "../pricing";
import type { PriceCard } from "../pricing";
import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import { deriveCachePricingContext } from "../pricing/cache-context";
import { getBaseModel } from "../execute/utils";
import { stripUsagePricing } from "../usage";
import { buildImagePricingRequestOptions } from "@core/image-request-options";

function derivePricingPlan(_body: any, usage: any): string {
    const tierRaw =
        (typeof usage?.service_tier === "string" ? usage.service_tier : undefined) ??
        (typeof usage?.serviceTier === "string" ? usage.serviceTier : undefined);
    const tier = typeof tierRaw === "string" ? tierRaw.trim().toLowerCase() : "";

    if (tier === "priority") return "priority";
    if (tier === "batch") return "batch";
    if (tier === "flex") return "flex";

    return "standard";
}

function buildTrustedPricingRequestOptions(body: any, usage: any, pricingPlan: string): Record<string, unknown> {
    const options: Record<string, unknown> = {
        ...deriveCachePricingContext(body),
        ...buildImagePricingRequestOptions(body ?? {}, usage),
        pricing_plan: pricingPlan,
    };

    const serviceTierRaw =
        (typeof usage?.service_tier === "string" ? usage.service_tier : undefined) ??
        (typeof usage?.serviceTier === "string" ? usage.serviceTier : undefined);
    const serviceTier = typeof serviceTierRaw === "string" ? serviceTierRaw.trim().toLowerCase() : "";
    if (serviceTier) {
        options.service_tier = serviceTier;
        options.serviceTier = serviceTier;
    }

    return options;
}

export async function loadProviderPricing(
    ctx: PipelineContext,
    result: RequestResult
): Promise<PriceCard | null> {
    try {
        const apiModelId =
            typeof result.apiModelId === "string" && result.apiModelId.trim().length > 0
                ? result.apiModelId.trim()
                : null;
        const pricingKey =
            typeof result.pricingKey === "string" && result.pricingKey.trim().length > 0
                ? result.pricingKey.trim()
                : apiModelId
                    ? `${result.provider}:${apiModelId}`
                    : result.provider;

        let card = ctx.pricing?.[pricingKey] ?? null;
        if (!card && pricingKey !== result.provider) {
            card = ctx.pricing?.[result.provider] ?? null;
        }

        if (!card) {
            card = await loadPriceCard(
                result.provider,
                apiModelId ?? getBaseModel(ctx.model),
                ctx.capability,
            );
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
    _tier?: string | null
): {
    pricedUsage: any;
    totalCents: number;
    totalNanos: number;
    currency: string;
} {
    const usageMeters = stripUsagePricing(usage);
    let pricedUsage = usageMeters;
    let totalCents = 0;
    let totalNanos = 0;
    let currency = card?.currency ?? "USD";

    if (card) {
        try {
            const pricingPlan = derivePricingPlan(body, usage);
            const requestOptions = buildTrustedPricingRequestOptions(body, usage, pricingPlan);

            // Step 1: Calculate base pricing (provider costs)
            pricedUsage = computeBill(usageMeters ?? {}, card, requestOptions, pricingPlan);

            const pricingInfo = (pricedUsage as any)?.pricing ?? {};
            totalCents = pricingInfo.total_cents ?? 0;
            totalNanos = pricingInfo.total_nanos ?? Math.round(totalCents * 1e7);
            currency = pricingInfo.currency ?? currency;
        } catch (calcErr) {
            console.error("computeBill failed", calcErr);
            pricedUsage = usageMeters;
        }
    }

    return { pricedUsage, totalCents, totalNanos, currency };
}










