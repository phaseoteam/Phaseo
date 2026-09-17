import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { resolveVertexAccessToken } from "@providers/google-vertex/auth";
import {
	buildInternalModelWebhookPayload,
	sendDiscordTextMessage,
	sendDiscordWebhookPayload,
	type InternalModelNotificationModel,
} from "./discord";
import { sendSlackWebhookMessage } from "./slack";
import {
	extractProviderApiModelSnapshot,
	hasProviderApiSnapshotValue,
	normalizeJson,
	supplementalProviderPricing,
	toNullableInteger,
	toPricingFingerprint,
	type ProviderApiModelSnapshot,
} from "./watch-snapshot";
import type { ProviderConfig } from "./providers";

export {
	extractProviderApiModelSnapshot,
	hasProviderApiSnapshotValue,
	normalizeJson,
	toNullableInteger,
	toProviderApiPricingFingerprint,
	toPricingFingerprint,
	type ProviderApiModelSnapshot,
} from "./watch-snapshot";

type DiscoveryTrigger = "scheduled" | "manual";

type RunArgs = {
	trigger: DiscoveryTrigger;
	source: string;
	scheduledAtIso?: string;
	shardIndex?: number;
	shardCount?: number;
	notify?: boolean;
	prune?: boolean;
};

type ProviderChange = {
	providerId: string;
	providerName: string;
	previousCount: number;
	currentCount: number;
	added: string[];
	removed: string[];
};

type DiscoveredModel = {
	id: string;
	modelDetails: Record<string, unknown>;
	pricingDetails: unknown | null;
};

type PricingRuleRow = {
	rule_id: string | null;
	provider_id: string | null;
	api_model_id: string | null;
	capability_id: string | null;
	pricing_plan: string | null;
	meter: string | null;
	price_per_unit: number | string | null;
	currency: string | null;
	effective_from: string | null;
	effective_to: string | null;
	updated_at: string | null;
};

async function loadV2PricingRows(): Promise<PricingRuleRow[]> {
	const supabase = getSupabaseAdmin();
	const routes: Array<{ provider_model_id: string; provider_slug: string; model_slug: string }> = [];
	for (let offset = 0; ; offset += 1000) {
		const { data, error } = await supabase
			.from("v2_model_provider_routes")
			.select("provider_model_id,provider_slug,model_slug")
			.range(offset, offset + 999);
		if (error) throw new Error(error.message || "Failed to load V2 pricing routes");
		routes.push(...((data ?? []) as typeof routes));
		if (!data || data.length < 1000) break;
	}
	const routeById = new Map(routes.map((route) => [route.provider_model_id, route]));
	const skus: Array<Record<string, any>> = [];
	for (let offset = 0; ; offset += 1000) {
		const { data, error } = await supabase
			.from("v2_pricing_skus")
			.select("sku_id,provider_model_id,operation,service_tier_slug,currency,effective_from,effective_to,updated_at")
			.range(offset, offset + 999);
		if (error) throw new Error(error.message || "Failed to load V2 pricing SKUs");
		skus.push(...(data ?? []));
		if (!data || data.length < 1000) break;
	}
	const meters: Array<Record<string, any>> = [];
	for (let offset = 0; ; offset += 1000) {
		const { data, error } = await supabase
			.from("v2_pricing_sku_meters")
			.select("sku_meter_id,sku_id,meter_key,unit,unit_quantity,price_nanos,meter_order,updated_at,created_at,billable")
			.eq("billable", true)
			.range(offset, offset + 999);
		if (error) throw new Error(error.message || "Failed to load V2 pricing meters");
		meters.push(...(data ?? []));
		if (!data || data.length < 1000) break;
	}
	const skuById = new Map(skus.map((sku) => [sku.sku_id, sku]));
	return meters.flatMap((meter) => {
		const sku = skuById.get(meter.sku_id);
		const route = sku ? routeById.get(sku.provider_model_id) : null;
		if (!sku || !route) return [];
		const updatedAt = Math.max(Date.parse(String(sku.updated_at ?? 0)), Date.parse(String(meter.updated_at ?? meter.created_at ?? 0)));
		return [{
			rule_id: String(meter.sku_meter_id),
			provider_id: route.provider_slug,
			api_model_id: route.model_slug,
			capability_id: sku.operation,
			pricing_plan: sku.service_tier_slug ?? "standard",
			meter: meter.meter_key,
			price_per_unit: Number(meter.price_nanos) / 1_000_000_000,
			currency: sku.currency,
			effective_from: sku.effective_from ?? null,
			effective_to: sku.effective_to ?? null,
			updated_at: Number.isFinite(updatedAt) ? new Date(updatedAt).toISOString() : null,
		} satisfies PricingRuleRow];
	});
}

type PricingProviderChange = {
	providerId: string;
	updates: number;
	samples: string[];
};

type PricingCursor = {
	updatedAt: string;
	ruleIdsAtTimestamp: string[];
};

type PricingMonitorSummary = {
	enabled: boolean;
	executed: boolean;
	baselineInitialized: boolean;
	cursorUpdatedAt: string | null;
	ruleIdsAtTimestamp?: string[];
	updatesDetected: number;
	providersChanged: number;
	providerChanges: PricingProviderChange[];
	error?: string | null;
};

type ProviderApiPricingMonitorSummary = {
	enabled: boolean;
	executed: boolean;
	baselineInitialized: boolean;
	modelsWithPricing: number;
	updatesDetected: number;
	providersChanged: number;
	providerChanges: PricingProviderChange[];
	error?: string | null;
};

type PricingTableMonitorSummary = {
	enabled: boolean;
	executed: boolean;
	sourcesChecked: number;
	updatesDetected: number;
	providerChanges: Array<{
		providerId: string;
		providerName: string;
		sourceUrl: string;
		tableCount: number;
		pricingSamples: string[];
		addedSamples?: string[];
		removedSamples?: string[];
	}>;
	errors: string[];
	error?: string | null;
};

type ConfiguredModelCoverageMonitorSummary = {
	enabled: boolean;
	executed: boolean;
	providersChecked: number;
	updatesDetected: number;
	providersChanged: number;
	providerChanges: PricingProviderChange[];
	fingerprint: string | null;
	error?: string | null;
};

type ConfiguredModelCoverageState = {
	fingerprint: string | null;
	fallbackFingerprint: string | null;
};

const DISCORD_PROVIDER_FAMILIES: Record<string, { providerId: string; providerName: string }> = {
	anthropic: { providerId: "anthropic", providerName: "Anthropic" },
	"anthropic-us": { providerId: "anthropic", providerName: "Anthropic" },
	"google-vertex": { providerId: "google-vertex", providerName: "Google Vertex" },
	"google-vertex-eu": { providerId: "google-vertex", providerName: "Google Vertex" },
	moonshotai: { providerId: "moonshotai", providerName: "Moonshot AI" },
	"moonshotai-turbo": { providerId: "moonshotai", providerName: "Moonshot AI" },
	"nebius-token-factory": { providerId: "nebius-token-factory", providerName: "Nebius Token Factory" },
	"nebius-token-factory-fast": { providerId: "nebius-token-factory", providerName: "Nebius Token Factory" },
	"nebius-token-factory-eu-north-1": { providerId: "nebius-token-factory", providerName: "Nebius Token Factory" },
	"nebius-token-factory-us-central-1": { providerId: "nebius-token-factory", providerName: "Nebius Token Factory" },
	openai: { providerId: "openai", providerName: "OpenAI" },
	"openai-eu": { providerId: "openai", providerName: "OpenAI" },
	venice: { providerId: "venice", providerName: "Venice" },
	"venice-e2ee": { providerId: "venice", providerName: "Venice" },
};

function discordProviderFamily(providerId: string, providerName?: string): { providerId: string; providerName: string } {
	return DISCORD_PROVIDER_FAMILIES[providerId] ?? { providerId, providerName: providerName ?? providerId };
}

export function getDiscordProviderFamilyId(providerId: string): string {
	return discordProviderFamily(providerId).providerId;
}

export function collapseDiscordProviderChanges(changes: ProviderChange[]): ProviderChange[] {
	const grouped = new Map<string, ProviderChange>();
	for (const change of changes) {
		const family = discordProviderFamily(change.providerId, change.providerName);
		const current = grouped.get(family.providerId) ?? {
			providerId: family.providerId,
			providerName: family.providerName,
			previousCount: 0,
			currentCount: 0,
			added: [],
			removed: [],
		};
		current.previousCount += change.previousCount;
		current.currentCount += change.currentCount;
		current.added = Array.from(new Set([...current.added, ...change.added])).sort();
		current.removed = Array.from(new Set([...current.removed, ...change.removed])).sort();
		grouped.set(family.providerId, current);
	}
	return Array.from(grouped.values());
}

