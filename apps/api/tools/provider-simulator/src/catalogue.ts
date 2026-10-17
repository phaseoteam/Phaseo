// Purpose: Read routes, capability params and price cards from the catalogue fixtures.
// Why: The simulator must price and route with real catalogue rows, offline.
// How: Loads packages/data/catalog/src/data (the archived catalogue snapshot) and shapes rows like the DB loaders do.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PriceCard, PriceRule } from "@pipeline/pricing/types";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../../../..");
export const CATALOGUE_ROOT = path.join(REPO_ROOT, "packages/data/catalog/src/data");

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

function readJson(file: string): any {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

let routeCache: Map<string, CatalogueRoute[]> | null = null;

export function loadCatalogueRoutes(capability = "text.generate"): Map<string, CatalogueRoute[]> {
	if (routeCache && capability === "text.generate") return routeCache;
	const out = new Map<string, CatalogueRoute[]>();
	const root = path.join(CATALOGUE_ROOT, "api_providers");
	for (const providerId of fs.readdirSync(root)) {
		const file = path.join(root, providerId, "models.json");
		if (!fs.existsSync(file)) continue;
		const rows = readJson(file) as any[];
		const routes: CatalogueRoute[] = [];
		for (const row of rows) {
			const cap = (row.capabilities ?? []).find((entry: any) => entry.capability_id === capability);
			if (!cap) continue;
			routes.push({
				providerId,
				apiModelId: row.api_model_id,
				providerModelSlug: row.provider_model_slug ?? null,
				active: row.is_active_gateway === true && row.routing_status !== "disabled",
				routingStatus: row.routing_status ?? null,
				inputModalities: String(row.input_modalities ?? "text").split(",").map((v: string) => v.trim()).filter(Boolean),
				maxOutputTokens: typeof row.max_output_tokens === "number" ? row.max_output_tokens : null,
				contextLength: typeof row.context_length === "number" ? row.context_length : null,
				capabilityParams: cap.params ?? {},
				capabilityStatus: cap.status ?? null,
				serviceTiers: Array.isArray(row.service_tiers) ? row.service_tiers : [],
			});
		}
		if (routes.length) out.set(providerId, routes);
	}
	if (capability === "text.generate") routeCache = out;
	return out;
}

const NOW = Date.parse("2026-10-17T12:00:00Z");

function ruleIsCurrent(rule: any): boolean {
	const from = rule.effective_from ? Date.parse(rule.effective_from) : Number.NEGATIVE_INFINITY;
	const to = rule.effective_to ? Date.parse(rule.effective_to) : Number.POSITIVE_INFINITY;
	return from <= NOW && NOW < to;
}

let pricingIndex: Map<string, any> | null = null;

function loadPricingIndex(): Map<string, any> {
	if (pricingIndex) return pricingIndex;
	pricingIndex = new Map();
	const root = path.join(CATALOGUE_ROOT, "pricing");
	for (const providerId of fs.readdirSync(root)) {
		const providerDir = path.join(root, providerId);
		if (!fs.statSync(providerDir).isDirectory()) continue;
		for (const modelDir of fs.readdirSync(providerDir)) {
			const modelPath = path.join(providerDir, modelDir);
			if (!fs.statSync(modelPath).isDirectory()) continue;
			for (const capability of fs.readdirSync(modelPath)) {
				const file = path.join(modelPath, capability, "pricing.json");
				if (!fs.existsSync(file)) continue;
				const json = readJson(file);
				const key = `${json.provider_slug ?? json.api_provider_id ?? providerId}:${json.api_model_id}:${json.capability_id ?? capability}`;
				pricingIndex.set(key, json);
			}
		}
	}
	return pricingIndex;
}

/** Builds a PriceCard the way pipeline/pricing/loader.ts does from SKU meter rows. */
export function loadCataloguePriceCard(providerId: string, apiModelId: string, capability = "text.generate"): PriceCard | null {
	const json = loadPricingIndex().get(`${providerId}:${apiModelId}:${capability}`);
	if (!json) return null;
	const rules: PriceRule[] = (json.rules ?? [])
		.filter((rule: any) => ruleIsCurrent(rule) && (rule.currency ?? "USD") === "USD")
		.map((rule: any, index: number) => ({
			id: `${providerId}:${apiModelId}:${index}`,
			pricing_plan: rule.pricing_plan === "fast" ? "priority" : rule.pricing_plan ?? "standard",
			meter: rule.meter,
			unit: rule.unit ?? "token",
			unit_size: Number(rule.unit_size ?? 1),
			price_per_unit: String(rule.price_per_unit ?? 0),
			currency: "USD",
			match: Array.isArray(rule.match) ? rule.match : [],
			priority: Number(rule.priority ?? 100),
			included_quantity: 0,
			billing_timestamp_basis: "request_start",
			time_windows: [],
		}) as PriceRule);
	if (!rules.length) return null;
	return {
		provider: providerId,
		model: apiModelId,
		endpoint: capability,
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: "catalogue-fixture",
		rules,
	} as PriceCard;
}

export function catalogueSnapshotDate(): string {
	return "packages/data/catalog/src/data (archived snapshot; the database owns live rows)";
}
