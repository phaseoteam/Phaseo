// Purpose: Load every active catalogue route (all capabilities) and build its price card the way production does.
// Why: The pricing sweep must price exactly what the gateway would load. src/catalogue.ts is simplified: it drops
//      time windows, included quantities and billing timestamp bases, maps the "fast" plan to "priority" and filters
//      non-USD rules, which is what pipeline/pricing/loader.ts does, but not the request-context RPC that serves
//      most requests (ctx.pricing, gateway_fetch_request_context_without_workspace_budget.sql).
// How: Reads packages/data/catalog/src/data, keeps rules current at the sweep's clock, and shapes them like the RPC:
//      plan = service tier slug as stored, priority = metadata priority (else 100), match, included quantity,
//      billing timestamp basis and time windows kept, currency kept, ordered by priority then effective_from.

import fs from "node:fs";
import path from "node:path";
import type { PriceCard, PriceRule } from "@pipeline/pricing/types";
import { CATALOGUE_ROOT } from "../src/catalogue";

/** The sweep's clock. Effective dates are judged against it, so runs are deterministic. */
export const SWEEP_NOW_ISO = process.env.SIM_PRICING_NOW ?? "2026-10-18T12:00:00.000Z";
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

export type FixtureRule = Record<string, any>;

export type SweepCard = {
	key: string;
	providerId: string;
	apiModelId: string;
	capability: string;
	/** Path relative to the repository root. */
	file: string;
	/** Every rule in the fixture, in file order. Index = position in this array. */
	fixtureRules: FixtureRule[];
	/** Rules current at SWEEP_NOW, shaped like the RPC. `id` is "#<fixture index>". */
	rules: PriceRule[];
	/** The card handed to the engine. */
	card: PriceCard;
	/** Card-level fields the engine has no notion of (minimum_charge, billing_granularity, ...). */
	unsupportedCardFields: Record<string, unknown>;
};

