// src/routes/v1/control/pricing.ts
// Purpose: Control-plane route handler for pricing operations.
// Why: Separates admin/control traffic from data-plane requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { json, withRuntime, cacheHeaders } from "@/routes/utils";
import type { PriceCard } from "@pipeline/pricing/types";
import { requireCapability } from "./route-helpers";
import { selectAllRows } from "./models.catalogue";

type PricingModel = {
    provider: string;
    model: string;
    endpoint: string;
    display_name?: string;
    meters: Array<{
        meter: string;
        unit: string;
        unit_size: number;
        price_per_unit: string;
        currency: string;
        conditions?: any[];
        billing_timestamp_basis?: string;
        time_windows?: any[];
    }>;
};

type PriceMetadata = { match?: unknown[]; billing_timestamp_basis?: string; time_windows?: unknown[] };
type RouteRow = { provider_model_id: string; provider_slug: string; model_slug: string };
type ModelRow = { model_slug: string; name: string; hidden: boolean | null; status: string | null };
type SkuRow = {
    sku_id: string; provider_model_id: string; operation: string; service_tier_slug: string | null;
    currency: string | null; metadata: PriceMetadata | null;
};
type MeterRow = {
    sku_meter_id: string; sku_id: string; meter_key: string; unit: string; unit_quantity: number | null;
    price_nanos: number | string; metadata: PriceMetadata | null; meter_order: number | null;
};

const PRICING_METER_QUERY_BATCH_SIZE = 200;

async function handlePricingModels(req: Request) {
    const auth = await guardAuth(req, { allowOAuthJwt: true });
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }
    const scopeError = requireCapability(auth.value, CAPABILITIES.PRICING_READ);
    if (scopeError) return scopeError;

    try {
        const supabase = getSupabaseAdmin();
        const nowIso = new Date().toISOString();
        // Each table is larger than one PostgREST page, so every read pages to the end.
        const [routeRows, modelRows, skuRows] = await Promise.all([
            selectAllRows<RouteRow>("v2_model_provider_routes", [{ column: "provider_model_id" }], () => supabase.from("v2_model_provider_routes")
                .select("provider_model_id,provider_slug,model_slug")
                .eq("routing_enabled", true).in("status", ["active", "degraded"])),
            selectAllRows<ModelRow>("v2_models", [{ column: "model_slug" }], () => supabase.from("v2_models")
                .select("model_slug,name,hidden,status")),
            selectAllRows<SkuRow>("v2_pricing_skus", [{ column: "sku_id" }], () => supabase.from("v2_pricing_skus")
                .select("sku_id,provider_model_id,operation,service_tier_slug,currency,metadata")
                .eq("status", "active").lte("effective_from", nowIso)
                .or(`effective_to.is.null,effective_to.gt.\"${nowIso}\"`)),
        ]);
        const routes = new Map(routeRows.map((route) => [route.provider_model_id, route]));
        const models = new Map(modelRows
            .filter((model) => !model.hidden && model.status !== "disabled" && model.status !== "retired")
            .map((model) => [model.model_slug, model]));
        // Most active SKUs belong to routes that are not served or to hidden models; skip their meters.
        const listedSkus = skuRows.filter((sku) => models.has(routes.get(sku.provider_model_id)?.model_slug ?? ""));
        const skuIds = listedSkus.map((sku) => sku.sku_id);
        const meterRows: MeterRow[] = [];
        for (let index = 0; index < skuIds.length; index += PRICING_METER_QUERY_BATCH_SIZE) {
            const batch = skuIds.slice(index, index + PRICING_METER_QUERY_BATCH_SIZE);
            meterRows.push(...await selectAllRows<MeterRow>("v2_pricing_sku_meters", [{ column: "sku_meter_id" }], () => supabase.from("v2_pricing_sku_meters")
                .select("sku_meter_id,sku_id,meter_key,unit,unit_quantity,price_nanos,metadata,meter_order")
                .in("sku_id", batch)
                .eq("billable", true)));
        }
        meterRows.sort((a, b) => Number(a.meter_order ?? 0) - Number(b.meter_order ?? 0));

        const skuById = new Map(listedSkus.map((sku) => [sku.sku_id, sku]));
        const modelMap = new Map<string, PricingModel>();
        for (const meter of meterRows) {
            const sku = skuById.get(meter.sku_id);
            const route = sku ? routes.get(sku.provider_model_id) : null;
            const model = route ? models.get(route.model_slug) : null;
            if (!sku || !route || !model) continue;
            const capabilityId = sku.operation;
            const key = `${route.provider_slug}:${route.model_slug}:${capabilityId}:${sku.service_tier_slug || "standard"}`;

            if (!modelMap.has(key)) {
                modelMap.set(key, {
                    provider: route.provider_slug,
                    model: route.model_slug,
                    endpoint: capabilityId,
                    display_name: model.name,
                    meters: [],
                });
            }

            const metadata: PriceMetadata = meter.metadata && typeof meter.metadata === "object" ? meter.metadata : {};
            const skuMetadata: PriceMetadata = sku.metadata && typeof sku.metadata === "object" ? sku.metadata : {};
            modelMap.get(key)!.meters.push({
                meter: meter.meter_key,
                unit: meter.unit,
                unit_size: Number(meter.unit_quantity ?? 1),
                price_per_unit: String(Number(meter.price_nanos) / 1_000_000_000),
                currency: sku.currency ?? "USD",
                conditions: Array.isArray(skuMetadata.match) ? skuMetadata.match : Array.isArray(metadata.match) ? metadata.match : [],
                billing_timestamp_basis: skuMetadata.billing_timestamp_basis ?? "request_start",
                time_windows: Array.isArray(skuMetadata.time_windows) ? skuMetadata.time_windows : [],
            });
        }

        const pricingModels = Array.from(modelMap.values());

        // Sort by provider, then model
        pricingModels.sort((a, b) => {
            if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
            if (a.model !== b.model) return a.model.localeCompare(b.model);
            return a.endpoint.localeCompare(b.endpoint);
        });

        const cacheOptions = {
            scope: `pricing-models:${auth.value.workspaceId}`,
            ttlSeconds: 300,
            staleSeconds: 600,
        };
        const response = json(
            { ok: true, models: pricingModels },
            200,
            cacheHeaders(cacheOptions)
        );
        return response;
    } catch (error: any) {
        console.error("[gateway/pricing] model catalogue query failed", {
            message: String(error?.message ?? error),
        });
        return json(
            { ok: false, error: "failed", message: "Pricing catalogue is temporarily unavailable" },
            500,
            { "Cache-Control": "no-store" }
        );
    }
}

