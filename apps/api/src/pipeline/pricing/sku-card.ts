// Purpose: Shape v2 pricing SKU rows into the price card the engine prices with.
// Why: loadPriceCard and the provider simulator must build cards from the same rows the same way.
// How: Orders SKUs and meters, maps each billable meter to a PriceRule, and derives the card's window and version.

import type { PriceCard, PriceRule, PricingTimeWindow } from "./types";
import { canonicalPricingPlan } from "./service-tiers";

/**
 * Shapes active SKU rows (each with its billable `meters`) into a price card, as loadPriceCard does.
 * Kept out of loader.ts so tools/provider-simulator can shape rows it loads in bulk without importing the loader.
 */
export function buildPriceCardFromSkuRows(provider: string, model: string, endpoint: string, rawSkuRows: any[]): PriceCard | null {
    const skuRows = [...rawSkuRows]
        .sort((left: any, right: any) => Date.parse(right.effective_from) - Date.parse(left.effective_from));
    if (!skuRows.length) return null;
    const meterRows = skuRows.flatMap((row) => row.meters)
        .sort((left, right) => Number(left.meter_order) - Number(right.meter_order));
    if (!meterRows.length) return null;
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
            pricing_plan: canonicalPricingPlan(sku.service_tier_slug),
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

    return {
        provider,
        model,
        endpoint,
        effective_from,
        effective_to,
        currency: "USD",
        version,
        rules,
    };
}
