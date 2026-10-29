// Purpose: Load every active catalogue route (all capabilities) and build its price card the way production does.
// Why: The pricing sweep must price exactly what the gateway would load. src/catalogue.ts loadCataloguePriceCard
//      follows pipeline/pricing/loader.ts (canonical plan names, USD only), but not the request-context RPC that
//      serves most requests (ctx.pricing, gateway_fetch_request_context_without_workspace_budget).
// How: Reads the database rows src/catalogue.ts loaded, keeps SKUs in effect at the sweep clock, and shapes meters
//      like the RPC: plan = service tier slug as stored, priority = meter metadata priority (else meter_order, else
//      100), match, included quantity, billing timestamp basis and time windows kept, currency kept, ordered by
//      priority then effective_from. Rule ids are "<sku_code>@v<version>#<meter_key>" (prefixed with the route id
//      when a card spans several routes), so expectations name a price by its database identity.

import type { PriceCard, PriceRule } from "@pipeline/pricing/types";
import { catalogueData, catalogueSkus, routeIsActive, type CatalogueSkuRow } from "../src/catalogue";

/** The sweep's clock: SIM_PRICING_NOW, else the start of the run's minute. Effective dates are judged against it. */
export const SWEEP_NOW_ISO = process.env.SIM_PRICING_NOW ?? new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
export const SWEEP_NOW_MS = Date.parse(SWEEP_NOW_ISO);

export type SweepRoute = {
	key: string;
	providerId: string;
	apiModelId: string;
	capability: string;
	routingStatus: string | null;
	reasoning: boolean;
	inputModalities: string[];
	serviceTiers: string[];
};

/** One billable meter of an active SKU, whatever its effective dates. */
export type DbRule = {
	id: string;
	sku_code: string;
	meter: string;
	pricing_plan: string;
	currency: string;
	effective_from: string | null;
	effective_to: string | null;
};

export type SweepCard = {
	key: string;
	providerId: string;
	apiModelId: string;
	capability: string;
	/** Routes (v2_model_provider_routes.provider_model_id) whose SKUs make up the card. */
	routeIds: string[];
	/** SKUs ("<sku_code>@v<version>") in effect at SWEEP_NOW. */
	skus: string[];
	/** Every billable meter of every active SKU for the card, in effect or not. */
	dbRules: DbRule[];
	/** Rules current at SWEEP_NOW, shaped like the RPC. */
	rules: PriceRule[];
	/** The card handed to the engine. */
	card: PriceCard;
};

let routesCache: SweepRoute[] | null = null;

/** Active routes (routing enabled, status active or degraded, in effect), one per provider:model:capability. */
export function loadActiveRoutes(): SweepRoute[] {
	if (routesCache) return routesCache;
	const byKey = new Map<string, SweepRoute>();
	for (const row of catalogueData().routes) {
		if (!routeIsActive(row, SWEEP_NOW_MS)) continue;
		for (const capability of row.capabilities) {
			if (capability.status === "disabled") continue;
			const key = `${row.providerId}:${row.apiModelId}:${capability.capabilityId}`;
			if (byKey.has(key)) continue;
			byKey.set(key, {
				key,
				providerId: row.providerId,
				apiModelId: row.apiModelId,
				capability: capability.capabilityId,
				routingStatus: row.status,
				reasoning: capability.reasoning,
				inputModalities: row.inputModalities,
				serviceTiers: [...new Set(catalogueSkus(row.providerId, row.apiModelId, capability.capabilityId).map((sku) => sku.service_tier_slug ?? "standard"))].sort(),
			});
		}
	}
	routesCache = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
	return routesCache;
}

export function ruleIsCurrent(rule: { effective_from?: string | null; effective_to?: string | null }, nowMs = SWEEP_NOW_MS): boolean {
	const from = rule.effective_from ? Date.parse(rule.effective_from) : Number.NEGATIVE_INFINITY;
	const to = rule.effective_to ? Date.parse(rule.effective_to) : Number.POSITIVE_INFINITY;
	return from <= nowMs && nowMs < to;
}

/** "<sku_code>@v<version>", prefixed with the route id when the card spans several routes (codes are unique per route). */
function skuLabel(sku: CatalogueSkuRow, multiRoute: boolean): string {
	return `${multiRoute ? `${sku.provider_model_id}/` : ""}${sku.sku_code}@v${sku.version ?? 1}`;
}

