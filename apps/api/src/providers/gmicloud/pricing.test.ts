import { describe, expect, it } from "vitest";
import { computeBillSummary } from "@pipeline/pricing/engine";

// Copied from the gmicloud tencent/hy3-preview text.generate price card.
const tier = (meter: string, price: number, gte: number, lt?: number) => ({
	meter,
	unit: "token",
	unit_size: 1000000,
	price_per_unit: price,
	currency: "USD",
	pricing_plan: "standard",
	match: [
		{ path: "input_tokens", op: "gte", value: gte },
		...(lt === undefined ? [] : [{ path: "input_tokens", op: "lt", value: lt }]),
	],
	priority: 100,
});

const card: any = {
	key: "gmicloud:tencent/hy3-preview:text.generate",
	api_provider_id: "gmicloud",
	provider_slug: "gmicloud",
	api_model_id: "tencent/hy3-preview",
	capability_id: "text.generate",
	rules: [
		tier("input_text_tokens", 0.18, 0, 16384),
		tier("output_text_tokens", 0.6, 0, 16384),
		tier("cached_read_text_tokens", 0.06, 0, 16384),
		tier("input_text_tokens", 0.24, 16384, 32768),
		tier("output_text_tokens", 0.96, 16384, 32768),
		tier("cached_read_text_tokens", 0.09, 16384, 32768),
		tier("input_text_tokens", 0.3, 32768),
		tier("output_text_tokens", 1.2, 32768),
		tier("cached_read_text_tokens", 0.12, 32768),
	],
};

describe("GMI Hy3 Preview catalog pricing", () => {
	it.each([
		[16383, 0.18, 0.6, 0.06],
		[16384, 0.24, 0.96, 0.09],
		[32767, 0.24, 0.96, 0.09],
		[32768, 0.30, 1.20, 0.12],
	])("applies the native inclusive context threshold at %i tokens", (tokens, input, output, cached) => {
		const billed = computeBillSummary({ input_text_tokens: tokens, output_text_tokens: 100, cached_read_text_tokens: 10 }, card, { input_tokens: tokens }, "standard");
		expect(Number(billed.cost_usd_str)).toBeCloseTo((tokens * input + 100 * output + 10 * cached) / 1_000_000, 9);
	});
});
