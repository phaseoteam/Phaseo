import { describe, expect, it } from "vitest";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { googleUsageMetadataToIRUsage } from "@providers/google-ai-studio/usage";
import { computeBillSummary } from "./engine";
import type { PriceCard, PriceRule } from "./types";

const rule = (meter: string, price: string, extra: Partial<PriceRule> = {}): PriceRule => ({
	id: `${extra.pricing_plan ?? "standard"}:${meter}`,
	pricing_plan: "standard",
	meter: meter as PriceRule["meter"],
	unit: "token",
	unit_size: 1_000_000,
	price_per_unit: price,
	currency: "USD",
	match: [],
	priority: 100,
	...extra,
});

const card = (rules: PriceRule[]): PriceCard => ({
	provider: "google-vertex",
	model: "google/gemini-2.5-flash",
	endpoint: "text.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules,
});

const geminiCard = card([
	rule("input_text_tokens", "0.3"),
	rule("input_image_tokens", "0.6"),
	rule("input_audio_tokens", "1"),
	rule("output_text_tokens", "2.5"),
	rule("cached_read_text_tokens", "0.03"),
]);

const quantities = (usage: Record<string, unknown>, priceCard: PriceCard, plan?: string) =>
	Object.fromEntries(
		computeBillSummary(usage, priceCard, {}, plan).lines.map((line) => [line.dimension, line.quantity]),
	);

describe("pricing engine image, audio and video input", () => {
	it("moves priced image and audio tokens out of a prompt total that includes them", () => {
		// Client-shaped usage: input_tokens is the whole prompt, cache reads inside it.
		const usage = {
			input_tokens: 10_050,
			output_tokens: 1_500,
			input_tokens_details: { cached_tokens: 4_000 },
			cached_read_tokens_are_subset_of_input: true,
			input_image_tokens: 700,
			input_audio_tokens: 300,
		};

		expect(quantities(usage, geminiCard)).toEqual({
			input_text_tokens: 5_050,
			input_image_tokens: 700,
			input_audio_tokens: 300,
			cached_read_text_tokens: 4_000,
			output_text_tokens: 1_500,
		});
	});

	it("treats an input_text_tokens equal to the uncached prompt total as covering the media too", () => {
		// normalizeTextUsageForPricing writes input_text_tokens = input - cache read.
		const usage = {
			input_tokens: 10_050,
			input_text_tokens: 6_050,
			output_tokens: 1_500,
			cached_read_text_tokens: 4_000,
			cached_read_tokens_are_subset_of_input: true,
			input_image_tokens: 700,
		};

		expect(quantities(usage, geminiCard)).toMatchObject({ input_text_tokens: 5_350, input_image_tokens: 700 });
	});

	it("keeps media tokens in text when the card has no row for them", () => {
		const textOnly = card([rule("input_text_tokens", "0.3"), rule("output_text_tokens", "2.5")]);
		const usage = { input_tokens: 1_000, output_tokens: 10, input_image_tokens: 200, input_audio_tokens: 50 };

		expect(quantities(usage, textOnly)).toEqual({ input_text_tokens: 1_000, output_text_tokens: 10 });
	});

	it("leaves an explicit text-only input_text_tokens alone", () => {
		// No separate prompt total: the text meter is text alone (image endpoints, realtime).
		const usage = { input_text_tokens: 1_000, input_image_tokens: 200, output_text_tokens: 10 };

		expect(quantities(usage, geminiCard)).toMatchObject({ input_text_tokens: 1_000, input_image_tokens: 200 });

		const withTotal = { input_tokens: 1_200, input_text_tokens: 1_000, input_image_tokens: 200, output_tokens: 10 };
		expect(quantities(withTotal, geminiCard)).toMatchObject({ input_text_tokens: 1_000, input_image_tokens: 200 });
	});

	it("prices a conditional modality rule by its match and keeps failing closed when none matches", () => {
		const conditional = card([
			rule("input_text_tokens", "0.3"),
			rule("output_text_tokens", "2.5"),
			rule("input_audio_tokens", "1", { id: "audio-short", match: [{ path: "input_tokens", op: "lte", value: 200_000 }] as any }),
		]);

		expect(quantities({ input_tokens: 1_000, output_tokens: 10, input_audio_tokens: 100 }, conditional))
			.toEqual({ input_text_tokens: 900, input_audio_tokens: 100, output_text_tokens: 10 });
		expect(() => quantities({ input_tokens: 300_000, output_tokens: 10, input_audio_tokens: 100 }, conditional))
			.toThrow("pricing_rule_missing:input_audio_tokens");
	});

	it("bills cached Gemini media once, as a cache read, from usageMetadata to the bill", () => {
		// 1,000-token prompt: 900 image tokens, 800 of them cached.
		const ir = googleUsageMetadataToIRUsage({
			promptTokenCount: 1_000,
			cachedContentTokenCount: 800,
			candidatesTokenCount: 10,
			totalTokenCount: 1_010,
			promptTokensDetails: [{ modality: "TEXT", tokenCount: 100 }, { modality: "IMAGE", tokenCount: 900 }],
			cacheTokensDetails: [{ modality: "IMAGE", tokenCount: 800 }],
		});
		expect(ir?._ext?.inputImageTokens).toBe(100);

		expect(quantities(normalizeTextUsageForPricing(ir) as Record<string, unknown>, geminiCard)).toEqual({
			input_text_tokens: 100,
			input_image_tokens: 100,
			cached_read_text_tokens: 800,
			output_text_tokens: 10,
		});
	});

	it("uses the standard rule for a plan that does not price the modality", () => {
		const withFlex = card([
			rule("input_text_tokens", "0.3"),
			rule("output_text_tokens", "2.5"),
			rule("input_image_tokens", "0.6"),
			rule("input_text_tokens", "0.15", { pricing_plan: "flex" }),
			rule("output_text_tokens", "1.25", { pricing_plan: "flex" }),
		]);
		const usage = { input_tokens: 1_000, output_tokens: 10, input_image_tokens: 200 };

		expect(quantities(usage, withFlex, "flex")).toEqual({ input_text_tokens: 800, input_image_tokens: 200, output_text_tokens: 10 });
	});
});
