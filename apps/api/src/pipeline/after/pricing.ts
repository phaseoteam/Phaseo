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
import { normalizeTextServiceTier, readRequestedServiceTier } from "@core/serviceTiers";
import { getProviderPricingKey } from "../before/context.shared";

function normalizeObservedServiceTier(value: unknown): string {
    if (typeof value === "string" && value.trim().toLowerCase() === "default") {
        return "standard";
    }
    return normalizeTextServiceTier(value) ?? "";
}

function normalizePricingServiceTier(body: any, usage: any, card?: PriceCard): string {
    const observedTier =
        normalizeObservedServiceTier(usage?.service_tier) ||
        normalizeObservedServiceTier(usage?.serviceTier);
    const requestedTier = normalizeTextServiceTier(readRequestedServiceTier(body).value) ?? "";
    // Dedicated priority routes cannot downgrade to an unpriced standard SKU.
    // Honor observed downgrades on cards that actually offer standard pricing.
    if (observedTier === "standard" && (requestedTier === "priority" || requestedTier === "fast") &&
        card?.rules.some((rule) => rule.pricing_plan === "priority") &&
        !card.rules.some((rule) => rule.pricing_plan === "standard")) {
        return requestedTier;
    }
    if (observedTier) return observedTier;

    return requestedTier;
}

function derivePricingPlan(body: any, usage: any, card: PriceCard): string {
    const tier = normalizePricingServiceTier(body, usage, card);

    if (tier === "fast" || tier === "priority") return "priority";
    if (tier === "batch") return "batch";
    if (tier === "flex") return "flex";

    return "standard";
}

function buildTrustedPricingRequestOptions(body: any, usage: any, pricingPlan: string, card: PriceCard): Record<string, unknown> {
    const options: Record<string, unknown> = {
        ...deriveCachePricingContext(body),
        ...buildImagePricingRequestOptions(body ?? {}, usage),
        pricing_plan: pricingPlan,
    };

    const serviceTier = normalizePricingServiceTier(body, usage, card);
    if (serviceTier) {
        options.service_tier = serviceTier;
        options.serviceTier = serviceTier;
    }

    return options;
}

function attachBillingTimestamps(
    options: Record<string, unknown>,
    meta?: PipelineContext["meta"] | null,
): Record<string, unknown> {
    const completedAtMs = meta?.completedAtMs ?? Date.now();
    if (!meta) {
        return {
            ...options,
            request_started_at: completedAtMs,
            startedAtMs: completedAtMs,
            completed_at: completedAtMs,
            completedAtMs,
        };
    }
    return {
        ...options,
        request_started_at: meta.startedAtMs,
        startedAtMs: meta.startedAtMs,
        provider_accepted_at: meta.upstreamStartMs,
        upstreamStartMs: meta.upstreamStartMs,
        completed_at: completedAtMs,
        completedAtMs,
    };
}

export async function loadProviderPricing(
    ctx: PipelineContext,
    result: RequestResult
): Promise<PriceCard | null> {
    const apiModelId =
        typeof result.apiModelId === "string" && result.apiModelId.trim().length > 0
            ? result.apiModelId.trim()
            : null;
    try {
        const pricingKey =
            typeof result.pricingKey === "string" && result.pricingKey.trim().length > 0
                ? result.pricingKey.trim()
                : getProviderPricingKey(result.provider, apiModelId, result.providerModelSlug);

        let card = ctx.pricing?.[pricingKey] ?? null;
        if (!card && pricingKey !== result.provider && apiModelId) {
            card = await loadPriceCard(
                result.provider,
                apiModelId,
                ctx.capability,
            );
        }
		if (!card && apiModelId) {
			// A stable provider-model route was executed. Falling back to the
			// canonical model can mix sibling SKUs and undercharge the request.
			throw new Error(`pricing_card_missing_for_executed_route:${result.provider}:${apiModelId}`);
		}
        if (!card && pricingKey !== result.provider) {
            card = ctx.pricing?.[result.provider] ?? null;
        }

        if (!card) {
            card = await loadPriceCard(result.provider, getBaseModel(ctx.model), ctx.capability);
        }

		const providerAcceptedAtMs = Number(ctx.meta?.upstreamStartMs);
		const cardBoundaryMs = card?.effective_to ? Date.parse(card.effective_to) : Number.NaN;
		if (
			card &&
			Number.isFinite(providerAcceptedAtMs) &&
			Number.isFinite(cardBoundaryMs) &&
			providerAcceptedAtMs >= cardBoundaryMs
		) {
			card = await loadPriceCard(
				result.provider,
				apiModelId ?? card.model ?? getBaseModel(ctx.model),
				ctx.capability,
			);
			if (!card && apiModelId) {
				throw new Error(`pricing_card_missing_for_executed_route:${result.provider}:${apiModelId}`);
			}
		}

        return card;
    } catch (err) {
        console.error("pricing card lookup failed", err);
        if (apiModelId) throw err;
        return null;
    }
}

export function calculatePricing(
    usage: any,
    card: PriceCard | null,
    body: any,
    _tier?: string | null,
    meta?: PipelineContext["meta"] | null
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
            const pricingPlan = derivePricingPlan(body, usage, card);
            const requestOptions = attachBillingTimestamps(
                buildTrustedPricingRequestOptions(body, usage, pricingPlan, card),
                meta,
            );

            // Step 1: Calculate base pricing (provider costs)
            pricedUsage = computeBill(usageMeters ?? {}, card, requestOptions, pricingPlan);

            const pricingInfo = (pricedUsage as any)?.pricing ?? {};
            totalCents = pricingInfo.total_cents ?? 0;
            totalNanos = pricingInfo.total_nanos ?? Math.round(totalCents * 1e7);
            currency = pricingInfo.currency ?? currency;
        } catch (calcErr) {
            console.error("computeBill failed", calcErr);
            throw calcErr;
        }
    }

    return { pricedUsage, totalCents, totalNanos, currency };
}
