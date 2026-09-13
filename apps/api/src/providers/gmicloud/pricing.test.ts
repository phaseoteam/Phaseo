import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeBillSummary } from "@pipeline/pricing/engine";

describe("GMI Hy3 Preview catalog pricing", () => {
	const card = JSON.parse(readFileSync(resolve(__dirname, "../../../../../packages/data/catalog/src/data/pricing/gmicloud/tencent-hy3-preview/text.generate/pricing.json"), "utf8"));
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
