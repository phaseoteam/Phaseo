// Purpose: Read routes, capability params and price cards from the catalogue database (the v2 tables).
// Why: The simulator must price and route with the same rows production uses; the database is the only source.
// How: loadCatalogue() reads v2_model_provider_routes, v2_route_capabilities, v2_pricing_skus and
//      v2_pricing_sku_meters once per run (SELECTs only) and caches them in memory. The sync accessors below shape
//      those rows like the gateway does (price cards through pipeline/pricing/sku-card.ts, as loadPriceCard does).
//      Credentials: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY, from the environment,
//      apps/api/.dev.vars, apps/api/.env.local or apps/web/.env.local. Without a service-role key the public anon key
//      (NEXT_PUBLIC_SUPABASE_ANON_KEY) is used: row-level security then hides internal and stealth routes and SKUs
//      not in effect now, so future-dated or expired prices are missing from the sweep.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildPriceCardFromSkuRows } from "@pipeline/pricing/sku-card";
import type { PriceCard } from "@pipeline/pricing/types";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../../../..");
const ENV_FILES = ["apps/api/.dev.vars", "apps/api/.env.local", "apps/web/.env.local"].map((file) => path.join(REPO_ROOT, file));

// The simulator replaces global fetch while it captures upstream calls; the catalogue load must never be captured.
const realFetch = globalThis.fetch.bind(globalThis);

export type CatalogueRoute = {
	providerId: string;
	apiModelId: string;
	providerModelSlug: string | null;
	active: boolean;
	routingStatus: string | null;
	inputModalities: string[];
	maxOutputTokens: number | null;
	contextLength: number | null;
	capabilityParams: Record<string, any> | string[];
	capabilityStatus: string | null;
	serviceTiers: string[];
};

export type CatalogueCapabilityRow = {
	capabilityId: string;
	status: string | null;
	params: Record<string, any> | string[];
	maxInputTokens: number | null;
	maxOutputTokens: number | null;
	effectiveFrom: string | null;
	effectiveTo: string | null;
	/** metadata.reasoning, or a `reasoning` entry in params. */
	reasoning: boolean;
};

/** One v2_model_provider_routes row with its v2_route_capabilities rows. */
export type CatalogueRouteRow = {
	/** v2_model_provider_routes.provider_model_id */
	routeId: string;
	providerId: string;
	apiModelId: string;
	providerModelSlug: string | null;
	status: string | null;
	routingEnabled: boolean;
	effectiveFrom: string | null;
	effectiveTo: string | null;
	inputModalities: string[];
	outputModalities: string[];
	contextLength: number | null;
	maxOutputTokens: number | null;
	capabilities: CatalogueCapabilityRow[];
};

export type CatalogueMeterRow = {
	sku_meter_id: string;
	sku_id: string;
	meter_key: string;
	unit: string;
	unit_quantity: number | string | null;
	price_nanos: number | string;
	meter_order: number | null;
	metadata: Record<string, any> | null;
	updated_at: string;
};

/** One active v2_pricing_skus row with its billable meters, in the shape loadPriceCard selects. */
export type CatalogueSkuRow = {
	sku_id: string;
	sku_code: string;
	version: number | null;
	provider_model_id: string;
	operation: string;
	service_tier_slug: string | null;
	status: string;
	currency: string | null;
	effective_from: string;
	effective_to: string | null;
	metadata: Record<string, any> | null;
	updated_at: string;
	meters: CatalogueMeterRow[];
};

export type CatalogueData = {
	/** Supabase host the rows came from. */
	source: string;
	/** Database role that read them; anon sees public rows in effect now only. */
	role: "service_role" | "anon";
	loadedAt: string;
	routes: CatalogueRouteRow[];
	skus: CatalogueSkuRow[];
};

// ---------------------------------------------------------------------------
// Credentials

