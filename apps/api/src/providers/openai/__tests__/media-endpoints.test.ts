import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { sseResponse } from "../../../../tests/helpers/sse";
import { exec as execImages } from "../endpoints/images";
import { exec as execImageEdits } from "../endpoints/images-edits";
import { exec as execSpeech } from "../endpoints/audio-speech";
import { exec as execTranscription } from "../endpoints/audio-transcription";
import { exec as execTranslation } from "../endpoints/audio-translation";

const REQUEST_META = {
	requestId: "req_test_media_1",
	apiKeyId: "key_test",
	apiKeyRef: "kid_test",
	apiKeyKid: "kid_test",
};

const PRICING_CARD = {
	provider: "openai",
	model: "test-model",
	endpoint: "images.generations",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			meter: "requests",
			unit: "request",
			unit_size: 1,
			price_per_unit: 1,
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [],
			priority: 100,
			effective_from: null,
			effective_to: null,
		},
	],
} as any;

const IMAGE_DIMENSION_PRICING_CARD = {
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
			price_per_unit: 0.036,
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [
				{ path: "image_params.quality", op: "eq", value: "high", or_group: 1, and_index: 1 },
				{ path: "image_params.resolution", op: "eq", value: "1024x1024", or_group: 1, and_index: 2 },
			],
			priority: 100,
			effective_from: null,
			effective_to: null,
		},
	],
} as any;

const GPT_IMAGE_2_TOKEN_PRICING_CARD = {
	provider: "openai",
	model: "openai/gpt-image-2",
	endpoint: "images.generations",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			meter: "input_text_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: 5,
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [],
			priority: 100,
			effective_from: null,
			effective_to: null,
		},
		{
			meter: "output_image_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: 32,
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [],
			priority: 100,
			effective_from: null,
			effective_to: null,
		},
		{
			meter: "input_image_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: 8,
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [],
			priority: 100,
			effective_from: null,
			effective_to: null,
		},
	],
} as any;

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

function makeAudioFile(filename = "audio.wav"): File {
	return new File([new Uint8Array([1, 2, 3])], filename, { type: "audio/wav" });
}

