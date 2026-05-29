import { describe, expect, it, beforeEach, vi } from "vitest";
import type { PriceCard } from "../pricing";
import { calculatePricing, loadProviderPricing } from "./pricing";
import { shapeUsageForClient } from "../usage";

const loadPriceCardMock = vi.hoisted(() => vi.fn());

vi.mock("../pricing", async () => {
	const actual = await vi.importActual<typeof import("../pricing")>("../pricing");
	return {
		...actual,
		loadPriceCard: (...args: Parameters<typeof actual.loadPriceCard>) =>
			loadPriceCardMock(...args),
	};
});

const IMAGE_CARD: PriceCard = {
	provider: "openai",
	model: "openai/gpt-image-1-mini",
	endpoint: "images.generations",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			meter: "output_image",
			unit: "image",
			unit_size: 1,
			price_per_unit: "0.036",
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [
				{ path: "image_params.quality", op: "eq", value: "high", or_group: 1, and_index: 1 },
				{ path: "image_params.resolution", op: "eq", value: "1024x1024", or_group: 1, and_index: 2 },
			],
			priority: 100,
		},
	],
};

const TTS_CARD: PriceCard = {
	provider: "openai",
	model: "openai/gpt-4o-mini-tts",
	endpoint: "audio.speech",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			meter: "input_text_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: "0.6",
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [],
			priority: 100,
		},
		{
			meter: "output_audio_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: "12",
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [],
			priority: 100,
		},
	],
};

describe("after/pricing calculatePricing", () => {
	beforeEach(() => {
		loadPriceCardMock.mockReset();
	});

	it("passes image request options through to rule matching", () => {
		const result = calculatePricing(
			{ output_image: 1 },
			IMAGE_CARD,
			{ size: "1024x1024", quality: "high" },
		);

		expect(result.totalNanos).toBe(36_000_000);
		expect(result.totalCents).toBe(3);
		expect(result.pricedUsage?.pricing?.lines?.[0]?.dimension).toBe("output_image");
	});

	it("does not match image rules when request options disagree", () => {
		const result = calculatePricing(
			{ output_image: 1 },
			IMAGE_CARD,
			{ size: "1536x1024", quality: "high" },
		);

		expect(result.totalNanos).toBe(0);
		expect(result.totalCents).toBe(0);
		expect(result.pricedUsage?.pricing?.lines ?? []).toHaveLength(0);
	});

	it("infers image pricing qualifiers from output tokens when the request used auto defaults", () => {
		const result = calculatePricing(
			{
				output_image: 1,
				output_tokens: 4160,
			},
			IMAGE_CARD,
			{ size: "auto", quality: "auto" },
		);

		expect(result.totalNanos).toBe(36_000_000);
		expect(result.totalCents).toBe(3);
		expect(result.pricedUsage?.pricing?.lines?.[0]?.dimension).toBe("output_image");
	});

	it("prices raw audio token meters even when client shaping moves them into details", () => {
		const rawUsage = {
			input_text_tokens: 10,
			output_audio_tokens: 71,
			inputTokens: 10,
			outputTokens: 71,
			totalTokens: 81,
			output_audio_seconds: 3.552,
		};
		const mergedUsage = {
			...rawUsage,
			...shapeUsageForClient(rawUsage, { endpoint: "audio.speech", body: {} }),
		};

		const result = calculatePricing(
			mergedUsage,
			TTS_CARD,
			{},
		);

		expect(result.totalNanos).toBe(858_000);
		expect(result.pricedUsage?.pricing?.lines?.map((line: any) => line.dimension)).toEqual([
			"input_text_tokens",
			"output_audio_tokens",
		]);
	});

	it("prefers the remapped provider-model pricing card when present in context", async () => {
		const ctx = {
			model: "anthropic/claude-opus-4.8",
			capability: "text.generate",
			pricing: {
				"venice:anthropic/claude-opus-4.8-fast": {
					...TTS_CARD,
					provider: "venice",
					model: "anthropic/claude-opus-4.8-fast",
				},
			},
		} as any;

		const card = await loadProviderPricing(ctx, {
			provider: "venice",
			apiModelId: "anthropic/claude-opus-4.8-fast",
			pricingKey: "venice:anthropic/claude-opus-4.8-fast",
			generationTimeMs: 0,
			kind: "completed",
			bill: { usage: {} } as any,
			upstream: new Response(null, { status: 200 }),
		});

		expect(card?.model).toBe("anthropic/claude-opus-4.8-fast");
		expect(loadPriceCardMock).not.toHaveBeenCalled();
	});

	it("falls back to loading the remapped api model pricing when context pricing is missing", async () => {
		loadPriceCardMock.mockResolvedValue({
			...TTS_CARD,
			provider: "venice",
			model: "anthropic/claude-opus-4.8-fast",
		});

		const card = await loadProviderPricing(
			{
				model: "anthropic/claude-opus-4.8",
				capability: "text.generate",
				pricing: {},
			} as any,
			{
				provider: "venice",
				apiModelId: "anthropic/claude-opus-4.8-fast",
				generationTimeMs: 0,
				kind: "completed",
				bill: { usage: {} } as any,
				upstream: new Response(null, { status: 200 }),
			},
		);

		expect(loadPriceCardMock).toHaveBeenCalledWith(
			"venice",
			"anthropic/claude-opus-4.8-fast",
			"text.generate",
		);
		expect(card?.model).toBe("anthropic/claude-opus-4.8-fast");
	});
});