function readEnvFile(file: string): Record<string, string> {
	if (!fs.existsSync(file)) return {};
	const out: Record<string, string> = {};
	for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
		const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (!match) continue;
		out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
	}
	return out;
}

export function catalogueCredentials(): { url: string; key: string; role: "service_role" | "anon" } | null {
	const files = ENV_FILES.map(readEnvFile);
	const pick = (...names: string[]) => {
		for (const source of [process.env as Record<string, string | undefined>, ...files]) {
			for (const name of names) {
				const value = source[name]?.trim();
				// The simulator runtime sets placeholder Supabase bindings; never treat them as real.
				if (value && !/\.invalid\b|^sim-/.test(value)) return value;
			}
		}
		return null;
	};
	const url = pick("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
	if (!url) return null;
	const serviceKey = pick("SUPABASE_SERVICE_ROLE_KEY");
	if (serviceKey) return { url, key: serviceKey, role: "service_role" };
	const anonKey = pick("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
	return anonKey ? { url, key: anonKey, role: "anon" } : null;
}

// ---------------------------------------------------------------------------
// Loading

const PAGE = 1000;

async function readAll<T>(label: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
	const out: T[] = [];
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await page(from, from + PAGE - 1);
		if (error) throw new Error(`provider simulator: reading ${label} failed: ${error.message}`);
		out.push(...(data ?? []));
		if (!data || data.length < PAGE) return out;
	}
}

function list(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String).map((entry) => entry.trim()).filter(Boolean);
	if (typeof value === "string") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
	return [];
}

function hasReasoning(params: unknown, metadataReasoning: unknown): boolean {
	if (metadataReasoning === true) return true;
	if (Array.isArray(params)) return params.includes("reasoning");
	return Boolean(params && typeof params === "object" && "reasoning" in params);
}

async function fetchCatalogue(): Promise<CatalogueData> {
	const credentials = catalogueCredentials();
	if (!credentials) {
		throw new Error(
			"provider simulator: the catalogue is read from the database, but no credentials were found. " +
			"Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or, for public rows only, " +
			"NEXT_PUBLIC_SUPABASE_ANON_KEY) in the environment, apps/api/.dev.vars, apps/api/.env.local or apps/web/.env.local. " +
			"The unit tests (simulate:providers:test) need no credentials.",
		);
	}
	const db = createClient(credentials.url, credentials.key, {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: realFetch },
	});
	if (credentials.role === "anon") {
		console.warn("[provider-simulator] no SUPABASE_SERVICE_ROLE_KEY: reading the catalogue with the anon key, so only public rows in effect now are visible (no internal or stealth routes, no future-dated or expired SKUs)");
	}

	const [routeRows, capabilityRows, skuRows] = await Promise.all([
		readAll<any>("v2_model_provider_routes", (from, to) => db
			.from("v2_model_provider_routes")
			.select("provider_model_id,provider_slug,model_slug,provider_model_slug,status,routing_enabled,effective_from,effective_to,input_modalities,output_modalities,context_length,max_output_tokens")
			.order("provider_model_id")
			.range(from, to)),
		readAll<any>("v2_route_capabilities", (from, to) => db
			.from("v2_route_capabilities")
			.select("provider_model_id,capability_id,status,params,max_input_tokens,max_output_tokens,effective_from,effective_to,reasoning:metadata->reasoning")
			.order("provider_model_id")
			.order("capability_id")
			.range(from, to)),
		// Every active SKU, whatever its dates: the sweep judges effective dates against its own clock.
		readAll<CatalogueSkuRow>("v2_pricing_skus", (from, to) => db
			.from("v2_pricing_skus")
			.select("sku_id,sku_code,version,provider_model_id,operation,service_tier_slug,status,currency,effective_from,effective_to,metadata,updated_at,meters:v2_pricing_sku_meters(sku_meter_id,sku_id,meter_key,unit,unit_quantity,price_nanos,meter_order,metadata,updated_at)")
			.eq("status", "active")
			.eq("meters.billable", true)
			.order("sku_id")
			.order("meter_order", { referencedTable: "meters", ascending: true })
			.range(from, to) as any),
	]);

	const capabilitiesByRoute = new Map<string, CatalogueCapabilityRow[]>();
	for (const row of capabilityRows) {
		const entries = capabilitiesByRoute.get(row.provider_model_id) ?? [];
		entries.push({
			capabilityId: String(row.capability_id),
			status: row.status ?? null,
			params: row.params && typeof row.params === "object" ? row.params : {},
			maxInputTokens: typeof row.max_input_tokens === "number" ? row.max_input_tokens : null,
			maxOutputTokens: typeof row.max_output_tokens === "number" ? row.max_output_tokens : null,
			effectiveFrom: row.effective_from ?? null,
			effectiveTo: row.effective_to ?? null,
			reasoning: hasReasoning(row.params, row.reasoning),
		});
		capabilitiesByRoute.set(row.provider_model_id, entries);
	}
	const routes: CatalogueRouteRow[] = routeRows.map((row) => ({
		routeId: row.provider_model_id,
		providerId: row.provider_slug,
		apiModelId: row.model_slug,
		providerModelSlug: row.provider_model_slug ?? null,
		status: row.status ?? null,
		routingEnabled: row.routing_enabled === true,
		effectiveFrom: row.effective_from ?? null,
		effectiveTo: row.effective_to ?? null,
		inputModalities: list(row.input_modalities).length ? list(row.input_modalities) : ["text"],
		outputModalities: list(row.output_modalities).length ? list(row.output_modalities) : ["text"],
		contextLength: typeof row.context_length === "number" ? row.context_length : null,
		maxOutputTokens: typeof row.max_output_tokens === "number" ? row.max_output_tokens : null,
		capabilities: capabilitiesByRoute.get(row.provider_model_id) ?? [],
	}));
	return {
		source: new URL(credentials.url).host,
		role: credentials.role,
		loadedAt: new Date().toISOString(),
		routes,
		skus: skuRows.map((sku) => ({ ...sku, meters: sku.meters ?? [] })),
	};
}

