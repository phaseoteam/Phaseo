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

function digitalOceanPerMillion(value: unknown): number | null {
	const parsed = asNumber(value);
	if (parsed === null) return null;
	return parsed < 0.001 ? toPerMillion(parsed) : parsed;
}

function centsPerHundredMillionTokensToPerMillion(value: unknown): number | null {
	const parsed = asNumber(value);
	return parsed === null ? null : parsed / 10_000;
}

function novitaPerMillion(value: unknown): number | null {
	const parsed = asNumber(value);
	if (parsed === null) return null;
	return parsed >= 1_000 ? parsed / 10_000 : parsed;
}

function novitaPricing(model: JsonRecord): NormalizedProviderPricing | null {
	const pricing = asRecord(model.pricing);
	const prompt = asRecord(pricing?.prompt);
	const completion = asRecord(pricing?.completion);
	const cacheRead = asRecord(pricing?.input_cache_read);
	return fromMeters({
		input_text_tokens: asNumber(prompt?.price_per_m_decimal) ?? novitaPerMillion(model.input_token_price_per_m),
		cached_read_text_tokens: asNumber(cacheRead?.price_per_m_decimal) ?? novitaPerMillion(cacheRead?.price_per_m),
		output_text_tokens: asNumber(completion?.price_per_m_decimal) ?? novitaPerMillion(model.output_token_price_per_m),
	});
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
		input_image_tokens: rate(pricing.image ?? pricing.input_image),
		input_audio_tokens: rate(pricing.audio ?? pricing.input_audio),
		cached_read_text_tokens: rate(
			pricing.cache_prompt ?? pricing.input_cache_read ?? pricing.input_cache_reads ?? pricing.cache_input,
		),
		cached_read_audio_tokens: rate(pricing.input_audio_cache),
		cached_write_text_tokens: rate(
			pricing.input_cache_write ?? pricing.input_cache_writes ?? pricing.cache_creation ?? pricing.cache_write,
		),
		output_text_tokens: rate(pricing.completion ?? pricing.output),
		output_image_tokens: rate(pricing.image_output ?? pricing.output_image),
		output_audio_tokens: rate(pricing.audio_output ?? pricing.output_audio),
		output_reasoning_tokens: rate(pricing.internal_reasoning),
	});
}

function singleUnconditionalPerMillion(pricings: unknown): number | null {
	if (!Array.isArray(pricings)) return null;
	const candidates = pricings.filter((entry) => {
		const record = asRecord(entry);
		return record?.unit === "perMTokens"
			&& (record.currency === undefined || record.currency === "USD")
			&& asRecord(record.conditions) === null;
	});
	if (candidates.length !== 1) return null;
	return asNumber(asRecord(candidates[0])?.value);
}

function zenmuxPricing(pricings: JsonRecord): NormalizedProviderPricing | null {
	return fromMeters({
		input_text_tokens: singleUnconditionalPerMillion(pricings.prompt),
		cached_read_text_tokens: singleUnconditionalPerMillion(pricings.input_cache_read),
		output_text_tokens: singleUnconditionalPerMillion(pricings.completion),
	});
}

export function normalizeProviderModelPricing(providerId: string, modelDetails: unknown): NormalizedProviderPricing | null {
	const model = asRecord(modelDetails);
	if (!model) return null;

	switch (providerId) {
		case "ambient":
		case "llmgateway":
		case "orcarouter":
		case "openrouter":
		case "ovhcloud": {
			const pricing = asRecord(model.pricing);
			return pricing ? promptCompletionPricing(pricing, true) : null;
		}
		case "vercel": {
			const pricing = asRecord(model.pricing);
			return pricing ? promptCompletionPricing(pricing, true) : null;
		}
		case "fastrouter":
		case "poe": {
			const pricing = asRecord(model.pricing);
			return pricing ? promptCompletionPricing(pricing, true) : null;
		}
		case "novita-ai":
		case "novita":
		case "novitaai":
			return novitaPricing(model);
		case "pioneer":
			return fromMeters({
				input_text_tokens: asNumber(model.input_price_per_million),
				cached_read_text_tokens: asNumber(model.cache_read_price_per_million),
				cached_write_text_tokens: asNumber(model.cache_write_price_per_million),
				output_text_tokens: asNumber(model.output_price_per_million),
			});
		case "requesty": {
			const tiers = Array.isArray(model.pricing) ? model.pricing : [];
			if (tiers.length > 1) return null;
			return fromMeters({
				input_text_tokens: toPerMillion(model.input_price),
				cached_read_text_tokens: toPerMillion(model.cached_price),
				output_text_tokens: toPerMillion(model.output_price),
			});
		}
		case "zenmux": {
			const pricings = asRecord(model.pricings);
			return pricings ? zenmuxPricing(pricings) : null;
		}
		case "weights-and-biases": {
			const cost = asRecord(model.cost);
			return cost
				? fromMeters({
						input_text_tokens: asNumber(cost.input),
						cached_read_text_tokens: asNumber(cost.cache_read),
						cached_write_text_tokens: asNumber(cost.cache_write),
						output_text_tokens: asNumber(cost.output),
					})
				: null;
		}
		case "cloudflare": {
			const pricing = asRecord(model.pricing);
			return pricing ? promptCompletionPricing(pricing, true) : null;
		}
		case "digitalocean": {
			const pricing = asRecord(model.pricing);
			return pricing
				? fromMeters({
						input_text_tokens: digitalOceanPerMillion(pricing.input_price_per_million),
						cached_read_text_tokens: digitalOceanPerMillion(pricing.cache_read_input_price_per_million),
						output_text_tokens: digitalOceanPerMillion(pricing.output_price_per_million),
					})
				: null;
		}
		case "empiriolabs": {
			const pricing = asRecord(model.pricing);
			return pricing ? promptCompletionPricing(pricing, true) : null;
		}
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