export function collapseDiscordPricingChanges(changes: PricingProviderChange[]): PricingProviderChange[] {
	const grouped = new Map<string, PricingProviderChange>();
	for (const change of changes) {
		const family = discordProviderFamily(change.providerId);
		const current = grouped.get(family.providerId) ?? { providerId: family.providerName, updates: 0, samples: [] };
		current.updates += change.updates;
		current.samples = Array.from(new Set([...current.samples, ...change.samples])).sort();
		grouped.set(family.providerId, current);
	}
	return Array.from(grouped.values());
}

export type PricingTableSnapshotState = {
	providerId: string;
	fingerprint: string;
};

type ConfiguredProviderModelRow = {
	provider_id: string | null;
	provider_model_slug: string | null;
	api_model_id: string | null;
};

const DISCOVERY_TIMEOUT_MS = 30_000;
const MAX_DISCORD_LINES = 30;
const MAX_LIST_ITEMS = 8;
const MAX_SUMMARY_MODEL_SAMPLES = 5;
const MAX_PRICING_PROVIDER_LINES = 20;
const MAX_PRICING_SAMPLE_LINES = 6;
const MAX_PRICING_ROWS = 5_000;
const PRICING_PAGE_SIZE = 500;
const PRICING_KEY_PATTERN = /(price|pricing|cost|billing|currency|rate|meter|unit)/i;
const PRICING_VALUE_KEY_PATTERN = /^(?:input|output|prompt|completion|input_tokens|output_tokens|prompt_tokens|completion_tokens|cache(?:d)?(?:_read|_write|_input|_prompt|_tokens)?|currency|unit)$/i;
const PRICING_EXTRACTION_MAX_DEPTH = 4;
const MAX_SAMPLE_TEXT_LENGTH = 180;
const PROVIDER_ID_ALIASES: Record<string, string> = {
	"arcee": "arcee-ai",
	"aionlabs": "aion-labs",
	"alibaba-cloud": "alibaba",
	"liquid": "liquid-ai",
	"moonshot-ai": "moonshotai",
	"moonshot-ai-turbo": "moonshotai-turbo",
	"novitaai": "novita",
	"xai": "spacex-ai",
	"atlas-cloud": "atlascloud",
	"voyageai": "voyage",
	"zai": "z-ai",
};
export function toInt(value: string | undefined, fallback: number): number {
	const parsed = Number(value ?? "");
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(1, Math.floor(parsed));
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function normalizePathSegment(value: string | undefined): string {
	if (!value) return "";
	return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

export function resolveProviderModelsEndpoint(provider: ProviderConfig): string {
	if (provider.modelsEndpoint && provider.modelsEndpointParams) {
		let endpoint = provider.modelsEndpoint;
		for (const [name, envNames] of Object.entries(provider.modelsEndpointParams)) {
			const value = readBindingEnv(envNames);
			if (!value) throw new Error(`${provider.providerId} models endpoint parameter ${name} missing`);
			endpoint = endpoint.replaceAll(`{${name}}`, encodeURIComponent(value));
		}
		return endpoint;
	}

	const baseUrlOverride = provider.baseUrlEnv ? readBindingEnv(provider.baseUrlEnv) : null;
	if (!baseUrlOverride) {
		if (provider.modelsEndpoint) return provider.modelsEndpoint;
		if (!provider.baseUrl) {
			throw new Error(`${provider.providerId} models endpoint missing`);
		}

		const parsed = new URL(provider.baseUrl);
		const basePath = parsed.pathname.replace(/\/+$/, "");
		const pathPrefix = normalizePathSegment(provider.pathPrefix);
		const modelsPath = normalizePathSegment(provider.modelsPath ?? "/models");
		const fullModelsPath = `${pathPrefix}${modelsPath}`;

		if (
			fullModelsPath &&
			(basePath === fullModelsPath || basePath.endsWith(fullModelsPath))
		) {
			return parsed.toString();
		}
		if (pathPrefix && (basePath === pathPrefix || basePath.endsWith(pathPrefix))) {
			parsed.pathname = `${basePath}${modelsPath}`.replace(/\/{2,}/g, "/");
			return parsed.toString();
		}

		parsed.pathname = `${basePath}${fullModelsPath || modelsPath}`.replace(/\/{2,}/g, "/");
		return parsed.toString();
	}

	const parsed = new URL(baseUrlOverride);
	const basePath = parsed.pathname.replace(/\/+$/, "");
	const pathPrefix = normalizePathSegment(provider.pathPrefix);
	const modelsPath = normalizePathSegment(provider.modelsPath ?? "/models");
	const fullModelsPath = `${pathPrefix}${modelsPath}`;

	if (fullModelsPath && (basePath === fullModelsPath || basePath.endsWith(fullModelsPath))) {
		return parsed.toString();
	}
	if (pathPrefix && (basePath === pathPrefix || basePath.endsWith(pathPrefix))) {
		parsed.pathname = `${basePath}${modelsPath}`.replace(/\/{2,}/g, "/");
		return parsed.toString();
	}

	parsed.pathname = `${basePath}${fullModelsPath || modelsPath}`.replace(/\/{2,}/g, "/");
	return parsed.toString();
}

export function extractPricingDetailsFromValue(value: unknown, depth = 0, parentKey = ""): unknown | null {
	if (depth > PRICING_EXTRACTION_MAX_DEPTH) return null;
	const parentMatches = parentKey ? PRICING_KEY_PATTERN.test(parentKey) : false;

	if (Array.isArray(value)) {
		const nested = value
			.map((item) => extractPricingDetailsFromValue(item, depth + 1, parentKey))
			.filter((item): item is unknown => item !== null);
		if (nested.length === 0) return null;
		return normalizeJson(nested);
	}

	if (value && typeof value === "object") {
		const input = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const [key, nestedValue] of Object.entries(input)) {
			if (PRICING_KEY_PATTERN.test(key)) {
				const nested = extractPricingDetailsFromValue(nestedValue, depth + 1, key);
				if (nested !== null) out[key] = nested;
				continue;
			}
			if (
				parentMatches &&
				PRICING_VALUE_KEY_PATTERN.test(key) &&
				(typeof nestedValue === "number" || typeof nestedValue === "string")
			) {
				out[key] = nestedValue;
				continue;
			}
			const nested = extractPricingDetailsFromValue(nestedValue, depth + 1, key);
			if (nested !== null) {
				out[key] = nested;
			}
		}
		if (Object.keys(out).length === 0) return null;
		return normalizeJson(out);
	}

	if (!parentMatches) return null;
	if (
		typeof value === "number" ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return value;
	}
	return null;
}

export function samplePricingDetailsText(value: unknown): string {
	if (value === null || value === undefined) return "no pricing details";
	const text = JSON.stringify(normalizeJson(value));
	if (!text) return "no pricing details";
	return text.length <= MAX_SAMPLE_TEXT_LENGTH ? text : `${text.slice(0, MAX_SAMPLE_TEXT_LENGTH - 3)}...`;
}

export function formatSnapshotValue(value: number | null): string {
	return value === null ? "null" : String(value);
}

const PROVIDER_PRICE_METER_LABELS: Record<string, string> = {
	cached_read_text_tokens: "cached input",
	cached_write_text_tokens: "cache write",
	input_text_tokens: "input",
	output_text_tokens: "output",
};

type HuggingFaceProviderOffer = {
	provider: string;
	input?: number;
	output?: number;
	free?: boolean;
};

function huggingFaceProviderOffers(value: unknown): Map<string, HuggingFaceProviderOffer> {
	const offers = new Map<string, HuggingFaceProviderOffer>();
	for (const entry of asArray(asRecord(value)?.offers)) {
		const offer = asRecord(entry);
		const provider = typeof offer?.provider === "string" ? offer.provider.trim() : "";
		if (!provider) continue;
		offers.set(provider, {
			provider,
			...(typeof offer?.input === "number" && Number.isFinite(offer.input) ? { input: offer.input } : {}),
			...(typeof offer?.output === "number" && Number.isFinite(offer.output) ? { output: offer.output } : {}),
			...(offer?.free === true ? { free: true } : {}),
		});
	}
	return offers;
}

function isLegacyAnonymousHuggingFacePricing(value: unknown): boolean {
	const record = asRecord(value);
	return Array.isArray(record?.providers) && !Array.isArray(record.offers);
}

function normalizedProviderPricing(value: unknown): {
	currency: string;
	unit: string;
	meters: Record<string, number>;
} | null {
	const normalized = asRecord(asRecord(value)?.normalized);
	const meters = asRecord(normalized?.meters);
	if (!normalized || !meters) return null;
	const numericMeters = Object.fromEntries(
		Object.entries(meters).filter((entry): entry is [string, number] => (
			typeof entry[1] === "number" && Number.isFinite(entry[1])
		))
	);
	return {
		currency: typeof normalized.currency === "string" ? normalized.currency : "USD",
		unit: typeof normalized.unit === "string" ? normalized.unit : "per_1m_tokens",
		meters: numericMeters,
	};
}

function formatProviderPrice(value: number | undefined, currency: string): string {
	if (value === undefined) return "not listed";
	const formatted = value.toFixed(9).replace(/\.?0+$/, "");
	return currency === "USD" ? `$${formatted}` : `${formatted} ${currency}`;
}

function formatProviderPriceUnit(unit: string): string {
	return unit === "per_1m_tokens" ? "/ 1M tokens" : `/ ${unit.replaceAll("_", " ")}`;
}

function formatHuggingFaceOffer(offer: HuggingFaceProviderOffer): string {
	if (offer.free && offer.input === undefined && offer.output === undefined) return "free";
	const rates = [
		offer.input === undefined ? null : `input ${formatProviderPrice(offer.input, "USD")}`,
		offer.output === undefined ? null : `output ${formatProviderPrice(offer.output, "USD")}`,
	].filter((value): value is string => Boolean(value));
	return rates.length > 0 ? `${rates.join(", ")} / 1M tokens` : "no listed price";
}

function buildHuggingFaceProviderOfferDiff(previous: unknown, current: unknown): string[] {
	const previousOffers = huggingFaceProviderOffers(previous);
	const currentOffers = huggingFaceProviderOffers(current);
	if (previousOffers.size === 0 && currentOffers.size === 0) return [];
	const providers = new Set([...previousOffers.keys(), ...currentOffers.keys()]);
	const changes: string[] = [];
	for (const provider of [...providers].sort()) {
		const previousOffer = previousOffers.get(provider);
		const currentOffer = currentOffers.get(provider);
		if (!previousOffer && currentOffer) {
			changes.push(`${provider}: added (${formatHuggingFaceOffer(currentOffer)})`);
			continue;
		}
		if (previousOffer && !currentOffer) {
			changes.push(`${provider}: removed (${formatHuggingFaceOffer(previousOffer)})`);
			continue;
		}
		if (!previousOffer || !currentOffer) continue;
		for (const meter of ["input", "output"] as const) {
			if (previousOffer[meter] === currentOffer[meter]) continue;
			changes.push(
				`${provider} ${meter}: ${formatProviderPrice(previousOffer[meter], "USD")} → ${formatProviderPrice(currentOffer[meter], "USD")} / 1M tokens`
			);
		}
		if (previousOffer.free !== currentOffer.free) {
			changes.push(`${provider}: ${currentOffer.free ? "now free" : "no longer marked free"}`);
		}
	}
	if (changes.length <= 4) return changes;
	return [...changes.slice(0, 4), `...and ${changes.length - 4} more offer changes`];
}

function buildNormalizedProviderPricingDiff(previous: unknown, current: unknown): string[] {
	const previousPricing = normalizedProviderPricing(previous);
	const currentPricing = normalizedProviderPricing(current);
	if (!previousPricing && !currentPricing) return [];
	const currency = currentPricing?.currency ?? previousPricing?.currency ?? "USD";
	const unit = currentPricing?.unit ?? previousPricing?.unit ?? "per_1m_tokens";
	const meterIds = new Set([
		...Object.keys(previousPricing?.meters ?? {}),
		...Object.keys(currentPricing?.meters ?? {}),
	]);
	const changes: string[] = [];
	for (const meterId of [...meterIds].sort()) {
		const previousValue = previousPricing?.meters[meterId];
		const currentValue = currentPricing?.meters[meterId];
		if (previousValue === currentValue) continue;
		const label = PROVIDER_PRICE_METER_LABELS[meterId] ?? meterId.replaceAll("_", " ");
		changes.push(
			`${label}: ${formatProviderPrice(previousValue, currency)} → ${formatProviderPrice(currentValue, currency)} ${formatProviderPriceUnit(unit)}`
		);
	}
	return changes;
}

function flattenSupplementalProviderPricing(
	value: unknown,
	path = "",
	output = new Map<string, string | number | boolean>(),
): Map<string, string | number | boolean> {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
			flattenSupplementalProviderPricing(nestedValue, path ? `${path}.${key}` : key, output);
		}
	} else if (["string", "number", "boolean"].includes(typeof value)) {
		output.set(path, value as string | number | boolean);
	}
	return output;
}

