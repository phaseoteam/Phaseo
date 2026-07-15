// Purpose: Convert provider-specific model pricing payloads into a stable, comparable shape.
// Why: Providers expose equivalent rates with incompatible field names and units.
// How: Keep provider knowledge isolated here; callers persist the canonical snapshot and retain raw data elsewhere.

export type NormalizedProviderPricing = {
	currency: "USD";
	unit: "per_1m_tokens";
	meters: Record<string, number>;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string" || !value.trim()) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function toPerMillion(value: unknown): number | null {
	const parsed = asNumber(value);
	if (parsed === null) return null;
	return Math.round(parsed * 1_000_000 * 1_000_000_000) / 1_000_000_000;
}

function centsPerHundredMillionTokensToPerMillion(value: unknown): number | null {
	const parsed = asNumber(value);
	return parsed === null ? null : parsed / 10_000;
}

function usd(value: unknown): number | null {
	const record = asRecord(value);
	return asNumber(record?.usd ?? value);
}

function fromMeters(meters: Record<string, number | null>): NormalizedProviderPricing | null {
	const present = Object.entries(meters).filter((entry): entry is [string, number] => entry[1] !== null);
	if (present.length === 0) return null;
	return {
		currency: "USD",
		unit: "per_1m_tokens",
		meters: Object.fromEntries(present.sort(([left], [right]) => left.localeCompare(right))),
	};
}

function promptCompletionPricing(pricing: JsonRecord, perToken: boolean): NormalizedProviderPricing | null {
	const rate = perToken ? toPerMillion : asNumber;
	return fromMeters({
		input_text_tokens: rate(pricing.prompt ?? pricing.input),
		cached_read_text_tokens: rate(
			pricing.cache_prompt ?? pricing.input_cache_read ?? pricing.input_cache_reads ?? pricing.cache_input,
		),
		output_text_tokens: rate(pricing.completion ?? pricing.output),
	});
}

export function normalizeProviderModelPricing(providerId: string, modelDetails: unknown): NormalizedProviderPricing | null {
	const model = asRecord(modelDetails);
	if (!model) return null;

	switch (providerId) {
		case "akashml": {
			const pricing = asRecord(model.pricing);
			return pricing
				? fromMeters({
						input_text_tokens: toPerMillion(pricing.input),
						output_text_tokens: toPerMillion(pricing.output),
					})
				: null;
		}
		case "ai21":
		case "aion-labs":
		case "inception":
		case "nextbit": {
			const pricing = asRecord(model.pricing);
			return pricing ? promptCompletionPricing(pricing, true) : null;
		}
		case "atlascloud": {
			const actual = asRecord(asRecord(model.price)?.actual);
			return actual
				? fromMeters({
						input_text_tokens: asNumber(actual.input_price),
						cached_read_text_tokens: asNumber(actual.cache_price),
						output_text_tokens: asNumber(actual.output_price),
					})
				: null;
		}
		case "arcee-ai":
		case "baseten":
		case "groq": {
			const pricing = asRecord(model.pricing);
			return pricing ? promptCompletionPricing(pricing, true) : null;
		}
		case "chutes": {
			const price = asRecord(model.price);
			return price
				? fromMeters({
						input_text_tokens: usd(price.input),
						cached_read_text_tokens: usd(price.input_cache_read),
						output_text_tokens: usd(price.output),
					})
				: null;
		}
		case "crofai": {
			const pricing = asRecord(model.pricing);
			return pricing ? promptCompletionPricing(pricing, false) : null;
		}
		case "deepinfra": {
			const pricing = asRecord(asRecord(model.metadata)?.pricing);
			return pricing
				? fromMeters({
						input_text_tokens: asNumber(pricing.input_tokens),
						cached_read_text_tokens: asNumber(pricing.cache_read_tokens),
						output_text_tokens: asNumber(pricing.output_tokens),
					})
				: null;
		}
		case "gmicloud": {
			const pricing = Array.isArray(model.pricing) ? asRecord(model.pricing[0]) : null;
			return pricing ? promptCompletionPricing(pricing, true) : null;
		}
		case "novitaai":
			return fromMeters({
				input_text_tokens: asNumber(model.input_token_price_per_m),
				output_text_tokens: asNumber(model.output_token_price_per_m),
			});
		case "spacex-ai":
			return fromMeters({
				input_text_tokens: centsPerHundredMillionTokensToPerMillion(model.prompt_text_token_price),
				cached_read_text_tokens: centsPerHundredMillionTokensToPerMillion(model.cached_prompt_text_token_price),
				output_text_tokens: centsPerHundredMillionTokensToPerMillion(model.completion_text_token_price),
			});
		case "together": {
			const pricing = asRecord(model.pricing);
			return pricing
				? fromMeters({
						input_text_tokens: asNumber(pricing.input),
						cached_read_text_tokens: asNumber(pricing.cached_input),
						output_text_tokens: asNumber(pricing.output),
					})
				: null;
		}
		case "venice": {
			const pricing = asRecord(asRecord(model.model_spec)?.pricing);
			return pricing
				? fromMeters({
						input_text_tokens: usd(pricing.input),
						cached_read_text_tokens: usd(pricing.cache_input),
						output_text_tokens: usd(pricing.output),
					})
				: null;
		}
		default:
			return null;
	}
}
