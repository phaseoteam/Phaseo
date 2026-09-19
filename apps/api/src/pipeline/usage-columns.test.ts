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
				output_video_seconds: 4,
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
		expect(columns.usage_video_seconds).toBe(4);
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
	it("persists native embedding tokens and rerank workload in distinct meters", () => {
		const embedding = buildV2RequestUsageMeters({ endpoint: "embeddings", usage: { input_tokens: 42 } });
		expect(embedding).toContainEqual(expect.objectContaining({ meter_key: "embedding_tokens", quantity: 42, billable: false }));
		const rerank = buildV2RequestUsageMeters({ endpoint: "rerank", usage: { rerank_quad_tokens: 12 }, requestPayload: { query: "query", documents: ["document"] } });
		expect(rerank).toContainEqual(expect.objectContaining({ meter_key: "rerank_quad_tokens", quantity: 12 }));
		expect(rerank.some((meter) => meter.meter_key === "embedding_tokens")).toBe(false);
	});

	it.each(["audio.speech", "audio.transcription", "audio.translations"] as const)("separates measured duration for %s without rounding seconds", (endpoint) => {
		const meters = buildV2RequestUsageMeters({ endpoint, usage: { audio_seconds: 2.75 } });
		const expected = endpoint === "audio.speech" ? "speech_seconds" : "transcription_seconds";
		expect(meters).toContainEqual(expect.objectContaining({ meter_key: expected, quantity: 2.75, unit: "seconds", billable: false }));
		expect(meters.filter((meter) => ["speech_seconds", "transcription_seconds"].includes(meter.meter_key))).toHaveLength(1);
	});

	it("does not fabricate durations when only speech characters are available", () => {
		const meters = buildV2RequestUsageMeters({ endpoint: "audio.speech", usage: { input_characters: 100 } });
		expect(meters.some((meter) => meter.meter_key === "speech_seconds")).toBe(false);
	});

	it.each(["chat.completions", "responses", "messages"] as const)("counts image parts once for %s without treating image tokens as counts", (endpoint) => {
		const part = { type: endpoint === "messages" ? "image" : "input_image", image_url: "private-url" };
		const message = { type: "message", role: "user", content: [part, part] };
		const meters = buildV2RequestUsageMeters({ endpoint, usage: { input_image_tokens: 1500 }, requestPayload: endpoint === "responses" ? { input: [message] } : { messages: [message] } });
		expect(meters).toContainEqual(expect.objectContaining({ meter_key: "input_images", quantity: 2 }));
		expect(JSON.stringify(meters)).not.toContain("private-url");
	});

	it("uses observed generated images, not the requested count or image tokens", () => {
		const meters = buildV2RequestUsageMeters({ endpoint: "images.generations", usage: { output_image_tokens: 2000 }, requestPayload: { n: 4 }, gatewayResponse: { data: [{ b64_json: "private" }] } });
		expect(meters).toContainEqual(expect.objectContaining({ meter_key: "output_images", quantity: 1 }));
		expect(JSON.stringify(meters)).not.toContain("private");
	});

	it.each([
		{ image: "private-url", count: 1 },
		{ image: ["private-url", "private-base64"], count: 2 },
		{ image: new Blob(["private-upload"]), count: 1 },
		{ image: [new Blob(["private-upload"]), "private-url"], count: 2 },
	])("counts $count image-edit uploads without counting the mask", ({ image, count }) => {
		const meters = buildV2RequestUsageMeters({
			endpoint: "images.edits", usage: { input_image_tokens: 1500 },
			requestPayload: { image, mask: new Blob(["private-mask"]), n: 4 },
		});
		expect(meters).toContainEqual(expect.objectContaining({ meter_key: "input_images", quantity: count }));
		expect(JSON.stringify(meters)).not.toContain("private");
	});

	it.each(["input_image_count", "input_images", "input_image"])("prefers the explicit %s count over image-edit uploads", (alias) => {
		const meters = buildV2RequestUsageMeters({ endpoint: "images.edits", usage: { [alias]: 3 }, requestPayload: { image: "private-url" } });
		expect(meters).toContainEqual(expect.objectContaining({ meter_key: "input_images", quantity: 3 }));
	});

	it("does not count absent image-edit uploads or top-level images on other endpoints", () => {
		for (const args of [
			{ endpoint: "images.edits" as const, requestPayload: { mask: "private-mask" } },
			{ endpoint: "chat.completions" as const, requestPayload: { image: "private-url" } },
		]) {
			expect(buildV2RequestUsageMeters({ ...args, usage: {} }).some((meter) => meter.meter_key === "input_images")).toBe(false);
		}
	});

	it("projects flexible cache, token, media, and character meters without content", () => {
		const meters = buildV2RequestUsageMeters({
			endpoint: "chat.completions",
			usage: {
				input_tokens: 100,
				output_tokens: 20,
				input_tokens_details: { cached_tokens: 40 },
				output_image_count: 2,
				output_video_seconds: 6.5,
			},
			requestPayload: { messages: [{ role: "user", content: "private prompt" }] },
			gatewayResponse: { output_text: "private response" },
		});

		expect(meters).toEqual(expect.arrayContaining([
			expect.objectContaining({ meter_key: "input_tokens", quantity: 100, unit: "tokens" }),
			expect.objectContaining({ meter_key: "output_tokens", quantity: 20, unit: "tokens" }),
			expect.objectContaining({ meter_key: "cached_input_tokens", quantity: 40, unit: "tokens" }),
			expect.objectContaining({ meter_key: "output_images", quantity: 2, unit: "images" }),
			expect.objectContaining({ meter_key: "output_video_seconds", quantity: 6.5, unit: "seconds" }),
		]));
		expect(JSON.stringify(meters)).not.toContain("private prompt");
		expect(JSON.stringify(meters)).not.toContain("private response");
	});
});