function supplementalProviderPricingDetails(value: unknown): unknown | null {
	return supplementalProviderPricing(asRecord(value)?.sourcePricing);
}

function formatSupplementalProviderPricingDiff(previous: unknown, current: unknown): string[] {
	const previousValues = flattenSupplementalProviderPricing(supplementalProviderPricingDetails(previous));
	const currentValues = flattenSupplementalProviderPricing(supplementalProviderPricingDetails(current));
	const paths = new Set([...previousValues.keys(), ...currentValues.keys()]);
	const changes: string[] = [];
	for (const path of [...paths].sort()) {
		const previousValue = previousValues.get(path);
		const currentValue = currentValues.get(path);
		if (previousValue === currentValue) continue;
		const label = path
			.split(".")
			.filter((part) => !["metadata", "price", "prices", "pricing", "cost", "costs"].includes(part))
			.join(" ")
			.replaceAll("_", " ") || "other price";
		const formatValue = (value: string | number | boolean | undefined) => {
			if (value === undefined) return "not listed";
			return typeof value === "number" ? formatProviderPrice(value, "USD") : String(value);
		};
		changes.push(`${label}: ${formatValue(previousValue)} → ${formatValue(currentValue)}`);
	}
	if (changes.length <= 4) return changes;
	return [...changes.slice(0, 4), `...and ${changes.length - 4} more price changes`];
}

export function buildProviderApiModelSnapshotDiff(
	previous: ProviderApiModelSnapshot,
	current: ProviderApiModelSnapshot
): string[] {
	const changes: string[] = [];
	if (previous.pricingFingerprint !== current.pricingFingerprint) {
		if (
			isLegacyAnonymousHuggingFacePricing(previous.pricingDetails)
			&& huggingFaceProviderOffers(current.pricingDetails).size > 0
		) {
			return [];
		}
		const huggingFaceOfferChanges = buildHuggingFaceProviderOfferDiff(
			previous.pricingDetails,
			current.pricingDetails,
		);
		if (huggingFaceOfferChanges.length > 0) return huggingFaceOfferChanges;
		const normalizedChanges = buildNormalizedProviderPricingDiff(
			previous.pricingDetails,
			current.pricingDetails,
		);
		const supplementalChanges = formatSupplementalProviderPricingDiff(
			previous.pricingDetails,
			current.pricingDetails,
		);
		changes.push(...normalizedChanges, ...supplementalChanges);
		if (normalizedChanges.length === 0 && supplementalChanges.length === 0) {
			changes.push("other price changed");
		}
	}
	return changes;
}

export function isPlaceholderValue(raw: string): boolean {
	const value = raw.trim().toLowerCase();
	if (!value) return true;
	if (value.startsWith("your-") || value.startsWith("example-")) return true;
	return new Set(["changeme", "replace-me", "todo"]).has(value);
}

export function readBindingEnv(names: string[]): string | null {
	const bindings = getBindings() as unknown as Record<string, unknown>;
	for (const name of names) {
		const raw = bindings[name];
		if (typeof raw !== "string") continue;
		const trimmed = raw.trim();
		if (!trimmed || isPlaceholderValue(trimmed)) continue;
		return trimmed;
	}
	return null;
}

export function toBool(value: string | undefined | null, fallback = false): boolean {
	if (value === undefined || value === null) return fallback;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return fallback;
	return ["1", "true", "yes", "on"].includes(normalized);
}

export function safeId(value: string | null): string {
	return value?.trim() || "?";
}

export function normalizePrice(value: number | string | null): string {
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	if (typeof value === "string" && value.trim()) return value.trim();
	return "?";
}

