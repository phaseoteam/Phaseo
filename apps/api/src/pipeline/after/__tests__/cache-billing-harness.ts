// Purpose: Price cards and fixtures for the end-to-end prompt-cache billing tests.
// Why: Cache meters cross executor usage, payload encoders, client shaping and the pricing
//      engine; only an end-to-end pass shows what a customer is actually charged.
// How: Builds per-1M-token cards, expected costs in nanos, and SSE upstream responses.

import type { PriceCard, PriceRule } from "../../pricing/types";

export type TokenPrices = {
	input: string;
	output: string;
	cachedRead?: string;
	cachedWrite?: string;
	cachedWrite5m?: string;
	cachedWrite1h?: string;
};

function rule(meter: string, price: string): PriceRule {
	return {
		id: `${meter}_rule`,
		pricing_plan: "standard",
		meter: meter as PriceRule["meter"],
		unit: "token",
		unit_size: 1_000_000,
		price_per_unit: price,
		currency: "USD",
		match: [],
		priority: 100,
	};
}

export function textCard(provider: string, model: string, prices: TokenPrices): PriceCard {
	const rules: PriceRule[] = [
		rule("input_text_tokens", prices.input),
		rule("output_text_tokens", prices.output),
	];
	if (prices.cachedRead !== undefined) rules.push(rule("cached_read_text_tokens", prices.cachedRead));
	if (prices.cachedWrite !== undefined) rules.push(rule("cached_write_text_tokens", prices.cachedWrite));
	if (prices.cachedWrite5m !== undefined) rules.push(rule("cached_write_text_tokens_5m", prices.cachedWrite5m));
	if (prices.cachedWrite1h !== undefined) rules.push(rule("cached_write_text_tokens_1h", prices.cachedWrite1h));
	return {
		provider,
		model,
		endpoint: "text.generate",
		version: "test",
		currency: "USD",
		effective_from: null,
		effective_to: null,
		rules,
	} as unknown as PriceCard;
}

/** Exact expected cost in nanos for per-1M-token prices. */
export function expectedNanos(lines: Array<[tokens: number, pricePerMillion: number]>): number {
	return lines.reduce((sum, [tokens, price]) => sum + Math.round(tokens * price * 1000), 0);
}

export function sse(events: Array<{ event?: string; data: unknown }>, done = false): Response {
	const body = events
		.map(({ event, data }) => `${event ? `event: ${event}\n` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`)
		.join("") + (done ? "data: [DONE]\n\n" : "");
	return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
