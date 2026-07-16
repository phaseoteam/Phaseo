import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { resolveVertexAccessToken } from "@providers/google-vertex/auth";
import { sendDiscordTextMessage } from "./discord";
import { normalizeProviderModelPricing } from "./pricing-normalizers";
import type { ProviderConfig } from "./providers";

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

type ProviderApiModelSnapshot = {
	contextLength: number | null;
	maxCompletionTokens: number | null;
	pricingDetails: unknown | null;
	pricingFingerprint: string | null;
};

type PricingRuleRow = {
	rule_id: string | null;
	model_key: string | null;
	capability_id: string | null;
	pricing_plan: string | null;
	meter: string | null;
	price_per_unit: number | string | null;
	currency: string | null;
	effective_from: string | null;
	effective_to: string | null;
	updated_at: string | null;
};

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
const PRICING_KEY_PATTERN = /(price|pricing|cost|billing|currency|rate|meter|unit|token)/i;
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
	const baseUrlOverride = provider.baseUrlEnv ? readBindingEnv(provider.baseUrlEnv) : null;
	if (!baseUrlOverride) {
		if (!provider.baseUrl) {
			if (provider.modelsEndpoint) return provider.modelsEndpoint;
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

export function normalizeJson(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => normalizeJson(item));
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, nested]) => [key, normalizeJson(nested)] as const);
		return Object.fromEntries(entries);
	}
	return value;
}

export function toPricingFingerprint(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "object" && !Array.isArray(value)) {
		if (Object.keys(value as Record<string, unknown>).length === 0) return null;
	}
	return JSON.stringify(normalizeJson(value));
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
				out[key] = normalizeJson(nestedValue);
				continue;
			}
			const nested = extractPricingDetailsFromValue(nestedValue, depth + 1, key);
			if (nested !== null) {
				out[key] = nested;
			}
		}
		if (Object.keys(out).length === 0) return parentMatches ? normalizeJson(value) : null;
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

function normalizeProviderApiPricingDetails(
	providerId: string,
	modelDetails: Record<string, unknown> | null,
	pricingDetails: unknown,
): unknown | null {
	const normalized = normalizeProviderModelPricing(providerId, modelDetails);
	if (normalized) {
		return {
			normalized,
			sourcePricing: normalizeJson(pricingDetails),
		};
	}

	if (providerId !== "crofai") return pricingDetails ?? null;
	const record = asRecord(pricingDetails);
	return record?.pricing ? normalizeJson(record.pricing) : pricingDetails ?? null;
}

export function toNullableInteger(value: unknown): number | null {
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return null;
		return Math.trunc(value);
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (!Number.isFinite(parsed)) return null;
		return Math.trunc(parsed);
	}
	return null;
}

export function extractProviderApiModelSnapshot(
	providerId: string,
	modelDetails: Record<string, unknown> | null,
	pricingDetails: unknown | null
): ProviderApiModelSnapshot {
	const normalizedPricingDetails = normalizeProviderApiPricingDetails(providerId, modelDetails, pricingDetails);
	if (providerId === "crofai") {
		return {
			contextLength: null,
			maxCompletionTokens: null,
			pricingDetails: normalizedPricingDetails,
			pricingFingerprint: toPricingFingerprint(normalizedPricingDetails),
		};
	}

	const contextLength = modelDetails
		? toNullableInteger(modelDetails.contextLength ?? modelDetails.context_length)
		: null;
	const maxCompletionTokens = modelDetails
		? toNullableInteger(modelDetails.maxCompletionTokens ?? modelDetails.max_completion_tokens)
		: null;
	return {
		contextLength,
		maxCompletionTokens,
		pricingDetails: normalizedPricingDetails,
		pricingFingerprint: toPricingFingerprint(normalizedPricingDetails),
	};
}

export function hasProviderApiSnapshotValue(snapshot: ProviderApiModelSnapshot): boolean {
	return (
		snapshot.contextLength !== null ||
		snapshot.maxCompletionTokens !== null ||
		snapshot.pricingFingerprint !== null
	);
}

export function formatSnapshotValue(value: number | null): string {
	return value === null ? "null" : String(value);
}