export function pricingRuleIdentity(row: PricingRuleRow): string {
	if (row.rule_id && row.rule_id.trim()) return row.rule_id.trim();
	return [
		safeId(row.provider_id),
		safeId(row.api_model_id),
		safeId(row.capability_id),
		safeId(row.pricing_plan),
		safeId(row.meter),
		safeId(row.updated_at),
	].join("|");
}

export function isNewerTimestamp(a: string, b: string): boolean {
	const aMs = Date.parse(a);
	const bMs = Date.parse(b);
	if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return a > b;
	return aMs > bMs;
}

export function isSameTimestamp(a: string, b: string): boolean {
	const aMs = Date.parse(a);
	const bMs = Date.parse(b);
	if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return a === b;
	return aMs === bMs;
}

export function formatPricingSample(row: PricingRuleRow): string {
	const model = safeId(row.api_model_id);
	const capability = safeId(row.capability_id);
	const plan = safeId(row.pricing_plan);
	const meter = safeId(row.meter);
	const price = normalizePrice(row.price_per_unit);
	const currency = safeId(row.currency);
	const status = row.effective_to ? "ended" : "active";
	return `${model} | ${capability} | ${plan} | ${meter}=${price} ${currency} (${status})`;
}

export function normalizeModelId(providerId: string, raw: string): string | null {
	const value = raw.trim();
	if (!value) return null;
	if (providerId === "google-ai-studio" && value.startsWith("models/")) {
		return value.slice("models/".length);
	}
	return value;
}

export function canonicalProviderId(value: string): string {
	const normalized = value.trim().toLowerCase();
	return PROVIDER_ID_ALIASES[normalized] ?? normalized;
}

export function canonicalCoverageModelId(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function fnv1aHash(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeConfiguredCoverageChanges(
	providerChanges: PricingProviderChange[],
	maxSamplesPerProvider?: number
): PricingProviderChange[] {
	const limit = Number.isFinite(maxSamplesPerProvider)
		? Math.max(0, Math.floor(maxSamplesPerProvider as number))
		: null;
	const normalized: PricingProviderChange[] = [];

	for (const provider of providerChanges) {
		const providerId = canonicalProviderId(String(provider.providerId ?? ""));
		if (!providerId) continue;

		const samples = Array.from(
			new Set(
				(provider.samples ?? [])
					.filter((sample): sample is string => typeof sample === "string" && sample.trim().length > 0)
					.map((sample) => canonicalCoverageModelId(sample))
			)
		).sort((a, b) => a.localeCompare(b));

		const updates = Number.isFinite(provider.updates) && provider.updates > 0
			? Math.floor(provider.updates)
			: samples.length;
		const limitedSamples = limit === null ? samples : samples.slice(0, limit);
		normalized.push({ providerId, updates, samples: limitedSamples });
	}

	return normalized.sort((a, b) => a.providerId.localeCompare(b.providerId));
}

export function computeConfiguredModelCoverageFingerprint(
	providerChanges: PricingProviderChange[],
	maxSamplesPerProvider?: number
): string | null {
	const normalized = normalizeConfiguredCoverageChanges(providerChanges, maxSamplesPerProvider);
	if (normalized.length === 0) return null;
	const serialized = normalized
		.map((provider) => `${provider.providerId}:${provider.updates}:${provider.samples.join(",")}`)
		.join("|");
	return `v1:${normalized.length}:${serialized.length}:${fnv1aHash(serialized)}`;
}

export function expandProviderLookupIds(providerIds: string[]): string[] {
	const ids = new Set(providerIds.map((id) => canonicalProviderId(id)));
	for (const [alias, canonical] of Object.entries(PROVIDER_ID_ALIASES)) {
		if (ids.has(canonical)) ids.add(alias);
		if (ids.has(alias)) ids.add(canonical);
	}
	return Array.from(ids);
}

export function hasAtlascloudLlmCategory(row: Record<string, unknown>): boolean {
	const categories = asArray(row.categories)
		.filter((value): value is string => typeof value === "string")
		.map((value) => value.trim().toLowerCase());
	if (categories.includes("llm")) return true;

	if (typeof row.category === "string") {
		return row.category
			.split(",")
			.map((value) => value.trim().toLowerCase())
			.some((value) => value === "llm");
	}

	return false;
}

export function shouldIncludeDiscoveredModel(providerId: string, row: Record<string, unknown>): boolean {
	if (providerId === "atlascloud") {
		return hasAtlascloudLlmCategory(row);
	}
	if (providerId === "clarifai") {
		return typeof row.model_type_id === "string" && row.model_type_id.trim().toLowerCase() === "text-to-text";
	}
	return true;
}

export function extractDiscoveredModels(providerId: string, payload: unknown): DiscoveredModel[] {
	const root = asRecord(payload);
	if (!root && !Array.isArray(payload)) return [];
	const nestedProviderModels = providerId === "weights-and-biases" && root
		? Object.values(root).flatMap((provider) => Object.values(asRecord(asRecord(provider)?.models) ?? {}))
		: [];

	const candidateCollections: unknown[] = [
		payload,
		root?.data,
		root?.models,
		root?.publisherModels,
		root?.result,
		asRecord(root?.result)?.data,
		asRecord(root?.result)?.models,
		nestedProviderModels,
	];

	const output = new Map<string, DiscoveredModel>();

	for (const collection of candidateCollections) {
		for (const item of asArray(collection)) {
			const row = asRecord(item);
			if (!row) continue;
			if (!shouldIncludeDiscoveredModel(providerId, row)) continue;
			if (providerId === "google-vertex" || providerId === "google-vertex-eu") {
				const normalized = normalizeGoogleVertexModelId(row);
				if (!normalized) continue;
				const modelDetails = normalizeJson(row) as Record<string, unknown>;
				const pricingDetails = extractPricingDetailsFromValue(modelDetails);
				output.set(normalized, {
					id: normalized,
					modelDetails,
					pricingDetails,
				});
				continue;
			}
			const candidates = providerId === "digitalocean"
				? [row.model_id, row.id, row.name, row.model, row.slug]
				: [row.id, row.model_id, row.name, row.model, row.slug];
			for (const value of candidates) {
				if (typeof value !== "string") continue;
				const normalized = normalizeModelId(providerId, value);
				if (!normalized) continue;
				const modelDetails = normalizeJson(row) as Record<string, unknown>;
				const pricingDetails = extractPricingDetailsFromValue(modelDetails);
				output.set(normalized, {
					id: normalized,
					modelDetails,
					pricingDetails,
				});
				break;
			}
		}
	}

	return Array.from(output.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeGoogleVertexModelId(row: Record<string, unknown>): string | null {
	const rawName = typeof row.name === "string" ? row.name.trim() : "";
	const match = /^publishers\/([^/]+)\/models\/([^/]+)$/i.exec(rawName);
	if (!match) return null;

	const publisher = match[1]!.toLowerCase();
	const modelName = match[2]!.trim();
	if (!modelName) return null;

	const versionId = typeof row.versionId === "string" ? row.versionId.trim() : "";
	const normalizedVersion = versionId && versionId.toLowerCase() !== "default" ? versionId : "";

	if (publisher === "anthropic") {
		return normalizedVersion ? `${modelName}@${normalizedVersion}` : modelName;
	}
	if (publisher === "google") {
		return modelName;
	}
	return normalizedVersion ? `${publisher}/${modelName}@${normalizedVersion}` : `${publisher}/${modelName}`;
}

function normalizeProviderResponseErrorDetail(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed || null;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return value === 0 ? null : String(value);
	}
	const record = asRecord(value);
	if (!record) return null;
	const errorCode = toNullableInteger(
		record.code ?? record.status_code ?? record.statusCode
	);
	if (errorCode === 0) return null;

	for (const key of ["message", "msg", "detail", "error"]) {
		const nested = record[key];
		if (typeof nested === "string") {
			const trimmed = nested.trim();
			if (trimmed) return trimmed;
		}
		if (typeof nested === "number" && Number.isFinite(nested) && nested !== 0) {
			return String(nested);
		}
	}

	return errorCode === null ? null : `code ${errorCode}`;
}

function extractProviderResponseErrorMessage(payload: unknown): string | null {
	const root = asRecord(payload);
	if (!root) return null;

	const directError = normalizeProviderResponseErrorDetail(root.error);
	if (directError) return directError;

	const baseResp = asRecord(root.base_resp) ?? asRecord(root.baseResp);
	const statusCode = toNullableInteger(
		root.status_code ?? root.statusCode ?? baseResp?.status_code ?? baseResp?.statusCode
	);
	if (statusCode === null || statusCode === 0) return null;

	const message =
		normalizeProviderResponseErrorDetail(root.message) ??
		normalizeProviderResponseErrorDetail(root.msg) ??
		normalizeProviderResponseErrorDetail(root.detail) ??
		normalizeProviderResponseErrorDetail(baseResp?.message) ??
		normalizeProviderResponseErrorDetail(baseResp?.msg) ??
		normalizeProviderResponseErrorDetail(baseResp?.detail);

	return message ? `status_code ${statusCode}: ${message}` : `status_code ${statusCode}`;
}

export async function fetchProviderModels(provider: ProviderConfig, apiKey?: string | null): Promise<DiscoveredModel[]> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);

	try {
		if (provider.authStyle === "google_vertex") {
			if (!apiKey) throw new Error(`${provider.providerId} api key missing`);
			const accessToken = await resolveVertexAccessToken(apiKey);
			const publisherUrls = [
				"https://aiplatform.googleapis.com/v1beta1/publishers/google/models?listAllVersions=true&pageSize=300",
				"https://aiplatform.googleapis.com/v1beta1/publishers/anthropic/models?listAllVersions=true&pageSize=300",
			];
			const publisherModels = await Promise.all(
				publisherUrls.map(async (initialUrl) => {
					const rows: unknown[] = [];
					let nextUrl: string | null = initialUrl;

					while (nextUrl) {
						const response = await fetch(nextUrl, {
							method: "GET",
							headers: {
								Authorization: `Bearer ${accessToken}`,
							},
							signal: controller.signal,
						});
						if (!response.ok) {
							const body = await response.text().catch(() => "");
							throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
						}

						const payload = await response.json();
						const root = asRecord(payload);
						rows.push(...asArray(root?.publisherModels));

						const nextPageToken =
							typeof root?.nextPageToken === "string" ? root.nextPageToken.trim() : "";
						if (!nextPageToken) {
							nextUrl = null;
							continue;
						}

						const parsed = new URL(nextUrl);
						parsed.searchParams.set("pageToken", nextPageToken);
						nextUrl = parsed.toString();
					}

					return rows;
				}),
			);
			return extractDiscoveredModels(provider.providerId, {
				publisherModels: publisherModels.flat(),
			});
		}

		const headers: Record<string, string> = {};
		let url = resolveProviderModelsEndpoint(provider);

		switch (provider.authStyle ?? "bearer") {
			case "anthropic":
				if (!apiKey) throw new Error(`${provider.providerId} api key missing`);
				headers["x-api-key"] = apiKey;
				headers["anthropic-version"] = "2023-06-01";
				break;
			case "google_api_key_query": {
				if (!apiKey) throw new Error(`${provider.providerId} api key missing`);
				const parsed = new URL(url);
				parsed.searchParams.set("key", apiKey);
				url = parsed.toString();
				break;
			}
			case "clarifai_key":
				if (!apiKey) throw new Error(`${provider.providerId} api key missing`);
				headers["Authorization"] = `Key ${apiKey}`;
				break;
			case "elevenlabs":
				if (!apiKey) throw new Error(`${provider.providerId} api key missing`);
				headers["xi-api-key"] = apiKey;
				break;
			case "api_key_authorization":
				if (!apiKey) throw new Error(`${provider.providerId} api key missing`);
				headers["Authorization"] = `Api-Key ${apiKey}`;
				break;
			case "x_api_key":
				if (!apiKey) throw new Error(`${provider.providerId} api key missing`);
				headers["X-Api-Key"] = apiKey;
				break;
			case "optional_bearer":
				if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
				break;
			case "none":
				break;
			case "bearer":
			default:
				if (!apiKey) throw new Error(`${provider.providerId} api key missing`);
				headers["Authorization"] = `Bearer ${apiKey}`;
				break;
		}

		const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
		}

		const payload = await response.json();
		const providerResponseErrorMessage = extractProviderResponseErrorMessage(payload);
		if (providerResponseErrorMessage) {
			throw new Error(`${provider.providerName} (${provider.providerId}) response error: ${providerResponseErrorMessage}`);
		}
		return extractDiscoveredModels(provider.providerId, payload);
	} finally {
		clearTimeout(timeout);
	}
}

