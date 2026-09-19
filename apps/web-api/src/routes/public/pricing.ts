import { Hono } from "hono";
import { PUBLIC_LIVE_DATA_CACHE } from "@/cache/publicLiveData";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

export const publicPricingRouter = new Hono<{ Bindings: Env }>();

const POSTGREST_IN_CHUNK_SIZE = 100;
const PROVIDER_ROUTE_PAGE_SIZE = 1_000;
const PROVIDER_ROUTE_MAX_ROWS = 5_000;

function chunks<T>(values: T[]): T[][] {
	const result: T[][] = [];
	for (let index = 0; index < values.length; index += POSTGREST_IN_CHUNK_SIZE) {
		result.push(values.slice(index, index + POSTGREST_IN_CHUNK_SIZE));
	}
	return result;
}

function rowsOrThrow<T extends Record<string, unknown>>(
	results: Array<{ data: T[] | null; error: unknown }>,
): T[] {
	const error = results.find((result) => result.error)?.error;
	if (error) throw error;
	return results.flatMap((result) => result.data ?? []);
}

publicPricingRouter.get("/pricing/models", async (c) => {
	try {
		const queryKeys = [...new URL(c.req.url).searchParams.keys()];
		if (queryKeys.some((key) => key !== "model_ids")) {
			return c.json({ error: "unsupported_query_parameter" }, 400);
		}
		const client = getDataClient(c.env); const now = Date.now();
		const requestedModelIds = [...new Set(
			(c.req.query("model_ids") ?? "")
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
		)].slice(0, 100);
		const active = (row: Record<string, unknown>) => { const from = row.effective_from ? Date.parse(String(row.effective_from)) : Number.NEGATIVE_INFINITY; const to = row.effective_to ? Date.parse(String(row.effective_to)) : Number.POSITIVE_INFINITY; return now >= from && now < to; };
		const providerRows: Array<Record<string, unknown>> = [];
		for (let offset = 0; offset < PROVIDER_ROUTE_MAX_ROWS; offset += PROVIDER_ROUTE_PAGE_SIZE) {
			const isFinalAllowedPage = offset + PROVIDER_ROUTE_PAGE_SIZE >= PROVIDER_ROUTE_MAX_ROWS;
			let query = client
				.from("v2_model_provider_routes")
				.select("provider_model_id,provider_slug,provider_model_slug,model_slug,routing_enabled,status,effective_from,effective_to")
				.eq("is_stealth", false)
				.eq("routing_enabled", true)
				.in("status", ["active", "degraded"]);
			if (requestedModelIds.length > 0) query = query.in("model_slug", requestedModelIds);
			const providerResult = await query
				.order("provider_model_id", { ascending: true })
				.range(offset, isFinalAllowedPage ? PROVIDER_ROUTE_MAX_ROWS : offset + PROVIDER_ROUTE_PAGE_SIZE - 1);
			if (providerResult.error) throw providerResult.error;
			const page = (providerResult.data ?? []) as Array<Record<string, unknown>>;
			if (isFinalAllowedPage && page.length > PROVIDER_ROUTE_PAGE_SIZE) {
				throw new Error("provider_route_catalogue_limit_exceeded");
			}
			providerRows.push(...page.slice(0, PROVIDER_ROUTE_PAGE_SIZE).filter(active));
			if (page.length < PROVIDER_ROUTE_PAGE_SIZE) break;
		}
		const routeIds = providerRows.map((row) => String(row.provider_model_id ?? "")).filter(Boolean);
		const modelIds = [...new Set(providerRows.map((row) => String(row.model_slug ?? "")).filter(Boolean))];
		const [modelResults, skuResults] = await Promise.all([
			Promise.all(chunks(modelIds).map((ids) => client.from("v2_models").select("model_slug,name,released_at,announced_at").in("model_slug", ids).eq("hidden", false).neq("status", "disabled"))),
			Promise.all(chunks(routeIds).map((ids) => client.from("v2_pricing_skus").select("sku_id,provider_model_id,operation,service_tier_slug,currency,status,effective_from,effective_to,metadata").in("provider_model_id", ids).neq("status", "disabled"))),
		]);
		const modelRows = rowsOrThrow(modelResults);
		const visible = new Map(modelRows.map((row) => [row.model_slug, row]));
		const routeById = new Map(providerRows.map((row) => [String(row.provider_model_id), row]));
		const skus = rowsOrThrow(skuResults).filter(active);
		const skuIds = skus.map((row) => String(row.sku_id));
		const meterResults = await Promise.all(chunks(skuIds).map((ids) => client.from("v2_pricing_sku_meters").select("sku_id,meter_key,unit,unit_quantity,price_nanos,metadata").in("sku_id", ids)));
		const meterRows = rowsOrThrow(meterResults);
		const skuById = new Map(skus.map((row) => [String(row.sku_id), row]));
		const result = new Map<string, Record<string, any>>();
		for (const row of meterRows) { const sku = skuById.get(String(row.sku_id)); const route = sku ? routeById.get(String(sku.provider_model_id)) : null; const model = route ? visible.get(String(route.model_slug)) : null; const priceNanos = Number(row.price_nanos); if (!sku || !route || !model || !Number.isFinite(priceNanos)) continue; const provider = String(route.provider_slug); const modelId = String(route.model_slug); const endpoint = String(sku.operation ?? "inference"); const pricingPlan = String(sku.service_tier_slug ?? "standard"); const groupKey = `${provider}:${modelId}:${endpoint}:${pricingPlan}`; const skuMetadata = sku.metadata && typeof sku.metadata === "object" && !Array.isArray(sku.metadata) ? sku.metadata as Record<string, unknown> : {}; const group = result.get(groupKey) ?? { provider, model: modelId, api_model_id: route.provider_model_slug, endpoint, display_name: model.name ?? undefined, release_date: model.released_at ?? null, announcement_date: model.announced_at ?? null, pricing_plan: pricingPlan, meters: [] }; const meter = { meter: String(row.meter_key ?? ""), unit: String(row.unit ?? ""), unit_size: Number(row.unit_quantity ?? 1), price_per_unit: String(priceNanos / 1_000_000_000), currency: String(sku.currency ?? "USD"), conditions: Array.isArray(skuMetadata.match) ? skuMetadata.match : [], billing_timestamp_basis: skuMetadata.billing_timestamp_basis ?? "request_start", time_windows: Array.isArray(skuMetadata.time_windows) ? skuMetadata.time_windows : [] }; group.meters.push(meter); result.set(groupKey, group); }
		const models = [...result.values()].sort((a, b) => String(a.provider).localeCompare(String(b.provider)) || String(a.model).localeCompare(String(b.model)) || String(a.endpoint).localeCompare(String(b.endpoint)));
		return withPublicCache(c.json({ models }), { ...PUBLIC_LIVE_DATA_CACHE, cacheTags: ["web-api-pricing-models"] });
	} catch (error) { console.error("[web-api/pricing] models failed", error); return c.json({ error: "pricing_models_unavailable" }, 503); }
});
