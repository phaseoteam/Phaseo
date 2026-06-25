import { describe, expect, it } from "vitest";
import { shapeUsageForClient, stripUsagePricing } from "./usage";

describe("shapeUsageForClient", () => {
	it("preserves multimodal token details and exposes top-level token meters", () => {
		const shaped = shapeUsageForClient({
			input_tokens: 66,
			output_tokens: 1536,
			total_tokens: 2027,
			input_tokens_details: {
				input_images: 12,
			},
			output_tokens_details: {
				reasoning_tokens: 425,
				output_images: 1120,
			},
		});

		expect(shaped.input_tokens_details.input_images).toBe(12);
		expect(shaped.output_tokens_details.reasoning_tokens).toBe(425);
		expect(shaped.output_tokens_details.output_images).toBe(1120);
		expect(shaped.input_image_tokens).toBeUndefined();
		expect(shaped.output_image_tokens).toBeUndefined();
	});

	it("falls back to count-based image details when token details are unavailable", () => {
		const shaped = shapeUsageForClient({
			input_tokens: 10,
			output_tokens: 20,
			total_tokens: 30,
			input_image_count: 2,
			output_image_count: 1,
		});

		expect(shaped.input_tokens_details.input_images).toBe(2);
		expect(shaped.output_tokens_details.output_images).toBe(1);
		expect(shaped.input_image_tokens).toBeUndefined();
		expect(shaped.output_image_tokens).toBeUndefined();
	});

	it("derives canonical token split when only total_tokens is provided", () => {
		const shaped = shapeUsageForClient({
			total_tokens: 12,
		});

		expect(shaped.input_tokens).toBe(12);
		expect(shaped.output_tokens).toBe(0);
		expect(shaped.total_tokens).toBe(12);
		expect(shaped.input_text_tokens).toBeUndefined();
		expect(shaped.output_text_tokens).toBeUndefined();
		expect(shaped.requests).toBe(1);
	});

	it("preserves explicit request meter when provider reports one", () => {
		const shaped = shapeUsageForClient({
			input_tokens: 2,
			output_tokens: 3,
			total_tokens: 5,
			request_count: 7,
		});

		expect(shaped.requests).toBe(7);
	});

	it("normalizes common provider token aliases", () => {
		const shaped = shapeUsageForClient({
			promptTokens: 11,
			completion_token_count: 5,
			totalTokenCount: 16,
		});

		expect(shaped.input_tokens).toBe(11);
		expect(shaped.output_tokens).toBe(5);
		expect(shaped.total_tokens).toBe(16);
	});

	it("preserves non-token workload meters for downstream usage columns", () => {
		const shaped = shapeUsageForClient({
			total_tokens: 12,
			input_characters: 44,
			output_characters: 20,
			image_megapixels: 2.5,
			input_audio_seconds: 3.25,
			output_audio_seconds: 4.5,
			video_pixels: 921_600,
			output_video_seconds: 6.75,
			input_pages: 2,
			document_bytes: 1024,
		});

		expect(shaped.input_characters).toBe(44);
		expect(shaped.output_characters).toBe(20);
		expect(shaped.image_megapixels).toBe(2.5);
		expect(shaped.input_audio_seconds).toBe(3.25);
		expect(shaped.output_audio_seconds).toBe(4.5);
		expect(shaped.video_pixels).toBe(921_600);
		expect(shaped.output_video_seconds).toBe(6.75);
		expect(shaped.input_pages).toBe(2);
		expect(shaped.document_bytes).toBe(1024);
	});

	it("defaults text endpoints to one request when usage has no token meters", () => {
		const shaped = shapeUsageForClient(
			{},
			{ endpoint: "responses", body: {} },
		);

		expect(shaped.requests).toBe(1);
		expect(shaped.total_tokens).toBe(0);
	});

	it("maps Anthropic cache usage fields to gateway cache meters", () => {
		const shaped = shapeUsageForClient({
			input_tokens: 100,
			output_tokens: 20,
			total_tokens: 120,
			cache_read_input_tokens: 45,
			cache_creation_input_tokens: 12,
			cache_creation: {
				ephemeral_5m_input_tokens: 8,
				ephemeral_1h_input_tokens: 4,
			},
		});

		expect(shaped.cached_read_text_tokens).toBeUndefined();
		expect(shaped.cached_write_text_tokens).toBe(12);
		expect(shaped.cached_write_text_tokens_5m).toBe(8);
		expect(shaped.cached_write_text_tokens_1h).toBe(4);
		expect(shaped.input_text_tokens).toBeUndefined();
		expect(shaped.input_tokens_details.cached_tokens).toBe(45);
		expect(shaped.output_tokens_details.cached_tokens).toBe(12);
	});

	it("maps China-lab cache hit aliases to client cached-token details", () => {
		const shaped = shapeUsageForClient({
			prompt_tokens: 100,
			completion_tokens: 5,
			total_tokens: 105,
			prompt_cache_hit_tokens: 42,
		});

		expect(shaped.input_tokens).toBe(100);
		expect(shaped.output_tokens).toBe(5);
		expect(shaped.input_tokens_details.cached_tokens).toBe(42);
	});

	it("maps OpenAI-compatible explicit cache creation aliases to output cached-token details", () => {
		const shaped = shapeUsageForClient({
			input_tokens: 100,
			output_tokens: 5,
			total_tokens: 105,
			input_tokens_details: {
				cache_creation_input_tokens: 31,
			},
		});

		expect(shaped.output_tokens_details.cached_tokens).toBe(31);
	});

	it("keeps canonical token totals without exposing legacy uncached-input aliases", () => {
		const shaped = shapeUsageForClient({
			input_tokens: 123,
			output_tokens: 9,
			total_tokens: 132,
			input_text_tokens: 123,
			input_tokens_details: {
				cached_tokens: 64,
			},
		});

		expect(shaped.input_tokens).toBe(123);
		expect(shaped.input_tokens_details.cached_tokens).toBe(64);
	});

	it("does not expose internal cached-read subset hints by default", () => {
		const shaped = shapeUsageForClient({
			_provider_id: "x-ai",
			input_tokens: 123,
			output_tokens: 9,
			total_tokens: 132,
			input_text_tokens: 123,
			input_tokens_details: {
				cached_tokens: 64,
			},
		});

		expect(shaped.input_tokens).toBe(123);
		expect(shaped.input_tokens_details.cached_tokens).toBe(64);
		expect((shaped as any).cached_read_tokens_are_subset_of_input).toBeUndefined();
	});

	it("can include internal cached-read subset hints when requested", () => {
		const shaped = shapeUsageForClient({
			_provider_id: "google-ai-studio",
			input_tokens: 200,
			output_tokens: 10,
			total_tokens: 210,
			cached_read_text_tokens: 150,
		}, { includeInternalHints: true });

		expect(shaped.input_tokens).toBe(200);
		expect(shaped.input_tokens_details.cached_tokens).toBe(150);
		expect((shaped as any).cached_read_tokens_are_subset_of_input).toBe(true);
	});

	it("does not include internal hints when providers opt out of cached-read subtraction", () => {
		const shaped = shapeUsageForClient({
			input_tokens: 123,
			output_tokens: 9,
			total_tokens: 132,
			input_text_tokens: 123,
			cached_read_text_tokens: 64,
			cached_read_tokens_are_subset_of_input: false,
		});

		expect(shaped.input_tokens).toBe(123);
		expect(shaped.input_tokens_details.cached_tokens).toBe(64);
		expect((shaped as any).cached_read_tokens_are_subset_of_input).toBeUndefined();
	});
});

describe("stripUsagePricing", () => {
	it("removes pricing fields and keeps usage meters", () => {
		const stripped = stripUsagePricing({
			input_tokens: 120,
			output_tokens: 20,
			total_tokens: 140,
			requests: 1,
			pricing: { total_nanos: 1234 },
			pricing_breakdown: { total_nanos: 5678 },
			cost_usd: 0.0001,
			cost_usd_str: "0.0001",
			cost_cents: 1,
			currency: "USD",
		});

		expect(stripped.input_tokens).toBe(120);
		expect(stripped.output_tokens).toBe(20);
		expect(stripped.total_tokens).toBe(140);
		expect(stripped.requests).toBe(1);
		expect(stripped.pricing).toBeUndefined();
		expect(stripped.pricing_breakdown).toBeUndefined();
		expect(stripped.cost_usd).toBeUndefined();
		expect(stripped.cost_usd_str).toBeUndefined();
		expect(stripped.cost_cents).toBeUndefined();
		expect(stripped.currency).toBeUndefined();
	});
});