export function diffModelIds(previousIds: string[], currentIds: string[]): { added: string[]; removed: string[] } {
	const previous = new Set(previousIds);
	const current = new Set(currentIds);
	const added = currentIds.filter((id) => !previous.has(id));
	const removed = previousIds.filter((id) => !current.has(id));
	return { added, removed };
}

export function confirmModelRemovals(
	removedIds: string[],
	pendingRemovalIds: ReadonlySet<string>,
): { confirmed: string[]; provisional: string[] } {
	const confirmed: string[] = [];
	const provisional: string[] = [];
	for (const modelId of removedIds) {
		(pendingRemovalIds.has(modelId) ? confirmed : provisional).push(modelId);
	}
	return { confirmed, provisional };
}

export function assertSafeDiscoverySnapshot(
	providerId: string,
	previousIds: string[],
	currentIds: string[],
	minimumRetainedRatio = 0.25,
): void {
	if (currentIds.length === 0) {
		throw new Error(`${providerId} returned zero models; refusing to replace the previous snapshot`);
	}
	if (previousIds.length < 5) return;
	const retainedRatio = currentIds.length / previousIds.length;
	if (retainedRatio < minimumRetainedRatio) {
		throw new Error(
			`${providerId} model count fell from ${previousIds.length} to ${currentIds.length} ` +
			`(${Math.round(retainedRatio * 100)}% retained); refusing a destructive snapshot`,
		);
	}
}

export function parsePricingCursorFromSummary(summary: unknown): PricingCursor | null {
	const summaryRecord = asRecord(summary);
	if (!summaryRecord) return null;
	const pricingRecord = asRecord(summaryRecord.pricingMonitor);
	if (!pricingRecord) return null;
	if (typeof pricingRecord.cursorUpdatedAt !== "string" || !pricingRecord.cursorUpdatedAt.trim()) {
		return null;
	}
	const ruleIds =
		Array.isArray(pricingRecord.ruleIdsAtTimestamp)
			? pricingRecord.ruleIdsAtTimestamp
				.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
			: [];
	return {
		updatedAt: pricingRecord.cursorUpdatedAt,
		ruleIdsAtTimestamp: ruleIds,
	};
}

export async function loadLatestPricingCursor(): Promise<PricingCursor | null> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("model_discovery_runs")
		.select("summary,status,started_at")
		.in("status", ["completed", "completed_with_errors"])
		.order("started_at", { ascending: false })
		.limit(200);

	if (error) throw new Error(error.message || "Failed to load pricing cursor from previous runs");

	for (const row of data ?? []) {
		const cursor = parsePricingCursorFromSummary((row as Record<string, unknown>).summary);
		if (cursor) return cursor;
	}
	return null;
}

export function parseConfiguredCoverageProviderChanges(value: unknown): PricingProviderChange[] {
	const rows = asArray(value);
	const providerChanges: PricingProviderChange[] = [];
	for (const rowValue of rows) {
		const row = asRecord(rowValue);
		if (!row) continue;
		const providerIdRaw =
			typeof row.providerId === "string"
				? row.providerId
				: typeof row.provider_id === "string"
					? row.provider_id
					: "";
		const providerId = canonicalProviderId(providerIdRaw);
		if (!providerId) continue;
		const samples = asArray(row.samples)
			.filter((sample): sample is string => typeof sample === "string" && sample.trim().length > 0)
			.map((sample) => canonicalCoverageModelId(sample));
		const updates =
			typeof row.updates === "number" && Number.isFinite(row.updates) && row.updates >= 0
				? Math.floor(row.updates)
				: samples.length;
		providerChanges.push({ providerId, updates, samples });
	}
	return providerChanges;
}

export function parseConfiguredCoverageStateFromSummary(summary: unknown): ConfiguredModelCoverageState | null {
	const summaryRecord = asRecord(summary);
	if (!summaryRecord) return null;
	const coverageRecord = asRecord(summaryRecord.configuredModelCoverageMonitor);
	if (!coverageRecord) return null;

	const providerChanges = parseConfiguredCoverageProviderChanges(coverageRecord.providerChanges);
	const fingerprint =
		typeof coverageRecord.fingerprint === "string" && coverageRecord.fingerprint.trim().length > 0
			? coverageRecord.fingerprint.trim()
			: null;
	const fallbackFingerprint = computeConfiguredModelCoverageFingerprint(
		providerChanges,
		MAX_SUMMARY_MODEL_SAMPLES
	);
	return { fingerprint, fallbackFingerprint };
}