async function handlePricingCalculate(req: Request) {
    const auth = await guardAuth(req, { useKvCache: false, allowOAuthJwt: true });
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }
    const scopeError = requireCapability(auth.value, CAPABILITIES.PRICING_READ);
    if (scopeError) return scopeError;

    try {
        const body = await req.json();
        const {
            provider,
            model,
            endpoint,
            usage,
            request_started_at,
            provider_accepted_at,
            completed_at,
        } = body;

        if (!provider || !model || !endpoint || !usage) {
            return json(
                { ok: false, error: "missing_required_fields", message: "provider, model, endpoint, and usage are required" },
                400
            );
        }

        // Load the price card
        const { loadPriceCard } = await import("@pipeline/pricing/loader");
        const { computeBillSummary } = await import("@pipeline/pricing/engine");

        const card = await loadPriceCard(provider, model, endpoint);
        if (!card) {
            return json(
                { ok: false, error: "pricing_not_found", message: "No pricing data found for this model" },
                404
            );
        }

        // Calculate pricing
        const pricingOptions: Record<string, unknown> = {};
        if (request_started_at != null) pricingOptions.request_started_at = request_started_at;
        if (provider_accepted_at != null) pricingOptions.provider_accepted_at = provider_accepted_at;
        if (completed_at != null) pricingOptions.completed_at = completed_at;

        const result = computeBillSummary(
            usage,
            card,
            pricingOptions,
            "standard",
        );

        return json(
            { ok: true, pricing: result },
            200,
            { "Cache-Control": "no-store" }
        );
    } catch (error: any) {
        return json(
            { ok: false, error: "calculation_failed", message: String(error?.message ?? error) },
            500,
            { "Cache-Control": "no-store" }
        );
    }
}

export const pricingRoutes = new Hono<Env>();

pricingRoutes.get("/models", withRuntime(handlePricingModels));
pricingRoutes.post("/calculate", withRuntime(handlePricingCalculate));








