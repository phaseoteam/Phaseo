import { describe, expect, it } from "vitest";
import type { PriceCard } from "@pipeline/pricing/types";
import { priceServerToolResult } from "./server-tool-pricing";
import { calculatePricing } from "@pipeline/after/pricing";

function rule(meter: string, pricePerMillion: number) {
	return { meter, unit: "token", unit_size: 1_000_000, price_per_unit: String(pricePerMillion), currency: "USD", pricing_plan: "standard", match: [], priority: 100 };
}

// GPT Image 2.6 Flare standard prices (USD per 1M tokens).
const imageCard = {
	provider: "openai", model: "openai/gpt-image-2.6-flare", endpoint: "image.generate", currency: "USD",
	effective_from: null, effective_to: null, version: null,
	rules: [rule("input_text_tokens", 5), rule("input_image_tokens", 8), rule("output_image_tokens", 30)],
} as unknown as PriceCard;
// GPT-5 nano standard prices, the chat model in these requests.
const chatCard = {
	provider: "openai", model: "openai/gpt-5-nano", endpoint: "text.generate", currency: "USD",
	effective_from: null, effective_to: null, version: null,
	rules: [rule("input_text_tokens", 0.05), rule("output_text_tokens", 0.4)],
} as unknown as PriceCard;

function imageCtx(overrides: Record<string, unknown> = {}) {
	return {
		pricing: { openai: imageCard },
		endpoint: "images.generations",
		capability: "image.generate",
		model: "openai/gpt-image-2.6-flare",
		meta: {},
		teamEnrichment: null,
		...overrides,
	} as any;
}

// 81 × $5/M + 824 × $30/M, from a real low-quality GPT Image 2.6 Flare request.
const IMAGE_NANOS = 405_000 + 24_720_000;

describe("priceServerToolResult", () => {
	it("prices a tool image on the image model's own card", async () => {
		const priced = await priceServerToolResult({
			ctx: imageCtx(),
			result: { provider: "openai", bill: { usage: { input_text_tokens: 81, output_image_tokens: 824, requests: 1 } } },
			payloadUsage: undefined,
			body: { model: "openai/gpt-image-2.6-flare", prompt: "An apple" },
			component: "image_generation",
			model: "openai/gpt-image-2.6-flare",
		});

		expect(priced.total_nanos).toBe(IMAGE_NANOS);
		expect(priced.lines.map((line) => [line.dimension, line.component, line.model])).toEqual([
			["input_text_tokens", "image_generation", "openai/gpt-image-2.6-flare"],
			["output_image_tokens", "image_generation", "openai/gpt-image-2.6-flare"],
		]);
	});

	it("keeps the SVG author's charge and names its model", async () => {
		const svgAuthor = {
			total_nanos: 3_944_200,
			lines: [{ dimension: "output_text_tokens", quantity: 9628, line_nanos: 3_851_200, model: "openai/gpt-5-nano", component: "svg_author" }],
		};
		const priced = await priceServerToolResult({
			ctx: imageCtx(),
			result: { provider: "openai", bill: { usage: { input_text_tokens: 81, output_image_tokens: 824, svg_author_pricing: svgAuthor } } },
			payloadUsage: undefined,
			body: { model: "openai/gpt-image-2.6-flare", prompt: "An apple", output_format: "svg" },
			component: "image_generation",
			model: "openai/gpt-image-2.6-flare",
		});

		expect(priced.total_nanos).toBe(IMAGE_NANOS + 3_944_200);
		expect(priced.lines.at(-1)).toMatchObject({ component: "image_generation.svg_author", model: "openai/gpt-5-nano" });
	});

	it("charges nothing for authorized internal tests", async () => {
		const priced = await priceServerToolResult({
			ctx: imageCtx({ testingMode: true, billableInternalTesting: false, pricing: {} }),
			result: { provider: "openai", bill: { usage: { output_image_tokens: 824 } } },
			payloadUsage: undefined,
			body: {},
			component: "image_generation",
			model: "openai/gpt-image-2.6-flare",
		});
		expect(priced).toMatchObject({ total_nanos: 0, lines: [] });
	});
});

describe("calculatePricing with server tool charges", () => {
	it("adds tool images to the chat request's total without pricing image tokens on the chat card", () => {
		const imageCharge = { component: "image_generation", model: "openai/gpt-image-2.6-flare", provider: "openai", total_nanos: IMAGE_NANOS, lines: [{ dimension: "output_image_tokens", line_nanos: 24_720_000 }] };
		// 1,299 × $0.05/M + 2,602 × $0.40/M for the chat model itself.
		const chatNanos = 64_950 + 1_040_800;
		const priced = calculatePricing(
			{ input_text_tokens: 1299, output_text_tokens: 2602 },
			chatCard,
			{ model: "openai/gpt-5-nano" },
			"basic",
			{ serverToolPricing: [imageCharge, imageCharge] } as any,
		);

		expect(priced.totalNanos).toBe(chatNanos + 2 * IMAGE_NANOS);
		expect(priced.totalCents).toBe(Math.trunc((chatNanos + 2 * IMAGE_NANOS) / 10_000_000));
		expect(priced.pricedUsage.pricing.lines).toHaveLength(4);
	});

	it("rejects a malformed tool charge instead of billing it", () => {
		expect(() => calculatePricing({ input_text_tokens: 1 }, chatCard, {}, "basic", { serverToolPricing: [{ total_nanos: 1.5, lines: [] }] } as any))
			.toThrow("server_tool_pricing_invalid");
	});
});