export async function loadLatestConfiguredCoverageState(source?: string): Promise<ConfiguredModelCoverageState | null> {
	const supabase = getSupabaseAdmin();
	let query = supabase
		.from("model_discovery_runs")
		.select("summary,status,started_at")
		.in("status", ["completed", "completed_with_errors"])
		.order("started_at", { ascending: false });

	const sourceValue = typeof source === "string" ? source.trim() : "";
	if (sourceValue) {
		query = query.eq("source", sourceValue);
	}

	const { data, error } = await query.limit(200);

	if (error) throw new Error(error.message || "Failed to load configured model coverage state");

	for (const row of data ?? []) {
		const state = parseConfiguredCoverageStateFromSummary((row as Record<string, unknown>).summary);
		if (state) return state;
	}
	return null;
}

export async function loadLatestDiscordNotificationFingerprint(source?: string): Promise<string | null> {
	const supabase = getSupabaseAdmin();
	let query = supabase
		.from("model_discovery_runs")
		.select("summary,status,started_at")
		.in("status", ["completed", "completed_with_errors"])
		.order("started_at", { ascending: false });
	const sourceValue = typeof source === "string" ? source.trim() : "";
	if (sourceValue) query = query.eq("source", sourceValue);

	const { data, error } = await query.limit(200);
	if (error) throw new Error(error.message || "Failed to load Discord notification fingerprint");

	for (const row of data ?? []) {
		const summary = asRecord((row as Record<string, unknown>).summary);
		const fingerprint = typeof summary?.notificationFingerprint === "string"
			? summary.notificationFingerprint.trim()
			: "";
		if (fingerprint) return fingerprint;
	}
	return null;
}

export function parsePricingTableStateFromSummary(summary: unknown): PricingTableSnapshotState[] {
	const summaryRecord = asRecord(summary);
	const tableMonitor = asRecord(summaryRecord?.pricingTableMonitor);
	if (!tableMonitor) return [];

	return asArray(tableMonitor.sources)
		.map((value) => asRecord(value))
		.filter((value): value is Record<string, unknown> => Boolean(value))
		.map((value) => ({
			providerId: canonicalProviderId(typeof value.providerId === "string" ? value.providerId : ""),
			fingerprint: typeof value.fingerprint === "string" ? value.fingerprint.trim() : "",
		}))
		.filter((value) => Boolean(value.providerId) && Boolean(value.fingerprint));
}

export async function loadLatestPricingTableState(source?: string): Promise<PricingTableSnapshotState[]> {
	const supabase = getSupabaseAdmin();
	let query = supabase
		.from("model_discovery_runs")
		.select("summary,status,started_at")
		.in("status", ["completed", "completed_with_errors"])
		.order("started_at", { ascending: false });
	const sourceValue = typeof source === "string" ? source.trim() : "";
	if (sourceValue) query = query.eq("source", sourceValue);

	const { data, error } = await query.limit(200);
	if (error) throw new Error(error.message || "Failed to load pricing table state");
	const latestByProvider = new Map<string, PricingTableSnapshotState>();
	for (const row of data ?? []) {
		const state = parsePricingTableStateFromSummary((row as Record<string, unknown>).summary);
		for (const snapshot of state) {
			if (!latestByProvider.has(snapshot.providerId)) latestByProvider.set(snapshot.providerId, snapshot);
		}
	}
	return [...latestByProvider.values()];
}

export type PricingPageStateRow = {
	provider_id: string;
	source_url: string;
	fingerprint: string;
	content_lines: string[];
};

export function parsePricingPageStateRows(rows: unknown[]): Map<string, PricingPageStateRow> {
	const byProvider = new Map<string, PricingPageStateRow>();
	for (const value of rows) {
		const record = asRecord(value);
		const providerId = canonicalProviderId(typeof record?.provider_id === "string" ? record.provider_id : "");
		const fingerprint = typeof record?.fingerprint === "string" ? record.fingerprint.trim() : "";
		if (!providerId || !fingerprint) continue;
		byProvider.set(providerId, {
			provider_id: providerId,
			source_url: typeof record?.source_url === "string" ? record.source_url : "",
			fingerprint,
			content_lines: asArray(record?.content_lines).filter(
				(line): line is string => typeof line === "string" && line.trim().length > 0
			),
		});
	}
	return byProvider;
}

export async function loadPricingPageStates(): Promise<Map<string, PricingPageStateRow>> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("model_discovery_pricing_pages")
		.select("provider_id,source_url,fingerprint,content_lines");
	if (error) throw new Error(error.message || "Failed to load pricing page state");
	return parsePricingPageStateRows((data ?? []) as unknown[]);
}

export async function savePricingPageStates(
	snapshots: Array<{ providerId: string; sourceUrl: string; fingerprint: string; contentLines: string[] }>
): Promise<void> {
	if (snapshots.length === 0) return;
	const supabase = getSupabaseAdmin();
	const rows = snapshots.map((snapshot) => ({
		provider_id: snapshot.providerId,
		source_url: snapshot.sourceUrl,
		fingerprint: snapshot.fingerprint,
		content_lines: snapshot.contentLines,
		updated_at: new Date().toISOString(),
	}));
	const { error } = await supabase
		.from("model_discovery_pricing_pages")
		.upsert(rows, { onConflict: "provider_id" });
	if (error) throw new Error(error.message || "Failed to persist pricing page state");
}

export async function fetchLatestPricingUpdatedAt(): Promise<string | null> {
	const rows = await loadV2PricingRows();
	return rows.reduce<string | null>((latest, row) => {
		if (!row.updated_at) return latest;
		return !latest || row.updated_at > latest ? row.updated_at : latest;
	}, null);
}

export async function fetchPricingRuleIdsAtTimestamp(updatedAt: string): Promise<string[]> {
	const rows = (await loadV2PricingRows()).filter((row) => row.updated_at === updatedAt).slice(0, MAX_PRICING_ROWS);
	return rows.map((row) => pricingRuleIdentity(row)).sort((a, b) => a.localeCompare(b));
}

export async function fetchPricingRowsSince(sinceInclusive: string): Promise<PricingRuleRow[]> {
	const since = Date.parse(sinceInclusive);
	if (!Number.isFinite(since)) return [];
	return (await loadV2PricingRows())
		.filter((row) => row.updated_at && Date.parse(row.updated_at) >= since)
		.slice(0, MAX_PRICING_ROWS);
}

export async function loadConfiguredProviderModelIds(providerIds: string[]): Promise<Map<string, Set<string>>> {
	const byProvider = new Map<string, Set<string>>();
	const canonicalProviderIds = Array.from(
		new Set(providerIds.map((providerId) => canonicalProviderId(providerId)))
	);
	if (canonicalProviderIds.length === 0) return byProvider;
	const canonicalProviderIdSet = new Set(canonicalProviderIds);

	const supabase = getSupabaseAdmin();
	const lookupProviderIds = expandProviderLookupIds(canonicalProviderIds);
	let from = 0;

	while (true) {
		const to = from + PRICING_PAGE_SIZE - 1;
		const { data, error } = await supabase
			.from("v2_model_provider_routes")
			.select("provider_slug,provider_model_slug,model_slug")
			.in("provider_slug", lookupProviderIds)
			.range(from, to);
		if (error) {
			throw new Error(error.message || "Failed to load configured provider models");
		}

		const rows = (data ?? []).map((row) => ({
			provider_id: row.provider_slug,
			provider_model_slug: row.provider_model_slug,
			api_model_id: row.model_slug,
		})) as ConfiguredProviderModelRow[];
		if (rows.length === 0) break;

		for (const row of rows) {
			if (typeof row.provider_id !== "string" || !row.provider_id.trim()) continue;
			const providerId = canonicalProviderId(row.provider_id);
			if (!canonicalProviderIdSet.has(providerId)) continue;

			const set = byProvider.get(providerId) ?? new Set<string>();
			if (typeof row.provider_model_slug === "string" && row.provider_model_slug.trim()) {
				set.add(canonicalCoverageModelId(row.provider_model_slug));
			}
			if (typeof row.api_model_id === "string" && row.api_model_id.includes("/")) {
				const tail = row.api_model_id.split("/").slice(1).join("/").trim();
				if (tail) {
					set.add(canonicalCoverageModelId(tail));
				}
			}
			byProvider.set(providerId, set);
		}

		if (rows.length < PRICING_PAGE_SIZE) break;
		from += PRICING_PAGE_SIZE;
	}

	return byProvider;
}

