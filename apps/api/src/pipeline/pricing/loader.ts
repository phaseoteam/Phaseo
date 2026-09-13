// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import { getSupabaseAdmin } from "@/runtime/env";
import type { PriceCard, PriceRule, PricingTimeWindow } from "./types";

const PRICING_L1_TTL_MS = 60_000;
const PRICING_L1_NEGATIVE_TTL_MS = 15_000;

type PricingL1Entry = {
    value: PriceCard | null;
    expiresAtMs: number;
};

const pricingL1 = new Map<string, PricingL1Entry>();
const pricingInflight = new Map<string, Promise<PriceCard | null>>();

function pricingCacheKey(provider: string, model: string, endpoint: string, providerModelSlug?: string | null): string {
    return `${provider}:${model}:${endpoint}:${providerModelSlug ?? "*"}`;
}

function readPricingL1(key: string): PriceCard | null | undefined {
    const entry = pricingL1.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= Date.now()) {
        pricingL1.delete(key);
        return undefined;
    }
    return entry.value;
}

function writePricingL1(key: string, value: PriceCard | null, ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
    pricingL1.set(key, {
        value,
        expiresAtMs: Date.now() + ttlMs,
    });
}

function resolvePricingL1TtlMs(card: PriceCard, nowMs: number = Date.now()): number {
    if (!card.effective_to) return PRICING_L1_TTL_MS;
    const effectiveToMs = Date.parse(card.effective_to);
    if (!Number.isFinite(effectiveToMs)) return PRICING_L1_TTL_MS;
    return Math.max(1, Math.min(PRICING_L1_TTL_MS, effectiveToMs - nowMs));
}

export async function loadPriceCard(provider: string, model: string, endpoint: string, providerModelSlug?: string | null): Promise<PriceCard | null> {
    const normalizedProviderModelSlug = providerModelSlug?.trim() || null;
    const cacheKey = pricingCacheKey(provider, model, endpoint, normalizedProviderModelSlug);
    const l1 = readPricingL1(cacheKey);
    if (l1 !== undefined) return l1;

    const inflight = pricingInflight.get(cacheKey);
    if (inflight) return inflight;

    const loader = (async (): Promise<PriceCard | null> => {
        const nowIso = new Date().toISOString();
        const supabase = getSupabaseAdmin();
        // Existing foreign keys let PostgREST fetch the complete pricing graph
        // in one round trip. Keep SKUs without meters for window/version parity.
        let query = supabase
            .from("v2_pricing_skus")
            .select("sku_id,provider_model_id,service_tier_slug,operation,status,currency,effective_from,effective_to,metadata,updated_at,route:v2_model_provider_routes!inner(provider_model_id),meters:v2_pricing_sku_meters(sku_meter_id,sku_id,meter_key,unit,unit_quantity,price_nanos,meter_order,metadata,updated_at)")
            .eq("route.provider_slug", provider)
            .in("route.status", ["active", "degraded"])
            .eq("route.routing_enabled", true)
            .eq("operation", endpoint)
            .eq("status", "active")
            // Wallet debits are USD. Foreign-currency catalog quotes must be
            // converted by an explicit pricing policy before they are executable.
            .eq("currency", "USD")
            .lte("effective_from", nowIso)
            .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
            .eq("meters.billable", true)
            .order("effective_from", { ascending: false })
            .order("meter_order", { referencedTable: "meters", ascending: true });
        query = normalizedProviderModelSlug
            ? query.eq("route.provider_model_slug", normalizedProviderModelSlug)
            : query.or(`model_slug.eq.${JSON.stringify(model)},provider_model_slug.eq.${JSON.stringify(model)}`, { referencedTable: "route" });
        const { data: skuRows, error: skuError } = await query;
        if (skuError) return null;
        if (!skuRows?.length) {
            writePricingL1(cacheKey, null, PRICING_L1_NEGATIVE_TTL_MS);
            return null;
        }
        const meterRows = skuRows.flatMap((row) => row.meters)
            .sort((left, right) => Number(left.meter_order) - Number(right.meter_order));
        if (!meterRows.length) {
            writePricingL1(cacheKey, null, PRICING_L1_NEGATIVE_TTL_MS);
            return null;
        }
        const skuById = new Map(skuRows.map((row) => [String(row.sku_id), row]));

        const normalizeTimeWindows = (value: unknown): PricingTimeWindow[] => {
            if (!Array.isArray(value)) return [];
            return value.map((rawWindow) => {
                const window = rawWindow && typeof rawWindow === "object" ? rawWindow as Record<string, any> : {};
                return {
                    ...window,
                    price_per_unit:
                        window.price_per_unit === undefined || window.price_per_unit === null
                            ? window.price_per_unit
                            : String(window.price_per_unit),
                } as PricingTimeWindow;
            });
        };
        const normalizeIncludedQuantity = (value: unknown): number => {
            const parsed = Number(value ?? 0);
            return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
        };

        const rules: PriceRule[] = (meterRows as any[]).flatMap((meter) => {
            const sku = skuById.get(String(meter.sku_id));
            if (!sku) return [];
            const skuMetadata = sku.metadata && typeof sku.metadata === "object" ? sku.metadata : {};
            const meterMetadata = meter.metadata && typeof meter.metadata === "object" ? meter.metadata : {};
            const priceNanos = Number(meter.price_nanos);
            if (!Number.isFinite(priceNanos)) return [];
            return [{
            id: String(meter.sku_meter_id),
            pricing_plan: sku.service_tier_slug ?? "standard",
            meter: meter.meter_key,
            unit: meter.unit,
            unit_size: Number(meter.unit_quantity ?? 1),
            price_per_unit:
                String(priceNanos / 1_000_000_000),
            currency: sku.currency ?? "USD",
            match: Array.isArray(skuMetadata.match) ? skuMetadata.match : Array.isArray(meterMetadata.match) ? meterMetadata.match : [],
            priority: Number(meterMetadata.priority ?? meter.meter_order ?? 100),
            included_quantity: normalizeIncludedQuantity(
                meterMetadata.included_quantity ?? skuMetadata.included_quantity
            ),
            billing_timestamp_basis: skuMetadata.billing_timestamp_basis ?? "request_start",
            time_windows: normalizeTimeWindows(skuMetadata.time_windows),
        }];
        });

        const version = new Date(
            Math.max(...[...skuRows, ...meterRows].map((r: any) => new Date(r.updated_at).getTime()))
        ).toISOString();
        const effectiveFromValues = skuRows
            .map((r: any) => r.effective_from)
            .filter(Boolean)
            .map((value: string) => new Date(value).getTime())
            .filter((value: number) => Number.isFinite(value));
        const effective_from = effectiveFromValues.length
            ? new Date(Math.min(...effectiveFromValues)).toISOString()
            : null;
        const effToVals = skuRows.map((r: any) => r.effective_to).filter(Boolean);
        const effective_to = effToVals.length
            ? new Date(
                  Math.min(...effToVals.map((x: string) => new Date(x).getTime()))
              ).toISOString()
            : null;

        const card: PriceCard = {
            provider,
            model,
            endpoint,
            effective_from,
            effective_to,
            currency: "USD",
            version,
            rules,
        };
        writePricingL1(cacheKey, card, resolvePricingL1TtlMs(card));
        return card;
    })();

    pricingInflight.set(cacheKey, loader);
    try {
        return await loader;
    } finally {
        pricingInflight.delete(cacheKey);
    }
}

export function __resetPricingLoaderCachesForTests(): void {
    pricingL1.clear();
    pricingInflight.clear();
}