function objectOf(value: unknown): Record<string, any> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

/** Builds the RPC-shaped card for one route, or null when the database has no active SKU for it. */
export function loadSweepCard(providerId: string, apiModelId: string, capability: string): SweepCard | null {
	const skus = catalogueSkus(providerId, apiModelId, capability);
	if (!skus.length) return null;
	const routeIds = [...new Set(skus.map((sku) => sku.provider_model_id))].sort();
	const ruleId = (sku: CatalogueSkuRow, meterKey: string) => `${skuLabel(sku, routeIds.length > 1)}#${meterKey}`;
	const dbRules: DbRule[] = skus.flatMap((sku) => sku.meters.map((meter) => ({
		id: ruleId(sku, meter.meter_key),
		sku_code: sku.sku_code,
		meter: meter.meter_key,
		pricing_plan: sku.service_tier_slug ?? "standard",
		currency: sku.currency ?? "USD",
		effective_from: sku.effective_from ?? null,
		effective_to: sku.effective_to ?? null,
	})));
	const current = skus
		.filter((sku) => ruleIsCurrent(sku))
		.flatMap((sku) => sku.meters.map((meter) => ({ sku, meter })))
		.filter(({ meter }) => Number.isFinite(Number(meter.price_nanos)))
		.map(({ sku, meter }) => {
			const priority = Number(objectOf(meter.metadata).priority ?? meter.meter_order ?? 100);
			return { sku, meter, priority: Number.isFinite(priority) ? priority : 100 };
		})
		// RPC: order by priority desc, coalesce(effective_from, now()) desc. Then by id, so runs are stable.
		.sort((a, b) =>
			b.priority - a.priority ||
			(Date.parse(b.sku.effective_from ?? SWEEP_NOW_ISO) - Date.parse(a.sku.effective_from ?? SWEEP_NOW_ISO)) ||
			ruleId(a.sku, a.meter.meter_key).localeCompare(ruleId(b.sku, b.meter.meter_key)),
		);
	const rules: PriceRule[] = current.map(({ sku, meter, priority }) => {
		const skuMetadata = objectOf(sku.metadata);
		const meterMetadata = objectOf(meter.metadata);
		return {
			id: ruleId(sku, meter.meter_key),
			pricing_plan: sku.service_tier_slug ?? "standard",
			meter: meter.meter_key,
			unit: meter.unit ?? "token",
			unit_size: Number(meter.unit_quantity ?? 1),
			price_per_unit: String(Number(meter.price_nanos) / 1_000_000_000),
			currency: sku.currency ?? "USD",
			match: Array.isArray(skuMetadata.match) ? skuMetadata.match : Array.isArray(meterMetadata.match) ? meterMetadata.match : [],
			priority,
			included_quantity: Math.max(0, Number(meterMetadata.included_quantity ?? skuMetadata.included_quantity ?? 0) || 0),
			billing_timestamp_basis: skuMetadata.billing_timestamp_basis ?? "request_start",
			time_windows: Array.isArray(skuMetadata.time_windows)
				? skuMetadata.time_windows.map((window: any) => ({
					...window,
					price_per_unit: window.price_per_unit === undefined || window.price_per_unit === null ? window.price_per_unit : String(window.price_per_unit),
				}))
				: [],
		} as PriceRule;
	});
	const currentSkus = [...new Map(current.map(({ sku }) => [sku.sku_id, sku])).values()];
	const froms = currentSkus.map((sku) => sku.effective_from).filter(Boolean).map((value) => Date.parse(value));
	const tos = currentSkus.map((sku) => sku.effective_to).filter((value): value is string => Boolean(value)).map((value) => Date.parse(value));
	return {
		key: `${providerId}:${apiModelId}:${capability}`,
		providerId,
		apiModelId,
		capability,
		routeIds,
		skus: currentSkus.map((sku) => skuLabel(sku, routeIds.length > 1)).sort(),
		dbRules,
		rules,
		card: {
			provider: providerId,
			model: apiModelId,
			endpoint: capability,
			effective_from: froms.length ? new Date(Math.min(...froms)).toISOString() : null,
			effective_to: tos.length ? new Date(Math.min(...tos)).toISOString() : null,
			currency: "USD",
			version: `db:${SWEEP_NOW_ISO}`,
			rules,
		} as PriceCard,
	};
}