export function summarizeMissingConfiguredProviderModels(args: {
	discoveredModelIdsByProvider: Map<string, string[]>;
	configuredModelIdsByProvider: Map<string, Set<string>>;
}): PricingProviderChange[] {
	const providerChanges: PricingProviderChange[] = [];

	for (const [providerId, discoveredModelIds] of args.discoveredModelIdsByProvider.entries()) {
		const configured = args.configuredModelIdsByProvider.get(providerId);
		if (!configured || configured.size === 0) continue;

		const discoveredCanonicalIds = new Set(
			discoveredModelIds.map((modelId) => canonicalCoverageModelId(modelId))
		);
		const missing = Array.from(configured)
			.filter((configuredId) => !discoveredCanonicalIds.has(configuredId))
			.sort((a, b) => a.localeCompare(b));
		if (missing.length === 0) continue;

		providerChanges.push({
			providerId,
			updates: missing.length,
			samples: missing,
		});
	}

	return providerChanges.sort(
		(a, b) => b.updates - a.updates || a.providerId.localeCompare(b.providerId)
	);
}

export function summarizePricingChanges(rows: PricingRuleRow[]): PricingProviderChange[] {
	const providerMap = new Map<string, PricingProviderChange>();
	for (const row of rows) {
		const providerId = safeId(row.provider_id);
		const existing = providerMap.get(providerId) ?? { providerId, updates: 0, samples: [] };
		existing.updates += 1;
		if (existing.samples.length < MAX_PRICING_SAMPLE_LINES) {
			existing.samples.push(formatPricingSample(row));
		}
		providerMap.set(providerId, existing);
	}
	return Array.from(providerMap.values()).sort((a, b) => b.updates - a.updates || a.providerId.localeCompare(b.providerId));
}

export function shouldRunPricingMonitor(args: RunArgs): boolean {
	if (args.shardIndex === undefined || args.shardCount === undefined) return true;
	return args.shardIndex === 0;
}

export async function runPricingMonitorCheck(): Promise<PricingMonitorSummary> {
	const summary: PricingMonitorSummary = {
		enabled: true,
		executed: true,
		baselineInitialized: false,
		cursorUpdatedAt: null,
		updatesDetected: 0,
		providersChanged: 0,
		providerChanges: [],
	};

	const cursor = await loadLatestPricingCursor();
	if (!cursor) {
		const latest = await fetchLatestPricingUpdatedAt();
		summary.baselineInitialized = true;
		summary.cursorUpdatedAt = latest;
		summary.ruleIdsAtTimestamp = latest ? await fetchPricingRuleIdsAtTimestamp(latest) : [];
		return summary;
	}

	const rows = await fetchPricingRowsSince(cursor.updatedAt);
	const seenRuleIds = new Set(cursor.ruleIdsAtTimestamp);
	const filtered: PricingRuleRow[] = [];

	for (const row of rows) {
		if (!row.updated_at) continue;
		if (isNewerTimestamp(cursor.updatedAt, row.updated_at)) continue;
		if (isSameTimestamp(row.updated_at, cursor.updatedAt)) {
			const identity = pricingRuleIdentity(row);
			if (seenRuleIds.has(identity)) continue;
		}
		filtered.push(row);
	}

	let nextUpdatedAt = cursor.updatedAt;
	let nextRuleIdsAtTimestamp = new Set(cursor.ruleIdsAtTimestamp);
	for (const row of filtered) {
		if (!row.updated_at) continue;
		const identity = pricingRuleIdentity(row);
		if (isNewerTimestamp(row.updated_at, nextUpdatedAt)) {
			nextUpdatedAt = row.updated_at;
			nextRuleIdsAtTimestamp = new Set([identity]);
		} else if (isSameTimestamp(row.updated_at, nextUpdatedAt)) {
			nextRuleIdsAtTimestamp.add(identity);
		}
	}

	const providerChanges = summarizePricingChanges(filtered);
	summary.cursorUpdatedAt = nextUpdatedAt;
	summary.updatesDetected = filtered.length;
	summary.providersChanged = providerChanges.length;
	summary.providerChanges = providerChanges;
	summary.ruleIdsAtTimestamp = Array.from(nextRuleIdsAtTimestamp).sort((a, b) => a.localeCompare(b));
	return summary;
}

export function appendBulletedList(lines: string[], values: string[]): void {
	const visible = values.slice(0, MAX_LIST_ITEMS);
	for (const value of visible) {
		lines.push(`- ${value}`);
	}
	if (values.length > MAX_LIST_ITEMS) {
		lines.push(`- ...and ${values.length - MAX_LIST_ITEMS} more`);
	}
}

export function buildModelDiscordSection(changes: ProviderChange[]): string {
	const modelSetChanges = collapseDiscordProviderChanges(changes).filter(
		(change) => change.added.length > 0 || change.removed.length > 0
	);
	if (modelSetChanges.length === 0) return "";
	const lines: string[] = [
		`Model discovery detected additions or removals across ${modelSetChanges.length} provider${modelSetChanges.length === 1 ? "" : "s"}.`,
		"",
	];

	for (const change of modelSetChanges.slice(0, MAX_DISCORD_LINES)) {
		lines.push(`${change.providerName}`);
		if (change.added.length > 0) {
			lines.push(`New models (${change.added.length}):`);
			appendBulletedList(lines, change.added);
		}
		if (change.removed.length > 0) {
			lines.push(`Removed models (${change.removed.length}):`);
			appendBulletedList(lines, change.removed);
		}
		lines.push("");
	}

	return lines.join("\n").trim();
}

export function buildPricingDiscordSection(pricing: PricingMonitorSummary): string {
	if (pricing.updatesDetected === 0 || pricing.providerChanges.length === 0) return "";
	const providerChanges = collapseDiscordPricingChanges(pricing.providerChanges);
	const updatesDetected = providerChanges.reduce((total, provider) => total + provider.updates, 0);
	const lines: string[] = [
		`Pricing monitor detected ${updatesDetected} updated rule${updatesDetected === 1 ? "" : "s"} across ${providerChanges.length} provider${providerChanges.length === 1 ? "" : "s"}.`,
		"",
	];

	for (const provider of providerChanges.slice(0, MAX_PRICING_PROVIDER_LINES)) {
		lines.push(`${provider.providerId}`);
		lines.push(`Updates (${provider.updates}):`);
		appendBulletedList(lines, provider.samples);
		lines.push("");
	}

	if (providerChanges.length > MAX_PRICING_PROVIDER_LINES) {
		lines.push(`...and ${providerChanges.length - MAX_PRICING_PROVIDER_LINES} more provider(s).`);
	}

	return lines.join("\n").trim();
}

export function buildProviderApiPricingDiscordSection(pricing: ProviderApiPricingMonitorSummary): string {
	if (pricing.updatesDetected === 0 || pricing.providerChanges.length === 0) return "";
	const providerChanges = collapseDiscordPricingChanges(pricing.providerChanges);
	const updatesDetected = providerChanges.reduce((total, provider) => total + provider.updates, 0);
	const lines: string[] = [
		`Provider /models monitor detected ${updatesDetected} updated model${updatesDetected === 1 ? "" : "s"} across ${providerChanges.length} provider${providerChanges.length === 1 ? "" : "s"}.`,
		"",
	];

	for (const provider of providerChanges.slice(0, MAX_PRICING_PROVIDER_LINES)) {
		lines.push(`${provider.providerId}`);
		lines.push(`Updates (${provider.updates}):`);
		appendBulletedList(lines, provider.samples);
		lines.push("");
	}

	if (providerChanges.length > MAX_PRICING_PROVIDER_LINES) {
		lines.push(`...and ${providerChanges.length - MAX_PRICING_PROVIDER_LINES} more provider(s).`);
	}

	return lines.join("\n").trim();
}

export function buildConfiguredModelCoverageDiscordSection(summary: ConfiguredModelCoverageMonitorSummary): string {
	if (summary.updatesDetected === 0 || summary.providerChanges.length === 0) return "";
	const lines: string[] = [
		`Configured model coverage found ${summary.updatesDetected} missing configured model${summary.updatesDetected === 1 ? "" : "s"} across ${summary.providerChanges.length} provider${summary.providerChanges.length === 1 ? "" : "s"}.`,
		"",
	];

	for (const provider of summary.providerChanges.slice(0, MAX_PRICING_PROVIDER_LINES)) {
		lines.push(`${provider.providerId}`);
		lines.push(`Missing (${provider.updates}):`);
		appendBulletedList(lines, provider.samples);
		lines.push("");
	}

	if (summary.providerChanges.length > MAX_PRICING_PROVIDER_LINES) {
		lines.push(`...and ${summary.providerChanges.length - MAX_PRICING_PROVIDER_LINES} more provider(s).`);
	}

	return lines.join("\n").trim();
}