let loading: Promise<CatalogueData> | null = null;
let loaded: CatalogueData | null = null;

/** Reads the catalogue from the database once per process. Call (and await) before any accessor below. */
export function loadCatalogue(): Promise<CatalogueData> {
	loading ??= fetchCatalogue().then((data) => {
		loaded = data;
		const active = data.routes.filter((route) => routeIsActive(route)).length;
		console.log(`[provider-simulator] catalogue from ${data.source} as ${data.role}: ${data.routes.length} routes (${active} active), ${data.skus.length} active SKUs`);
		return data;
	}, (error) => {
		loading = null;
		throw error;
	});
	return loading;
}

export function catalogueData(): CatalogueData {
	if (!loaded) throw new Error("provider simulator: the catalogue is not loaded; await loadCatalogue() first (e.g. in beforeAll)");
	return loaded;
}

// ---------------------------------------------------------------------------
// Shaping

function inWindow(from: string | null, to: string | null, nowMs: number): boolean {
	return (!from || Date.parse(from) <= nowMs) && (!to || nowMs < Date.parse(to));
}

/** Served like the public catalogue: not disabled and inside the capability effective window. */
export function capabilityIsServed(capability: CatalogueCapabilityRow, nowMs = Date.now()): boolean {
	return capability.status !== "disabled" && inWindow(capability.effectiveFrom, capability.effectiveTo, nowMs);
}

/** Routable like loadPriceCard's route filter: routing enabled, status active or degraded, in its effective window. */
export function routeIsActive(route: CatalogueRouteRow, nowMs = Date.now()): boolean {
	return route.routingEnabled && (route.status === "active" || route.status === "degraded") && inWindow(route.effectiveFrom, route.effectiveTo, nowMs);
}