function makeWavBytes(durationSeconds: number, sampleRate = 24000, channels = 1, bitsPerSample = 16): Uint8Array {
	const bytesPerSample = bitsPerSample / 8;
	const dataSize = Math.round(durationSeconds * sampleRate * channels * bytesPerSample);
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	const writeAscii = (offset: number, value: string) => {
		for (let i = 0; i < value.length; i += 1) {
			bytes[offset + i] = value.charCodeAt(i);
		}
	};

	writeAscii(0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeAscii(8, "WAVE");
	writeAscii(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channels * bytesPerSample, true);
	view.setUint16(32, channels * bytesPerSample, true);
	view.setUint16(34, bitsPerSample, true);
	writeAscii(36, "data");
	view.setUint32(40, dataSize, true);

	return bytes;
}

describe("OpenAI media endpoints", () => {
	it("forwards GPT image generation parameters", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/images/generations"),
				response: jsonResponse({
					created: 1700000000,
					data: [{ b64_json: "abc" }],
					usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execImages({
			endpoint: "images.generations",
			model: "openai/gpt-image-1",
			body: {
				model: "openai/gpt-image-1",
				prompt: "A neon bird over a city.",
				size: "1024x1024",
				quality: "high",
				background: "transparent",
				moderation: "low",
				output_format: "webp",
				output_compression: 60,
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody.model).toBe("openai/gpt-image-1");
		expect(capturedBody.background).toBe("transparent");
		expect(capturedBody.moderation).toBe("low");
		expect(capturedBody.output_format).toBe("webp");
		expect(capturedBody.output_compression).toBe(60);
	});

	it("prices image generations using output_image + image_params context", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/images/generations"),
				response: jsonResponse({
					created: 1700000000,
					data: [{ b64_json: "abc" }],
					usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
				}),
			},
		]);

		const result = await execImages({
			endpoint: "images.generations",
			model: "openai/dall-e-3",
			body: {
				model: "openai/dall-e-3",
				prompt: "A stylized mountain scene",
				size: "1024x1024",
				quality: "high",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: IMAGE_DIMENSION_PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(result.bill.usage?.output_image).toBe(1);
		expect(result.bill.usage?.pricing?.lines?.some((line: any) => line.dimension === "output_image")).toBe(true);
		expect(result.bill.usage?.pricing?.total_nanos).toBe(36_000_000);
	});

	it("prices GPT Image 2 from image tokens for every documented preset resolution", async () => {
		const sizes = ["2048x2048", "2048x1152", "3840x2160", "2160x3840"];

		for (const size of sizes) {
			let capturedBody: any = null;
			const mock = installFetchMock([
				{
					match: (url) => url.includes("/images/generations"),
					response: jsonResponse({
						created: 1700000000,
						data: [{ b64_json: "abc" }],
						usage: {
							input_tokens: 10,
							output_tokens: 6594,
							total_tokens: 6604,
							input_tokens_details: { text_tokens: 10 },
						},
					}),
					onRequest: (call) => {
						capturedBody = call.bodyJson;
					},
				},
			]);

			const result = await execImages({
				endpoint: "images.generations",
				model: "openai/gpt-image-2",
				body: { model: "openai/gpt-image-2", prompt: "A poster", size, quality: "high" },
				meta: REQUEST_META,
				workspaceId: "team_test",
				providerId: "openai",
				byokMeta: [],
				pricingCard: GPT_IMAGE_2_TOKEN_PRICING_CARD,
				providerModelSlug: null,
				stream: false,
			} as any);

			mock.restore();
			expect(capturedBody.size).toBe(size);
			expect(result.bill.usage?.output_image_tokens).toBe(6594);
			expect(result.bill.usage?.pricing?.lines).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ dimension: "output_image_tokens", line_nanos: 211_008_000 }),
				]),
			);
			expect(result.bill.usage?.pricing?.lines?.some((line: any) => line.dimension === "output_image")).toBe(false);
			expect(result.bill.usage?.pricing?.total_nanos).toBe(211_058_000);
		}
	});

	it("prefers resolved native quality and size when request uses auto defaults", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/images/generations"),
				response: jsonResponse({
					created: 1700000000,
					data: [{ b64_json: "abc" }],
					output_format: "png",
					quality: "high",
					size: "1024x1536",
					usage: {
						input_tokens: 12,
						output_tokens: 6240,
						total_tokens: 6252,
					},
				}),
			},
		]);

		const result = await execImages({
			endpoint: "images.generations",
			model: "openai/dall-e-3",
			body: {
				model: "openai/dall-e-3",
				prompt: "A posterized night sky",
				size: "auto",
				quality: "auto",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: {
				...IMAGE_DIMENSION_PRICING_CARD,
				rules: [
					{
						...IMAGE_DIMENSION_PRICING_CARD.rules[0],
						match: [
							{ path: "image_params.quality", op: "eq", value: "high", or_group: 1, and_index: 1 },
							{ path: "image_params.resolution", op: "eq", value: "1024x1536", or_group: 1, and_index: 2 },
						],
						price_per_unit: 0.052,
					},
				],
			},
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(result.normalized?.quality).toBe("high");
		expect(result.normalized?.size).toBe("1024x1536");
		expect(result.normalized?.output_format).toBe("png");
		expect(result.bill.usage?.quality).toBe("high");
		expect(result.bill.usage?.size).toBe("1024x1536");
		expect(result.bill.usage?.pricing?.lines?.some((line: any) => line.dimension === "output_image")).toBe(true);
		expect(result.bill.usage?.pricing?.total_nanos).toBe(52_000_000);
	});

	it("forwards GPT image edit parameters", async () => {
		let outputFormat: string | null = null;
		let outputCompression: string | null = null;
		let moderation: string | null = null;
		let inputFidelity: string | null = null;

		const mock = installFetchMock([
			{
				match: (url, init) => {
					if (!url.includes("/images/edits")) return false;
					const form = init?.body as FormData | undefined;
					if (form && typeof (form as any).get === "function") {
						outputFormat = String(form.get("output_format") ?? "");
						outputCompression = String(form.get("output_compression") ?? "");
						moderation = String(form.get("moderation") ?? "");
						inputFidelity = String(form.get("input_fidelity") ?? "");
					}
					return true;
				},
				response: jsonResponse({
					created: 1700000001,
					data: [{ b64_json: "xyz" }],
				}),
			},
		]);

		const pngData = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
		const result = await execImageEdits({
			endpoint: "images.edits",
			model: "openai/gpt-image-1",
			body: {
				model: "openai/gpt-image-1",
				image: pngData,
				prompt: "Make the sky dusk.",
				output_format: "png",
				output_compression: 90,
				moderation: "low",
				input_fidelity: "high",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "images.edits" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(outputFormat).toBe("png");
		expect(outputCompression).toBe("90");
		expect(moderation).toBe("low");
		expect(inputFidelity).toBe("high");
	});

	it("prices GPT Image 2 edits from image tokens", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/images/edits"),
				response: jsonResponse({
					created: 1700000001,
					data: [{ b64_json: "xyz" }],
					usage: {
						input_tokens: 110,
						output_tokens: 6594,
						total_tokens: 6704,
						input_tokens_details: { text_tokens: 10, image_tokens: 100 },
					},
				}),
			},
		]);

		const pngData = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
		const result = await execImageEdits({
			endpoint: "images.edits",
			model: "openai/gpt-image-2",
			body: { model: "openai/gpt-image-2", image: pngData, prompt: "Make it dusk", size: "2048x1152" },
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...GPT_IMAGE_2_TOKEN_PRICING_CARD, endpoint: "images.edits" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();
		expect(result.bill.usage?.input_text_tokens).toBe(10);
		expect(result.bill.usage?.input_image_tokens).toBe(100);
		expect(result.bill.usage?.output_image_tokens).toBe(6594);
		expect(result.bill.usage?.pricing?.lines?.some((line: any) => line.dimension === "output_image")).toBe(false);
		expect(result.bill.usage?.pricing?.total_nanos).toBe(211_858_000);
	});

	it("uses OpenAI-native response_format for speech", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/audio/speech"),
				response: sseResponse([
					{ type: "speech.audio.delta", audio: Buffer.from([0, 1, 2, 3]).toString("base64") },
					{ type: "speech.audio.done", usage: { input_tokens: 10, output_tokens: 91, total_tokens: 101 } },
					"[DONE]",
				]),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "openai/gpt-4o-mini-tts",
				body: {
					model: "openai/gpt-4o-mini-tts",
					input: "Hello world",
					voice: "alloy",
					response_format: "wav",
				},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.speech" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody.response_format).toBe("wav");
		expect(capturedBody.stream_format).toBe("sse");
		expect(capturedBody.format).toBeUndefined();
	});

	it("rejects stream_format for speech", async () => {
		await expect(execSpeech({
			endpoint: "audio.speech",
			model: "openai/gpt-4o-mini-tts",
			body: {
				model: "openai/gpt-4o-mini-tts",
				input: "Hello world",
				voice: "alloy",
				response_format: "wav",
				stream_format: "sse",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.speech" },
			providerModelSlug: null,
			stream: false,
		} as any)).rejects.toThrow(/stream_format/i);
	});

	it("fails when OpenAI speech response does not include authoritative usage", async () => {
		const wavBytes = makeWavBytes(1);
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/audio/speech"),
				response: new Response(wavBytes, {
					status: 200,
					headers: {
						"Content-Type": "audio/wav",
						"x-request-id": "req_openai_tts_usage_test",
					},
				}),
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "openai/gpt-4o-mini-tts",
			body: {
				model: "openai/gpt-4o-mini-tts",
				input: "Hello world",
				voice: "alloy",
				response_format: "wav",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.speech" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(502);
		expect(result.bill.upstream_id).toBe("req_openai_tts_usage_test");
		expect(result.bill.usage).toBeUndefined();
		const payload = await result.upstream.clone().json();
		expect(payload?.error?.type).toBe("upstream_usage_missing");
	});

	it("allows non-SSE binary speech responses for non-OpenAI compat providers", async () => {
		const wavBytes = makeWavBytes(1);
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/audio/speech"),
				response: new Response(wavBytes, {
					status: 200,
					headers: {
						"Content-Type": "audio/wav",
						"x-request-id": "req_compat_tts_binary_test",
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "tts-1",
			body: {
				model: "tts-1",
				input: "Hello compat world",
				voice: "alloy",
				response_format: "wav",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "deepseek",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.speech" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(result.upstream.headers.get("content-type")).toContain("audio/wav");
		expect(capturedBody.stream_format).toBeUndefined();
		expect(result.bill.upstream_id).toBe("req_compat_tts_binary_test");
		expect(result.bill.usage).toBeUndefined();
	});

	it("prefers authoritative SSE usage for successful OpenAI speech responses", async () => {
		let capturedBody: any = null;
		const audioChunk = Buffer.from([0, 1, 2, 3]).toString("base64");
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/audio/speech"),
				response: sseResponse([
					{ type: "speech.audio.delta", audio: audioChunk },
					{
						type: "speech.audio.done",
						usage: {
							input_tokens: 10,
							output_tokens: 91,
							total_tokens: 101,
						},
					},
					"[DONE]",
				]),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "openai/gpt-4o-mini-tts",
			body: {
				model: "openai/gpt-4o-mini-tts",
				input: "Hello world",
				voice: "alloy",
				response_format: "wav",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.speech" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(capturedBody.stream_format).toBe("sse");
		expect(result.upstream.status).toBe(200);
		expect(result.upstream.headers.get("content-type")).toContain("audio/wav");
		expect(result.bill.usage?.input_text_tokens).toBe(10);
		expect(result.bill.usage?.output_audio_tokens).toBe(91);
		expect(result.bill.usage?.total_tokens).toBe(101);
	});

	it("parses CRLF-delimited OpenAI speech SSE usage frames", async () => {
		let capturedBody: any = null;
		const audioChunk = Buffer.from([0, 1, 2, 3]).toString("base64");
		const encoder = new TextEncoder();
		const crlfFrames = [
			`data: ${JSON.stringify({ type: "speech.audio.delta", audio: audioChunk })}\r\n\r\n`,
			`data: ${JSON.stringify({ type: "speech.audio.done", usage: { input_tokens: 10, output_tokens: 91, total_tokens: 101 } })}\r\n\r\n`,
			"data: [DONE]\r\n\r\n",
		].join("");
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/audio/speech"),
				response: new Response(encoder.encode(crlfFrames), {
					status: 200,
					headers: {
						"Content-Type": "text/event-stream",
						"x-request-id": "req_openai_tts_crlf_test",
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "openai/gpt-4o-mini-tts",
			body: {
				model: "openai/gpt-4o-mini-tts",
				input: "Hello world",
				voice: "alloy",
				response_format: "wav",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.speech" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(capturedBody.stream_format).toBe("sse");
		expect(result.upstream.status).toBe(200);
		expect(result.bill.upstream_id).toBe("req_openai_tts_crlf_test");
		expect(result.bill.usage?.input_text_tokens).toBe(10);
		expect(result.bill.usage?.output_audio_tokens).toBe(91);
		expect(result.bill.usage?.total_tokens).toBe(101);
	});

	it("forwards custom voice objects for speech when provided", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/audio/speech"),
				response: sseResponse([
					{ type: "speech.audio.delta", audio: Buffer.from([0, 1, 2, 3]).toString("base64") },
					{ type: "speech.audio.done", usage: { input_tokens: 10, output_tokens: 91, total_tokens: 101 } },
					"[DONE]",
				]),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "openai/gpt-4o-mini-tts",
			body: {
				model: "openai/gpt-4o-mini-tts",
				input: "Hello custom voice alias",
				voice: { id: "alloy" },
				response_format: "wav",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.speech" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody.voice).toBe("alloy");
	});

	it("normalizes OpenAI voice aliases before forwarding speech requests", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/audio/speech"),
				response: sseResponse([
					{ type: "speech.audio.delta", audio: Buffer.from([0, 1, 2, 3]).toString("base64") },
					{ type: "speech.audio.done", usage: { input_tokens: 10, output_tokens: 91, total_tokens: 101 } },
					"[DONE]",
				]),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "openai/gpt-4o-mini-tts",
			body: {
				model: "openai/gpt-4o-mini-tts",
				input: "Normalize OpenAI voice aliases.",
				voice: "  ALLOY  ",
				response_format: "mp3",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.speech" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody.voice).toBe("alloy");
	});

	it("returns 400 for unsupported OpenAI speech voice", async () => {
		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "openai/gpt-4o-mini-tts",
			body: {
				model: "openai/gpt-4o-mini-tts",
				input: "Invalid voice test.",
				voice: "unknown_voice_name",
				response_format: "mp3",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.speech" },
			providerModelSlug: null,
			stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
		const payload = await result.upstream.clone().json();
		expect(payload?.error?.param).toBe("voice");
	});

	it("rejects legacy format alias for OpenAI speech", async () => {
		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "openai/gpt-4o-mini-tts",
			body: {
				model: "openai/gpt-4o-mini-tts",
				input: "Hello world",
				voice: "alloy",
				format: "wav",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.speech" },
			providerModelSlug: null,
			stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
		const payload = await result.upstream.clone().json();
		expect(payload?.error?.param).toBe("format");
	});

	it("defaults transcriptions to json for GPT transcribe and forwards include/timestamp fields", async () => {
		let responseFormat: string | null = null;
		let includes: string[] = [];
		let granularities: string[] = [];
		let fileName: string | null = null;
		const mock = installFetchMock([
			{
				match: (url, init) => {
					if (!url.includes("/audio/transcriptions")) return false;
					const form = init?.body as FormData | undefined;
					if (form && typeof (form as any).get === "function") {
						responseFormat = String(form.get("response_format") ?? "");
						includes = form.getAll("include[]").map((value) => String(value));
						granularities = form
							.getAll("timestamp_granularities[]")
							.map((value) => String(value));
						const file = form.get("file");
						fileName = typeof File !== "undefined" && file instanceof File ? file.name : null;
					}
					return true;
				},
				response: jsonResponse({ text: "hello" }),
			},
		]);

		const audioFile = makeAudioFile();
		const result = await execTranscription({
			endpoint: "audio.transcription",
			model: "openai/gpt-4o-transcribe",
			body: {
				model: "openai/gpt-4o-transcribe",
				file: audioFile,
				include: ["logprobs"],
				timestamp_granularities: ["segment", "word"],
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.transcription" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(result.normalized?.text).toBe("hello");
		expect(responseFormat).toBe("json");
		expect(includes).toEqual(["logprobs"]);
		expect(granularities).toEqual(["segment", "word"]);
		expect(fileName).toBe("audio.wav");
	});

	it("defaults transcriptions to verbose_json for whisper-1", async () => {
		let responseFormat: string | null = null;
		const mock = installFetchMock([
			{
				match: (url, init) => {
					if (!url.includes("/audio/transcriptions")) return false;
					const form = init?.body as FormData | undefined;
					if (form && typeof (form as any).get === "function") {
						responseFormat = String(form.get("response_format") ?? "");
					}
					return true;
				},
				response: jsonResponse({ text: "hello" }),
			},
		]);

		const audioFile = makeAudioFile();
		const result = await execTranscription({
			endpoint: "audio.transcription",
			model: "openai/whisper-1",
			body: {
				model: "openai/whisper-1",
				file: audioFile,
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.transcription" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(responseFormat).toBe("verbose_json");
	});

	it("normalizes non-json transcription and translation responses as text", async () => {
		let transcriptionFormat: string | null = null;
		let translationFormat: string | null = null;
		const mock = installFetchMock([
			{
				match: (url, init) => {
					if (!url.includes("/audio/transcriptions")) return false;
					const form = init?.body as FormData | undefined;
					if (form && typeof (form as any).get === "function") {
						transcriptionFormat = String(form.get("response_format") ?? "");
					}
					return true;
				},
				response: new Response("transcribed text", {
					status: 200,
					headers: { "Content-Type": "text/plain" },
				}),
			},
			{
				match: (url, init) => {
					if (!url.includes("/audio/translations")) return false;
					const form = init?.body as FormData | undefined;
					if (form && typeof (form as any).get === "function") {
						translationFormat = String(form.get("response_format") ?? "");
					}
					return true;
				},
				response: new Response("translated text", {
					status: 200,
					headers: { "Content-Type": "text/plain" },
				}),
			},
		]);

		const audioFile = makeAudioFile();
		const transcription = await execTranscription({
			endpoint: "audio.transcription",
			model: "openai/gpt-4o-mini-transcribe",
			body: {
				model: "openai/gpt-4o-mini-transcribe",
				file: audioFile,
				response_format: "text",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.transcription" },
			providerModelSlug: null,
			stream: false,
		} as any);

		const translation = await execTranslation({
			endpoint: "audio.translations",
			model: "openai/gpt-4o-transcribe",
			body: {
				model: "openai/gpt-4o-transcribe",
				file: audioFile,
				response_format: "text",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.translations" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(transcription.upstream.status).toBe(200);
		expect(transcription.normalized?.text).toBe("transcribed text");
		expect(transcriptionFormat).toBe("text");

		expect(translation.upstream.status).toBe(200);
		expect(translation.normalized?.text).toBe("translated text");
		expect(translationFormat).toBe("text");
	});

	it("estimates usage for transcription and translation when upstream omits it", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/audio/transcriptions"),
				response: jsonResponse({ text: "hello world from transcription" }),
			},
			{
				match: (url) => url.includes("/audio/translations"),
				response: jsonResponse({ text: "hello world from translation" }),
			},
		]);

		const audioFile = new File([makeWavBytes(1)], "audio.wav", { type: "audio/wav" });
		const transcription = await execTranscription({
			endpoint: "audio.transcription",
			model: "openai/gpt-4o-mini-transcribe",
			body: {
				model: "openai/gpt-4o-mini-transcribe",
				file: audioFile,
				prompt: "meeting notes",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.transcription" },
			providerModelSlug: null,
			stream: false,
		} as any);

		const translation = await execTranslation({
			endpoint: "audio.translations",
			model: "openai/gpt-4o-mini-transcribe",
			body: {
				model: "openai/gpt-4o-mini-transcribe",
				file: audioFile,
				prompt: "translate to english",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.translations" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(transcription.bill.usage?.input_audio_tokens).toBeGreaterThan(0);
		expect(transcription.bill.usage?.output_text_tokens).toBeGreaterThan(0);
		expect(transcription.normalized?.usage?.input_audio_tokens).toBeGreaterThan(0);
		expect(translation.bill.usage?.input_audio_tokens).toBeGreaterThan(0);
		expect(translation.bill.usage?.output_text_tokens).toBeGreaterThan(0);
		expect(translation.normalized?.usage?.input_audio_tokens).toBeGreaterThan(0);
	});
});
