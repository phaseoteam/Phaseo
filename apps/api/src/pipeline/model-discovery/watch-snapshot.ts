// Purpose: Canonical per-model watch-snapshot extraction shared by the Worker
// and the standalone discovery runner.
// Why: Both runners write `model_discovery_seen_models.watch_snapshot`; identical
// normalization keeps pricing fingerprints comparable so alternating runners
// never fabricate change alerts.
// How: Pure functions only — no runtime/env imports — so scripts can import it.

import { normalizeProviderModelPricing } from "./pricing-normalizers";

export type ProviderApiModelSnapshot = {
	contextLength: number | null;
	maxCompletionTokens: number | null;
	pricingDetails: unknown | null;
	pricingFingerprint: string | null;
};

export function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
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

const CANONICAL_PROVIDER_PRICE_KEYS = new Set([
	"prompt", "input", "completion", "output", "cache_prompt", "input_cache_read",
	"input_cache_reads", "cache_input", "cached_input", "input_cache_write",
	"input_cache_writes", "cache_creation", "cache_write", "input_tokens",
	"cache_read_tokens", "output_tokens", "input_price_per_million",
	"cache_read_input_price_per_million", "output_price_per_million",
	"prompt_text_token_price", "cached_prompt_text_token_price",
	"completion_text_token_price", "input_token_price_per_m", "output_token_price_per_m",
	"input_price", "cache_price", "output_price", "cache_read",
]);
const VOLATILE_PROVIDER_PRICE_KEYS = new Set([
	"created", "created_at", "createdat", "updated", "updated_at", "updatedat",
	"last_updated", "lastupdated", "refreshed_at", "refreshedat", "timestamp",
	"request_id", "requestid", "generated_at", "generatedat", "fetched_at", "fetchedat",
]);

export function supplementalProviderPricing(value: unknown, key = "", pricingContext = false): unknown | null {
	const normalizedKey = key.trim().toLowerCase();
	if (CANONICAL_PROVIDER_PRICE_KEYS.has(normalizedKey) || VOLATILE_PROVIDER_PRICE_KEYS.has(normalizedKey)) {
		return null;
	}
	const nestedPricingContext = pricingContext
		|| /^(?:price|prices|pricing|cost|costs)$/.test(normalizedKey)
		|| /(?:price|cost|usd|hourly|finetune|per_.*_unit|_unit)$/.test(normalizedKey);
	if (Array.isArray(value)) {
		const entries = value
			.map((entry) => supplementalProviderPricing(entry, "", nestedPricingContext))
			.filter((entry): entry is unknown => entry !== null)
			.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
		return entries.length > 0 ? entries : null;
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.map(([nestedKey, nestedValue]) => [
				nestedKey,
				supplementalProviderPricing(nestedValue, nestedKey, nestedPricingContext),
			] as const)
			.filter((entry): entry is readonly [string, unknown] => entry[1] !== null)
			.sort(([left], [right]) => left.localeCompare(right));
		return entries.length > 0 ? Object.fromEntries(entries) : null;
	}
	return nestedPricingContext ? value ?? null : null;
}

function normalizeProviderApiPricingDetails(
	providerId: string,
	modelDetails: Record<string, unknown> | null,
	pricingDetails: unknown,
): unknown | null {
	if (providerId === "huggingface") {
		const offers = new Map<string, Record<string, unknown>>();
		for (const value of asArray(modelDetails?.providers)) {
			const provider = asRecord(value);
			const offerProviderId = typeof provider?.provider === "string" ? provider.provider.trim() : "";
			if (!offerProviderId) continue;
			const pricing = asRecord(provider?.pricing);
			const input = typeof pricing?.input === "number" && Number.isFinite(pricing.input) ? pricing.input : null;
			const output = typeof pricing?.output === "number" && Number.isFinite(pricing.output) ? pricing.output : null;
			offers.set(offerProviderId, {
				provider: offerProviderId,
				...(input === null ? {} : { input }),
				...(output === null ? {} : { output }),
				...(provider?.is_free === true ? { free: true } : {}),
			});
		}
		const normalizedOffers = [...offers.values()].sort((left, right) => (
			String(left.provider).localeCompare(String(right.provider))
		));
		return normalizedOffers.length > 0 ? { offers: normalizedOffers } : null;
	}
	const normalized = normalizeProviderModelPricing(providerId, modelDetails);
	if (normalized) {
		return {
			normalized,
			sourcePricing: normalizeJson(pricingDetails),
		};
	}

	return pricingDetails ?? null;
}

export function toProviderApiPricingFingerprint(pricingDetails: unknown): string | null {
	const record = asRecord(pricingDetails);
	if (!record?.normalized) return toPricingFingerprint(pricingDetails);
	const supplemental = supplementalProviderPricing(record.sourcePricing);
	return toPricingFingerprint({
		normalized: record.normalized,
		...(supplemental === null ? {} : { supplemental }),
	});
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
		pricingFingerprint: toProviderApiPricingFingerprint(normalizedPricingDetails),
	};
}

export function hasProviderApiSnapshotValue(snapshot: ProviderApiModelSnapshot): boolean {
	return (
		snapshot.contextLength !== null ||
		snapshot.maxCompletionTokens !== null ||
		snapshot.pricingFingerprint !== null
	);
}