export function buildProviderApiModelSnapshotDiff(
	previous: ProviderApiModelSnapshot,
	current: ProviderApiModelSnapshot
): string[] {
	const changes: string[] = [];
	if (previous.contextLength !== current.contextLength) {
		changes.push(`contextLength: ${formatSnapshotValue(previous.contextLength)} -> ${formatSnapshotValue(current.contextLength)}`);
	}
	if (previous.maxCompletionTokens !== current.maxCompletionTokens) {
		changes.push(`maxCompletionTokens: ${formatSnapshotValue(previous.maxCompletionTokens)} -> ${formatSnapshotValue(current.maxCompletionTokens)}`);
	}
	if (previous.pricingFingerprint !== current.pricingFingerprint) {
		changes.push(
			`price: ${samplePricingDetailsText(previous.pricingDetails)} -> ${samplePricingDetailsText(current.pricingDetails)}`
		);
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
		safeId(row.model_key),
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
	const model = safeId(row.model_key);
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

	const candidateCollections: unknown[] = [
		payload,
		root?.data,
		root?.models,
		root?.publisherModels,
		asRecord(root?.result)?.models,
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
			const candidates = [row.id, row.model_id, row.name, row.model, row.slug];
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
		return String(value);
	}
	const record = asRecord(value);
	if (!record) return null;

	for (const key of ["message", "msg", "detail", "error"]) {
		const nested = record[key];
		if (typeof nested === "string") {
			const trimmed = nested.trim();
			if (trimmed) return trimmed;
		}
		if (typeof nested === "number" && Number.isFinite(nested)) {
			return String(nested);
		}
	}

	return null;
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

export async function fetchLatestPricingUpdatedAt(): Promise<string | null> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("data_api_pricing_rules")
		.select("updated_at")
		.not("updated_at", "is", null)
		.order("updated_at", { ascending: false })
		.limit(1);

	if (error) throw new Error(error.message || "Failed to load latest pricing updated_at");
	const row = (data ?? [])[0] as { updated_at?: string | null } | undefined;
	if (!row || typeof row.updated_at !== "string" || !row.updated_at.trim()) return null;
	return row.updated_at;
}

export async function fetchPricingRuleIdsAtTimestamp(updatedAt: string): Promise<string[]> {
	const supabase = getSupabaseAdmin();
	const rows: PricingRuleRow[] = [];
	let from = 0;
	while (rows.length < MAX_PRICING_ROWS) {
		const to = from + PRICING_PAGE_SIZE - 1;
		const { data, error } = await supabase
			.from("data_api_pricing_rules")
			.select("rule_id,model_key,capability_id,pricing_plan,meter,price_per_unit,currency,effective_from,effective_to,updated_at")
			.eq("updated_at", updatedAt)
			.order("rule_id", { ascending: true })
			.range(from, to);
		if (error) throw new Error(error.message || "Failed to load pricing ids at checkpoint timestamp");
		const chunk = (data ?? []) as PricingRuleRow[];
		if (chunk.length === 0) break;
		rows.push(...chunk);
		if (chunk.length < PRICING_PAGE_SIZE) break;
		from += PRICING_PAGE_SIZE;
	}
	return rows.map((row) => pricingRuleIdentity(row)).sort((a, b) => a.localeCompare(b));
}

export async function fetchPricingRowsSince(sinceInclusive: string): Promise<PricingRuleRow[]> {
	const supabase = getSupabaseAdmin();
	const rows: PricingRuleRow[] = [];
	let from = 0;

	while (rows.length < MAX_PRICING_ROWS) {
		const to = from + PRICING_PAGE_SIZE - 1;
		const { data, error } = await supabase
			.from("data_api_pricing_rules")
			.select("rule_id,model_key,capability_id,pricing_plan,meter,price_per_unit,currency,effective_from,effective_to,updated_at")
			.gte("updated_at", sinceInclusive)
			.order("updated_at", { ascending: true })
			.range(from, to);

		if (error) throw new Error(error.message || "Failed to fetch pricing changes");
		const chunk = (data ?? []) as PricingRuleRow[];
		if (chunk.length === 0) break;
		rows.push(...chunk);
		if (chunk.length < PRICING_PAGE_SIZE) break;
		from += PRICING_PAGE_SIZE;
	}

	return rows.length > MAX_PRICING_ROWS ? rows.slice(0, MAX_PRICING_ROWS) : rows;
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
			.from("data_api_provider_models")
			.select("provider_id,provider_model_slug,api_model_id")
			.in("provider_id", lookupProviderIds)
			.range(from, to);
		if (error) {
			throw new Error(error.message || "Failed to load configured provider models");
		}

		const rows = (data ?? []) as ConfiguredProviderModelRow[];
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
		const providerId = safeId(row.model_key).split(":")[0] || "?";
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
	if (changes.length === 0) return "";
	const lines: string[] = [
		`Model discovery detected changes across ${changes.length} provider${changes.length === 1 ? "" : "s"}.`,
		"",
	];

	for (const change of changes.slice(0, MAX_DISCORD_LINES)) {
		lines.push(`${change.providerName}`);
		if (change.added.length > 0) {
			lines.push(`Additions (${change.added.length}):`);
			appendBulletedList(lines, change.added);
		}
		if (change.removed.length > 0) {
			lines.push(`Deletions (${change.removed.length}):`);
			appendBulletedList(lines, change.removed);
		}
		lines.push("");
	}

	return lines.join("\n").trim();
}

export function buildPricingDiscordSection(pricing: PricingMonitorSummary): string {
	if (pricing.updatesDetected === 0 || pricing.providerChanges.length === 0) return "";
	const lines: string[] = [
		`Pricing monitor detected ${pricing.updatesDetected} updated rule${pricing.updatesDetected === 1 ? "" : "s"} across ${pricing.providerChanges.length} provider${pricing.providerChanges.length === 1 ? "" : "s"}.`,
		"",
	];

	for (const provider of pricing.providerChanges.slice(0, MAX_PRICING_PROVIDER_LINES)) {
		lines.push(`${provider.providerId}`);
		lines.push(`Updates (${provider.updates}):`);
		appendBulletedList(lines, provider.samples);
		lines.push("");
	}

	if (pricing.providerChanges.length > MAX_PRICING_PROVIDER_LINES) {
		lines.push(`...and ${pricing.providerChanges.length - MAX_PRICING_PROVIDER_LINES} more provider(s).`);
	}

	return lines.join("\n").trim();
}

export function buildProviderApiPricingDiscordSection(pricing: ProviderApiPricingMonitorSummary): string {
	if (pricing.updatesDetected === 0 || pricing.providerChanges.length === 0) return "";
	const lines: string[] = [
		`Provider /models monitor detected ${pricing.updatesDetected} updated model${pricing.updatesDetected === 1 ? "" : "s"} across ${pricing.providerChanges.length} provider${pricing.providerChanges.length === 1 ? "" : "s"}.`,
		"",
	];

	for (const provider of pricing.providerChanges.slice(0, MAX_PRICING_PROVIDER_LINES)) {
		lines.push(`${provider.providerId}`);
		lines.push(`Updates (${provider.updates}):`);
		appendBulletedList(lines, provider.samples);
		lines.push("");
	}

	if (pricing.providerChanges.length > MAX_PRICING_PROVIDER_LINES) {
		lines.push(`...and ${pricing.providerChanges.length - MAX_PRICING_PROVIDER_LINES} more provider(s).`);
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
	configuredModelCoverage: ConfiguredModelCoverageMonitorSummary;
}): boolean {
	return args.modelChanges.length > 0 || (
		shouldNotifyConfiguredModelCoverage() && args.configuredModelCoverage.updatesDetected > 0
	);
}

const PRIVATE_MODEL_DISCOVERY_USERNAME = "Phaseo New Models (Internal)";
const PRIVATE_MODEL_DISCOVERY_AVATAR_URL = "https://phaseo.app/png_logo_light.png";

export function buildDiscordMessage(args: {
	modelChanges: ProviderChange[];
	configuredModelCoverage: ConfiguredModelCoverageMonitorSummary;
}): string {
	const includeConfiguredCoverageNotifications = shouldNotifyConfiguredModelCoverage();
	const sections: string[] = [];
	const modelSection = buildModelDiscordSection(args.modelChanges);
	const configuredModelCoverageSection = buildConfiguredModelCoverageDiscordSection(args.configuredModelCoverage);
	if (modelSection) sections.push(modelSection);
	if (includeConfiguredCoverageNotifications && configuredModelCoverageSection) {
		sections.push(configuredModelCoverageSection);
	}
	const text = sections.join("\n\n").trim();
	if (text.length <= 1900) return text;
	return `${text.slice(0, 1888)}\n...[truncated]`;
}

export async function sendDiscordNotification(args: {
	modelChanges: ProviderChange[];
	pricing: PricingMonitorSummary;
	providerApiPricing: ProviderApiPricingMonitorSummary;
	configuredModelCoverage: ConfiguredModelCoverageMonitorSummary;
}): Promise<{ delivered: boolean; skipped: boolean; reason?: string | null }> {
	if (!hasDiscordNotifiableChanges(args)) {
		return { delivered: false, skipped: true, reason: "no notifiable changes" };
	}
	const webhookUrl = readBindingEnv(["DISCORD_WEBHOOK_URL"]);
	if (!webhookUrl) {
		return { delivered: false, skipped: true, reason: "missing DISCORD_WEBHOOK_URL" };
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(webhookUrl);
	} catch {
		console.warn("[model-discovery] invalid DISCORD_WEBHOOK_URL; skipping notification");
		return { delivered: false, skipped: true, reason: "invalid DISCORD_WEBHOOK_URL" };
	}

	const message = buildDiscordMessage(args);
	if (!message.trim()) {
		return { delivered: false, skipped: true, reason: "empty Discord message" };
	}
	await sendDiscordTextMessage({
		webhookUrl: parsedUrl.toString(),
		message,
		roleId: readBindingEnv(["DISCORD_ROLE_ID"]),
		userId: readBindingEnv(["DISCORD_USER_ID"]),
		username: PRIVATE_MODEL_DISCOVERY_USERNAME,
		avatarUrl: PRIVATE_MODEL_DISCOVERY_AVATAR_URL,
	});
	return { delivered: true, skipped: false };
}