export function shouldNotifyConfiguredModelCoverage(): boolean {
	return toBool(readBindingEnv(["CONFIGURED_MODEL_COVERAGE_NOTIFY_ENABLED"]) ?? "false", false);
}

export function hasDiscordNotifiableChanges(args: {
	modelChanges: ProviderChange[];
	pricing: PricingMonitorSummary;
	providerApiPricing: ProviderApiPricingMonitorSummary;
	pricingTable: PricingTableMonitorSummary;
	configuredModelCoverage: ConfiguredModelCoverageMonitorSummary;
}): boolean {
	return args.modelChanges.some((change) => change.added.length > 0 || change.removed.length > 0)
		|| args.pricing.updatesDetected > 0
		|| args.providerApiPricing.updatesDetected > 0
		|| args.pricingTable.updatesDetected > 0
	;
}

export function buildPricingTableDiscordSection(pricing: PricingTableMonitorSummary): string {
	const lines: string[] = [];
	if (pricing.updatesDetected > 0) {
		lines.push(`Pricing page monitor detected ${pricing.updatesDetected} changed provider source${pricing.updatesDetected === 1 ? "" : "s"}.`);
		for (const change of pricing.providerChanges.slice(0, MAX_PRICING_PROVIDER_LINES)) {
			const added = change.addedSamples ?? [];
			const removed = change.removedSamples ?? [];
			if (added.length === 0 && removed.length === 0) {
				lines.push(`- ${change.providerName}: pricing content changed (${change.sourceUrl})`);
				continue;
			}
			lines.push(`${change.providerName} (${change.sourceUrl}) — ${added.length} added, ${removed.length} removed:`);
			for (const sample of added) lines.push(`+ ${sample}`);
			for (const sample of removed) lines.push(`- ${sample}`);
		}
	}
	return lines.join("\n").trim();
}

const PRIVATE_MODEL_DISCOVERY_USERNAME = "Phaseo Private Model Discovery";
const PRIVATE_MODEL_DISCOVERY_AVATAR_URL = "https://phaseo.app/png_logo_dark.png";
const DEFAULT_MODEL_DISCOVERY_REVIEW_URL = "https://phaseo.app/settings/internal/model-discovery";
const MAX_DISCORD_MESSAGE_LENGTH = 1_900;

function titleCaseModelId(modelId: string): string {
	const label = modelId.split("/").at(-1) ?? modelId;
	return label
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function modelPathSegments(providerId: string, modelId: string): string[] {
	const modelSegments = modelId.split("/").map((segment) => segment.trim()).filter(Boolean);
	if (modelSegments[0]?.toLowerCase() === providerId.toLowerCase()) return modelSegments;
	return [providerId, ...modelSegments];
}

function buildModelNotificationUrl(providerId: string, modelId: string, prefix: string): string {
	const path = modelPathSegments(providerId, modelId).map((segment) => encodeURIComponent(segment)).join("/");
	const route = prefix ? `${prefix}/models` : "models";
	return `https://phaseo.app/${route}/${path}`;
}

function buildAddedModelNotifications(changes: ProviderChange[]): InternalModelNotificationModel[] {
	return changes.flatMap((change) => change.added.map((modelId) => ({
		modelId: modelPathSegments(change.providerId, modelId).join("/"),
		modelName: titleCaseModelId(modelId),
		modelUrl: buildModelNotificationUrl(change.providerId, modelId, ""),
		imageUrl: `${buildModelNotificationUrl(change.providerId, modelId, "og")}?discovery=1`,
		creatorId: change.providerId,
		creatorName: change.providerName,
		changeSummaryLines: ["Detected in the provider model list."],
	})));
}

function appendReviewQueueLink(message: string): string {
	const reviewUrl = readBindingEnv(["MODEL_DISCOVERY_REVIEW_URL"]) ?? DEFAULT_MODEL_DISCOVERY_REVIEW_URL;
	const suffix = `\n\nReview queue: ${reviewUrl}`;
	const available = Math.max(0, MAX_DISCORD_MESSAGE_LENGTH - suffix.length);
	const base = message.length <= available ? message : `${message.slice(0, Math.max(0, available - 16))}\n...[truncated]`;
	return `${base}${suffix}`;
}

export function buildDiscordMessage(args: {
	modelChanges: ProviderChange[];
	pricing: PricingMonitorSummary;
	providerApiPricing: ProviderApiPricingMonitorSummary;
	pricingTable: PricingTableMonitorSummary;
	configuredModelCoverage: ConfiguredModelCoverageMonitorSummary;
}): string {
	const sections: string[] = [];
	const modelSection = buildModelDiscordSection(args.modelChanges);
	const pricingSection = buildPricingDiscordSection(args.pricing);
	const providerApiPricingSection = buildProviderApiPricingDiscordSection(args.providerApiPricing);
	const pricingTableSection = buildPricingTableDiscordSection(args.pricingTable);
	if (modelSection) sections.push(modelSection);
	if (pricingSection) sections.push(pricingSection);
	if (providerApiPricingSection) sections.push(providerApiPricingSection);
	if (pricingTableSection) sections.push(pricingTableSection);
	const text = sections.join("\n\n").trim();
	if (text.length <= 1900) return text;
	return `${text.slice(0, 1888)}\n...[truncated]`;
}

export async function computeDiscordNotificationFingerprint(args: Parameters<typeof buildDiscordMessage>[0]): Promise<string | null> {
	const message = buildDiscordMessage(args).trim();
	if (!message) return null;
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sendDiscordNotification(args: {
	modelChanges: ProviderChange[];
	pricing: PricingMonitorSummary;
	providerApiPricing: ProviderApiPricingMonitorSummary;
	pricingTable: PricingTableMonitorSummary;
	configuredModelCoverage: ConfiguredModelCoverageMonitorSummary;
}): Promise<{ delivered: boolean; skipped: boolean; reason?: string | null; error?: string | null }> {
	if (!hasDiscordNotifiableChanges(args)) {
		return { delivered: false, skipped: true, reason: "no notifiable changes" };
	}
	const discordWebhookUrl = readBindingEnv(["DISCORD_WEBHOOK_URL"]);
	const slackWebhookUrl = readBindingEnv(["MODEL_DISCOVERY_SLACK_WEBHOOK_URL"]);
	if (!discordWebhookUrl && !slackWebhookUrl) {
		return { delivered: false, skipped: true, reason: "missing Discord and Slack webhook URLs" };
	}

	const message = appendReviewQueueLink(buildDiscordMessage(args));
	if (!message.trim()) {
		return { delivered: false, skipped: true, reason: "empty Discord message" };
	}

	const failures: string[] = [];
	const deliveredChannels: string[] = [];
	if (discordWebhookUrl) {
		try {
			const addedModels = buildAddedModelNotifications(args.modelChanges);
			if (addedModels.length > 0) {
				const payload = buildInternalModelWebhookPayload(
					addedModels,
					readBindingEnv(["DISCORD_ROLE_ID"]),
					{
						discordUserId: readBindingEnv(["DISCORD_USER_ID"]),
						username: PRIVATE_MODEL_DISCOVERY_USERNAME,
						avatarUrl: PRIVATE_MODEL_DISCOVERY_AVATAR_URL,
						message,
					},
				);
				await sendDiscordWebhookPayload(discordWebhookUrl, payload);
			} else {
				await sendDiscordTextMessage({
					webhookUrl: discordWebhookUrl,
					message,
					roleId: readBindingEnv(["DISCORD_ROLE_ID"]),
					userId: readBindingEnv(["DISCORD_USER_ID"]),
					username: PRIVATE_MODEL_DISCOVERY_USERNAME,
					avatarUrl: PRIVATE_MODEL_DISCOVERY_AVATAR_URL,
				});
			}
			deliveredChannels.push("Discord");
		} catch (error) {
			failures.push(`Discord: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (slackWebhookUrl) {
		try {
			await sendSlackWebhookMessage(slackWebhookUrl, message);
			deliveredChannels.push("Slack");
		} catch (error) {
			failures.push(`Slack: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (failures.length > 0 && deliveredChannels.length === 0) throw new Error(failures.join("; "));
	if (failures.length > 0) {
		const error = failures.join("; ");
		console.warn("[model-discovery] Partial notification delivery (" + deliveredChannels.join(", ") + "): " + error);
		return { delivered: false, skipped: false, reason: "partial notification delivery", error };
	}
	return { delivered: true, skipped: false };
}