let indexes: { routesByModel: Map<string, CatalogueRouteRow[]>; skusByCard: Map<string, CatalogueSkuRow[]> } | null = null;

function index() {
	const data = catalogueData();
	if (indexes) return indexes;
	const routesById = new Map(data.routes.map((route) => [route.routeId, route]));
	const routesByModel = new Map<string, CatalogueRouteRow[]>();
	for (const route of data.routes) {
		const key = `${route.providerId}|${route.apiModelId}`;
		routesByModel.set(key, [...(routesByModel.get(key) ?? []), route]);
	}
	// Keyed like the request-context RPC: provider_slug:model_slug:operation across every route of the model.
	const skusByCard = new Map<string, CatalogueSkuRow[]>();
	for (const sku of data.skus) {
		const route = routesById.get(sku.provider_model_id);
		if (!route) continue;
		const key = `${route.providerId}:${route.apiModelId}:${sku.operation}`;
		skusByCard.set(key, [...(skusByCard.get(key) ?? []), sku]);
	}
	indexes = { routesByModel, skusByCard };
	return indexes;
}

/** Route rows for one provider and model (several when the model has provider-specific slugs). */
export function catalogueRouteRows(providerId: string, apiModelId: string): CatalogueRouteRow[] {
	return index().routesByModel.get(`${providerId}|${apiModelId}`) ?? [];
}

/** Active SKUs (any effective dates) priced for provider:model:operation. */
export function catalogueSkus(providerId: string, apiModelId: string, operation: string): CatalogueSkuRow[] {
	return index().skusByCard.get(`${providerId}:${apiModelId}:${operation}`) ?? [];
}

let routeCache: Map<string, CatalogueRoute[]> | null = null;

export function loadCatalogueRoutes(capability = "text.generate"): Map<string, CatalogueRoute[]> {
	if (routeCache && capability === "text.generate") return routeCache;
	const out = new Map<string, CatalogueRoute[]>();
	const seen = new Set<string>();
	const rows = [...catalogueData().routes].sort((a, b) => Number(routeIsActive(b)) - Number(routeIsActive(a)) || a.routeId.localeCompare(b.routeId));
	for (const row of rows) {
		const cap = row.capabilities.find((entry) => entry.capabilityId === capability);
		if (!cap || !capabilityIsServed(cap)) continue;
		// One entry per provider and model, preferring an active route.
		const key = `${row.providerId}|${row.apiModelId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const routes = out.get(row.providerId) ?? [];
		routes.push({
			providerId: row.providerId,
			apiModelId: row.apiModelId,
			providerModelSlug: row.providerModelSlug,
			active: routeIsActive(row),
			routingStatus: row.status,
			inputModalities: row.inputModalities,
			maxOutputTokens: cap.maxOutputTokens ?? row.maxOutputTokens,
			contextLength: cap.maxInputTokens ?? row.contextLength,
			capabilityParams: cap.params,
			capabilityStatus: cap.status,
			serviceTiers: [...new Set(catalogueSkus(row.providerId, row.apiModelId, capability).map((sku) => sku.service_tier_slug ?? "standard"))].sort(),
		});
		out.set(row.providerId, routes);
	}
	for (const routes of out.values()) routes.sort((a, b) => a.apiModelId.localeCompare(b.apiModelId));
	if (capability === "text.generate") routeCache = out;
	return out;
}

/** Builds the PriceCard loadPriceCard would return now: USD SKUs in effect, billable meters, gateway shaping. */
export function loadCataloguePriceCard(providerId: string, apiModelId: string, capability = "text.generate", nowMs = Date.now()): PriceCard | null {
	const skus = catalogueSkus(providerId, apiModelId, capability)
		.filter((sku) => (sku.currency ?? "USD") === "USD" && inWindow(sku.effective_from, sku.effective_to, nowMs));
	return buildPriceCardFromSkuRows(providerId, apiModelId, capability, skus);
}
