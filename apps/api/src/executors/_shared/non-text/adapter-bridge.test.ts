import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { execute as executeNonTextAdapter } from "./adapter-bridge";

const PRICING_CARD = {
	provider: "google-ai-studio",
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

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("non-text adapter bridge", () => {
	it("preserves OpenAI speech as binary output instead of gateway JSON", async () => {
		const audio = Buffer.from([0, 1, 2, 3]);
		const mock = installFetchMock([{
			match: (url) => url.includes("/audio/speech"),
			response: new Response([
				`data: ${JSON.stringify({ type: "speech.audio.delta", audio: audio.toString("base64") })}\n\n`,
				`data: ${JSON.stringify({ type: "speech.audio.done", usage: { input_tokens: 2, output_tokens: 4, total_tokens: 6 } })}\n\n`,
			].join(""), { headers: { "Content-Type": "text/event-stream" } }),
		}]);
		const result = await executeNonTextAdapter({
			ir: {
				model: "openai/gpt-4o-mini-tts",
				input: "hello",
				voice: "alloy",
				responseFormat: "wav",
			},
			requestId: "req_non_text_speech_1",
			workspaceId: "team_test",
			providerId: "openai",
			endpoint: "audio.speech",
			providerModelSlug: "gpt-4o-mini-tts",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, provider: "openai", endpoint: "audio.speech" },
			meta: {},
		} as any);
		mock.restore();

		expect(result.kind).toBe("stream");
		if (result.kind === "stream") {
			expect(result.upstream.headers.get("content-type")).toContain("audio/wav");
			expect(Buffer.from(await new Response(result.stream).arrayBuffer())).toEqual(audio);
		}
	});

	it("routes Mistral speech through its native adapter and returns decoded audio bytes", async () => {
		const audio = Buffer.from([9, 8, 7, 6]);
		let sent: Record<string, unknown> | undefined;
		const mock = installFetchMock([{
			match: (url, init) => {
				sent = JSON.parse(String(init?.body));
				return url.includes("/audio/speech");
			},
			response: jsonResponse({ audio_data: audio.toString("base64") }),
		}]);
		const result = await executeNonTextAdapter({
			ir: {
				model: "mistral/voxtral-tts-3",
				input: "hello",
				voice: "preset-voice",
				responseFormat: "flac",
			},
			requestId: "req_mistral_speech_1",
			workspaceId: "team_test",
			providerId: "mistral",
			endpoint: "audio.speech",
			providerModelSlug: "voxtral-mini-tts-3-0",
			byokMeta: [],
			pricingCard: {
				...PRICING_CARD,
				provider: "mistral",
				endpoint: "audio.speech",
				rules: [{ ...PRICING_CARD.rules[0], meter: "input_characters", unit: "character", unit_size: 1000, price_per_unit: 0.016 }],
			},
			meta: {},
		} as any);
		mock.restore();

		expect(sent).toMatchObject({ model: "voxtral-mini-tts-3-0", input: "hello", voice_id: "preset-voice", response_format: "flac", stream: false });
		expect(result.kind).toBe("completed");
		if (result.kind === "completed") {
			expect(result.upstream.headers.get("content-type")).toBe("audio/flac");
			expect(Buffer.from(await result.upstream.clone().arrayBuffer())).toEqual(audio);
			expect((result.ir as any)?.audio?.data).toBe(audio.toString("base64"));
		}
	});

	it("forwards diarization controls through the transcription IR bridge", async () => {
		let capturedForm: FormData | undefined;
		const mock = installFetchMock([{
			match: (url, init) => {
				capturedForm = init?.body as FormData;
				return url.includes("/audio/transcriptions");
			},
			response: jsonResponse({ text: "hello" }),
		}]);

		await executeNonTextAdapter({
			ir: {
				type: "audio.transcription",
				model: "openai/gpt-4o-transcribe-diarize",
				file: new File(["audio"], "sample.wav", { type: "audio/wav" }),
				responseFormat: "diarized_json",
				chunkingStrategy: { type: "server_vad", silence_duration_ms: 500 },
				knownSpeakerNames: ["agent"],
				knownSpeakerReferences: ["data:audio/wav;base64,AQID"],
			},
			requestId: "req_non_text_transcription_1",
			workspaceId: "team_test",
			providerId: "openai",
			endpoint: "audio.transcription",
			providerModelSlug: "gpt-4o-transcribe-diarize",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, provider: "openai", endpoint: "audio.transcription" },
			meta: {},
		} as any);

		mock.restore();
		expect(capturedForm?.get("chunking_strategy")).toBe(
			JSON.stringify({ type: "server_vad", silence_duration_ms: 500 }),
		);
		expect(capturedForm?.getAll("known_speaker_names[]")).toEqual(["agent"]);
		expect(capturedForm?.getAll("known_speaker_references[]")).toEqual(["data:audio/wav;base64,AQID"]);
	});

	it("routes Mistral transcription through its native IR bridge and preserves segments", async () => {
		let capturedForm: FormData | undefined;
		const mock = installFetchMock([{
			match: (url, init) => {
				capturedForm = init?.body as FormData;
				return url.includes("/audio/transcriptions");
			},
			response: jsonResponse({
				model: "voxtral-mini-2602",
				text: "Hello",
				language: "en",
				segments: [{ type: "transcription_segment", text: "Hello", start: 0, end: 1, speaker_id: "0" }],
				usage: { prompt_audio_seconds: 60, prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
			}),
		}]);

		const result = await executeNonTextAdapter({
			ir: {
				type: "audio.transcription",
				model: "mistral/voxtral-mini-transcribe-2",
				fileUrl: "https://example.com/call.mp3",
				diarize: true,
				contextBias: ["Phaseo"],
			},
			requestId: "req_mistral_transcription_1",
			workspaceId: "team_test",
			providerId: "mistral",
			endpoint: "audio.transcription",
			providerModelSlug: "voxtral-mini-2602",
			byokMeta: [],
			pricingCard: {
				...PRICING_CARD,
				provider: "mistral",
				endpoint: "audio.transcription",
				rules: [{ ...PRICING_CARD.rules[0], meter: "input_audio_minutes", unit: "minute", price_per_unit: 0.003 }],
			},
			meta: {},
		} as any);
		mock.restore();

		expect(capturedForm?.get("file_url")).toBe("https://example.com/call.mp3");
		expect(capturedForm?.get("diarize")).toBe("true");
		expect(capturedForm?.getAll("context_bias")).toEqual(["Phaseo"]);
		expect(result.kind).toBe("completed");
		if (result.kind === "completed") {
			expect(result.ir).toMatchObject({
				text: "Hello",
				language: "en",
				segments: [{ speaker_id: "0" }],
				usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3, input_audio_minutes: 1 },
			});
		}
	});

	it("routes google-ai-studio images to the dedicated provider adapter", async () => {
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => {
					try {
						const parsed = new URL(url);
						return (
							parsed.hostname === "generativelanguage.googleapis.com" &&
							parsed.pathname.includes(":generateContent") &&
							parsed.searchParams.has("key")
						);
					} catch {
						return false;
					}
				},
				response: jsonResponse({
					candidates: [
						{
							content: {
								parts: [
									{
										inlineData: {
											mimeType: "image/png",
											data: "abc123",
										},
									},
								],
							},
						},
					],
				}),
				onRequest: (call) => {
					capturedUrl = call.url;
				},
			},
		]);

		const result = await executeNonTextAdapter({
			ir: {
				type: "image.generation",
				model: "google/gemini-3.1-flash-image-preview",
				prompt: "A fox in watercolor.",
				n: 1,
			},
			requestId: "req_non_text_google_image_1",
			workspaceId: "team_test",
			providerId: "google-ai-studio",
			endpoint: "images.generations",
			providerModelSlug: "gemini-3.1-flash-image-preview",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			meta: {},
		} as any);

		mock.restore();

		expect(capturedUrl).toContain("generativelanguage.googleapis.com");
		expect(capturedUrl).toContain(":generateContent?key=");
		expect(result.kind).toBe("completed");
		if (result.kind === "completed") {
			expect(result.ir?.provider).toBe("google-ai-studio");
			expect((result.ir as any)?.data?.[0]?.b64Json).toBe("abc123");
		}
	});

	it("preserves resolved OpenAI image metadata through the IR bridge", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes("/images/generations"),
			response: jsonResponse({
				created: 1700000000,
				background: "opaque",
				output_format: "jpeg",
				size: "1024x1024",
				quality: "medium",
				data: [{ b64_json: "openai-image" }],
				usage: {
					input_tokens: 5,
					output_tokens: 1056,
					total_tokens: 1061,
					input_tokens_details: { text_tokens: 5, image_tokens: 0 },
				},
			}),
		}]);

		const result = await executeNonTextAdapter({
			ir: {
				model: "openai/gpt-image-1.5",
				prompt: "A geometric fox",
			},
			requestId: "req_non_text_openai_image_1",
			workspaceId: "team_test",
			providerId: "openai",
			endpoint: "images.generations",
			providerModelSlug: "gpt-image-1.5",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, provider: "openai" },
			meta: {},
		} as any);

		mock.restore();
		expect(result.kind).toBe("completed");
		if (result.kind === "completed") {
			expect(result.ir).toMatchObject({
				background: "opaque",
				outputFormat: "jpeg",
				size: "1024x1024",
				quality: "medium",
				data: [{ b64Json: "openai-image" }],
				usage: {
					input_tokens_details: { text_tokens: 5, image_tokens: 0 },
				},
			});
		}
	});

	it("preserves Together image controls through the IR bridge", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url.includes("/images/generations"),
			response: jsonResponse({ data: [{ b64_json: "together-image" }] }),
			onRequest: (call) => { capturedBody = call.bodyJson; },
		}]);

		const result = await executeNonTextAdapter({
			ir: {
				type: "image.generation",
				model: "qwen/qwen-image",
				prompt: "A geometric fox",
				rawRequest: {
					steps: 12,
					negative_prompt: "blurry",
					guidance_scale: 4.5,
					image_url: "https://example.com/reference.png",
					reference_images: ["https://example.com/second.png"],
					disable_safety_checker: false,
					provider_params: { seed: 42 },
				},
			},
			requestId: "req_non_text_together_image_1",
			workspaceId: "team_test",
			providerId: "together",
			endpoint: "images.generations",
			providerModelSlug: "Qwen/Qwen-Image",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, provider: "together" },
			meta: {},
		} as any);

		mock.restore();
		expect(capturedBody).toMatchObject({
			steps: 12,
			negative_prompt: "blurry",
			guidance_scale: 4.5,
			image_url: "https://example.com/reference.png",
			reference_images: ["https://example.com/second.png"],
			disable_safety_checker: false,
			seed: 42,
		});
		expect(result.kind).toBe("completed");
	});
});