function readJson(file: string): any {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

let routesCache: SweepRoute[] | null = null;

/** Active routes (is_active_gateway and routing_status not disabled), one per provider:model:capability. */
export function loadActiveRoutes(): SweepRoute[] {
	if (routesCache) return routesCache;
	const root = path.join(CATALOGUE_ROOT, "api_providers");
	const byKey = new Map<string, SweepRoute>();
	for (const providerId of fs.readdirSync(root).sort()) {
		const file = path.join(root, providerId, "models.json");
		if (!fs.existsSync(file)) continue;
		for (const row of readJson(file) as any[]) {
			if (!(row.is_active_gateway === true && row.routing_status !== "disabled")) continue;
			for (const capability of row.capabilities ?? []) {
				const key = `${providerId}:${row.api_model_id}:${capability.capability_id}`;
				if (byKey.has(key)) continue;
				byKey.set(key, {
					key,
					providerId,
					apiModelId: row.api_model_id,
					capability: capability.capability_id,
					routingStatus: row.routing_status ?? null,
					reasoning: capability.reasoning === true,
					inputModalities: String(row.input_modalities ?? "text").split(",").map((v: string) => v.trim()).filter(Boolean),
					serviceTiers: Array.isArray(row.service_tiers) ? row.service_tiers : [],
				});
			}
		}
	}
	routesCache = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
	return routesCache;
}

let fixtureIndex: Map<string, { json: any; file: string }> | null = null;

function loadFixtureIndex() {
	if (fixtureIndex) return fixtureIndex;
	fixtureIndex = new Map();
	const root = path.join(CATALOGUE_ROOT, "pricing");
	const repoRoot = path.resolve(CATALOGUE_ROOT, "../../../../..");
	for (const providerDir of fs.readdirSync(root).sort()) {
		const providerPath = path.join(root, providerDir);
		if (!fs.statSync(providerPath).isDirectory()) continue;
		for (const modelDir of fs.readdirSync(providerPath).sort()) {
			const modelPath = path.join(providerPath, modelDir);
			if (!fs.statSync(modelPath).isDirectory()) continue;
			for (const capabilityDir of fs.readdirSync(modelPath).sort()) {
				const file = path.join(modelPath, capabilityDir, "pricing.json");
				if (!fs.existsSync(file)) continue;
				const json = readJson(file);
				const key = `${json.provider_slug ?? json.api_provider_id ?? providerDir}:${json.api_model_id}:${json.capability_id ?? capabilityDir}`;
				fixtureIndex.set(key, { json, file: path.relative(repoRoot, file).split(path.sep).join("/") });
			}
		}
	}
	return fixtureIndex;
}

export function ruleIsCurrent(rule: FixtureRule, nowMs = SWEEP_NOW_MS): boolean {
	const from = rule.effective_from ? Date.parse(rule.effective_from) : Number.NEGATIVE_INFINITY;
	const to = rule.effective_to ? Date.parse(rule.effective_to) : Number.POSITIVE_INFINITY;
	return from <= nowMs && nowMs < to;
}

const CARD_FIELDS_THE_ENGINE_READS = new Set([
	"key", "api_provider_id", "provider_slug", "api_model_id", "capability_id", "rules", "regions", "service_tiers",
	"sources", "verification", "effective_to",
]);

/** Builds the RPC-shaped card for one route, or null when the fixture has no card for it. */
export function loadSweepCard(providerId: string, apiModelId: string, capability: string): SweepCard | null {
	const entry = loadFixtureIndex().get(`${providerId}:${apiModelId}:${capability}`);
	if (!entry) return null;
	const fixtureRules: FixtureRule[] = Array.isArray(entry.json.rules) ? entry.json.rules : [];
	const current = fixtureRules
		.map((rule, index) => ({ rule, index }))
		.filter(({ rule }) => ruleIsCurrent(rule))
		// RPC: order by priority desc, coalesce(effective_from, now()) desc.
		.sort((a, b) =>
			Number(b.rule.priority ?? 100) - Number(a.rule.priority ?? 100) ||
			(Date.parse(b.rule.effective_from ?? SWEEP_NOW_ISO) - Date.parse(a.rule.effective_from ?? SWEEP_NOW_ISO)) ||
			a.index - b.index,
		);
	const rules: PriceRule[] = current.map(({ rule, index }) => ({
		id: `#${index}`,
		pricing_plan: rule.pricing_plan ?? "standard",
		meter: rule.meter,
		unit: rule.unit ?? "token",
		unit_size: Number(rule.unit_size ?? 1),
		price_per_unit: String(rule.price_per_unit ?? 0),
		currency: rule.currency ?? "USD",
		match: Array.isArray(rule.match) && rule.match.length ? rule.match : Array.isArray(rule.conditions) ? rule.conditions : [],
		priority: Number(rule.priority ?? 100),
		included_quantity: Math.max(0, Number(rule.included_quantity ?? 0) || 0),
		billing_timestamp_basis: rule.billing_timestamp_basis ?? "request_start",
		time_windows: Array.isArray(rule.time_windows)
			? rule.time_windows.map((window: any) => ({
				...window,
				price_per_unit: window.price_per_unit === undefined || window.price_per_unit === null ? window.price_per_unit : String(window.price_per_unit),
			}))
			: [],
	}) as PriceRule);
	const froms = current.map(({ rule }) => rule.effective_from).filter(Boolean).map((v: string) => Date.parse(v));
	const tos = current.map(({ rule }) => rule.effective_to).filter(Boolean).map((v: string) => Date.parse(v));
	const unsupportedCardFields: Record<string, unknown> = {};
	for (const [field, value] of Object.entries(entry.json)) {
		if (!CARD_FIELDS_THE_ENGINE_READS.has(field) && value !== null && value !== undefined) unsupportedCardFields[field] = value;
	}
	return {
		key: `${providerId}:${apiModelId}:${capability}`,
		providerId,
		apiModelId,
		capability,
		file: entry.file,
		fixtureRules,
		rules,
		card: {
			provider: providerId,
			model: apiModelId,
			endpoint: capability,
			effective_from: froms.length ? new Date(Math.min(...froms)).toISOString() : null,
			effective_to: tos.length ? new Date(Math.min(...tos)).toISOString() : null,
			currency: "USD",
			version: "catalogue-fixture",
			rules,
		} as PriceCard,
		unsupportedCardFields,
	};
}
