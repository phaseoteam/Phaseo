import { describe, expect, it } from "vitest";
import { buildGatewayRequestUsageColumns, buildV2RequestUsageMeters } from "./usage-columns";

describe("buildGatewayRequestUsageColumns", () => {
	it("normalizes provider tokens and derives quadtokens from request and response text", () => {
		const columns = buildGatewayRequestUsageColumns({
			usage: {
				input_tokens: 12,
				output_tokens: 4,
				total_tokens: 16,
				output_tokens_details: {
					reasoning_tokens: 2,
				},
			},
			requestPayload: {
				messages: [{ role: "user", content: "hello world" }],
			},
			gatewayResponse: {
				output_text: "done",
			},
			now: new Date("2026-06-10T12:00:00.000Z"),
		});

		expect(columns).toEqual(
			expect.objectContaining({
				usage_input_tokens: 12,
				usage_output_tokens: 4,
				usage_total_tokens: 16,
				usage_reasoning_tokens: 2,
				usage_input_quad_tokens: 4,
				usage_output_quad_tokens: 1,
				usage_total_quad_tokens: 5,
				usage_normalized_at: "2026-06-10T12:00:00.000Z",
			}),
		);
		expect(columns.usage_input_characters).toBeGreaterThanOrEqual(11);
		expect(columns.usage_output_characters).toBe(4);
	});

	it("adds explicit reasoning tokens only when the provider omits total tokens", () => {
		const columns = buildGatewayRequestUsageColumns({
			usage: {
				input_tokens: 12,
				output_tokens: 4,
				reasoning_tokens: 2,
			},
		});

		expect(columns.usage_total_tokens).toBe(18);
		expect(columns.usage_reasoning_tokens).toBe(2);
	});

	it("tracks rerank as text-like quadtokens without pretending it is chat text", () => {
		const columns = buildGatewayRequestUsageColumns({
			endpoint: "rerank",
			usage: { input_tokens: 42, total_tokens: 42 },
			requestPayload: {
				query: "best retrieval strategy",
				documents: ["hybrid search", "cross encoder reranking"],
			},
			now: new Date("2026-06-10T12:00:00.000Z"),
		});

		expect(columns.usage_total_tokens).toBe(42);
		expect(columns.usage_text_quad_tokens).toBeGreaterThan(0);
		expect(columns.usage_rerank_quad_tokens).toBe(columns.usage_text_quad_tokens);
		expect(columns.usage_embedding_quad_tokens).toBe(0);
	});

	it("keeps image, audio, and video workload units separate from quadtokens", () => {
		const columns = buildGatewayRequestUsageColumns({
			endpoint: "video.generation",
			usage: {
				audio_seconds: 12,
				video_pixel_seconds: 1280 * 720 * 4,
			},
			requestPayload: {
				prompt: "a short product clip",
				size: "1024x1024",
				n: 2,
			},
		});

		expect(columns.usage_text_quad_tokens).toBeGreaterThan(0);
		expect(columns.usage_image_megapixels).toBeCloseTo(2.097152);
		expect(columns.usage_audio_seconds).toBe(12);
		expect(columns.usage_video_pixel_seconds).toBe(1280 * 720 * 4);
	});

	it("preserves explicit provider workload unit precision", () => {
		const columns = buildGatewayRequestUsageColumns({
			endpoint: "audio.speech",
			usage: {
				promptTokens: 8,
				completionTokens: 2,
				image_megapixels: 2.5,
				input_audio_seconds: 3.25,
				output_video_pixel_seconds: 1_843_200.5,
			},
			requestPayload: {
				input: "voiceover",
			},
		});

		expect(columns.usage_input_tokens).toBe(8);
		expect(columns.usage_output_tokens).toBe(2);
		expect(columns.usage_total_tokens).toBe(10);
		expect(columns.usage_image_megapixels).toBe(2.5);
		expect(columns.usage_audio_seconds).toBe(3.25);
		expect(columns.usage_video_pixel_seconds).toBe(1_843_200.5);
	});

	it("sums split cache write TTL meters into aggregate request columns", () => {
		const columns = buildGatewayRequestUsageColumns({
			usage: {
				input_tokens: 100,
				output_tokens: 10,
				cache_creation: {
					ephemeral_5m_input_tokens: 8,
					ephemeral_1h_input_tokens: 4,
				},
			},
		});

		expect(columns.usage_cached_write_tokens).toBe(12);
		expect(columns.usage_cached_write_text_tokens).toBe(12);
		expect(columns.usage_cached_write_text_tokens_5m).toBe(8);
		expect(columns.usage_cached_write_text_tokens_1h).toBe(4);
	});
});

describe("buildV2RequestUsageMeters", () => {
	it("projects flexible cache, token, media, and character meters without content", () => {
		const meters = buildV2RequestUsageMeters({
			endpoint: "chat.completions",
			usage: {
				input_tokens: 100,
				output_tokens: 20,
				input_tokens_details: { cached_tokens: 40 },
				output_image_count: 2,
			},
			requestPayload: { messages: [{ role: "user", content: "private prompt" }] },
			gatewayResponse: { output_text: "private response" },
		});

		expect(meters).toEqual(expect.arrayContaining([
			expect.objectContaining({ meter_key: "input_tokens", quantity: 100, unit: "tokens" }),
			expect.objectContaining({ meter_key: "output_tokens", quantity: 20, unit: "tokens" }),
			expect.objectContaining({ meter_key: "cached_input_tokens", quantity: 40, unit: "tokens" }),
			expect.objectContaining({ meter_key: "output_images", quantity: 2, unit: "images" }),
		]));
		expect(JSON.stringify(meters)).not.toContain("private prompt");
		expect(JSON.stringify(meters)).not.toContain("private response");
	});
});
