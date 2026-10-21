import type { ModelFacts } from "../shared/workspace";

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;

/** A token meter's USD price per million tokens; text meters first, as the web model page reads them. */
function perMillion(pricing: unknown, names: string[]) {
	const meters = record(record(pricing)?.meters);
	for (const name of names) {
		const meter = record(meters?.[name]);
		if (!meter || String(meter.currency ?? "").toUpperCase() !== "USD") continue;
		const price = Number(meter.price_per_unit), size = Number(meter.unit_size);
		if (meter.price_per_unit !== null && meter.price_per_unit !== "" && Number.isFinite(price) && price >= 0 && Number.isFinite(size) && size > 0) return price / size * 1_000_000;
	}
}
const prices = (pricing: unknown) => ({
	input: perMillion(pricing, ["input_text_tokens", "input_tokens"]), output: perMillion(pricing, ["output_text_tokens", "output_tokens"]),
	cacheRead: perMillion(pricing, ["cached_read_text_tokens", "cache_read_tokens", "cached_read_tokens"]), cacheWrite: perMillion(pricing, ["cached_write_text_tokens", "cache_write_tokens", "cached_write_tokens"]),
});

/** Context, input types, price and providers from a /v1/models entry, for the model card shown on Phaseo answers. */
export function phaseoModelFacts(model: Record<string, unknown>): ModelFacts | undefined {
	const limits = record(model.limits), offers = (Array.isArray(model.offers) ? model.offers : []).map(record).filter(offer => offer?.routable === true) as Record<string, unknown>[];
	// The cheapest routable offer by input price, so its input and output prices are one provider's; the model's own summary otherwise.
	const priced = offers.map(offer => prices(offer.pricing)).filter(price => price.input !== undefined).sort((a, b) => a.input! - b.input!)[0] ?? prices(model.pricing);
	const input = record(model.modalities)?.input;
	const providers = [...new Set(offers.map(offer => record(offer.provider)?.name).filter((name): name is string => typeof name === "string" && Boolean(name.trim())))];
	const facts: ModelFacts = {
		...(count(limits?.input_tokens) ? { contextTokens: count(limits?.input_tokens) } : {}),
		...(count(limits?.output_tokens) ? { outputTokens: count(limits?.output_tokens) } : {}),
		...(Array.isArray(input) && input.every(value => typeof value === "string") && input.length ? { input: input as string[] } : {}),
		...(priced.input !== undefined ? { inputPrice: priced.input } : {}),
		...(priced.output !== undefined ? { outputPrice: priced.output } : {}),
		...(priced.cacheRead !== undefined ? { cacheReadPrice: priced.cacheRead } : {}),
		...(priced.cacheWrite !== undefined ? { cacheWritePrice: priced.cacheWrite } : {}),
		...(providers.length ? { providers } : {}),
	};
	return Object.keys(facts).length ? facts : undefined;
}
