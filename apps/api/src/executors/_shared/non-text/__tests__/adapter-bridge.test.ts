import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../../tests/helpers/mock-fetch";
import { execute } from "../adapter-bridge";

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("non-text adapter bridge", () => {
	it("routes ElevenLabs audio.speech and emits audio data + character usage", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/v1/text-to-speech/voice_bridge_1"),
				response: new Response("AUDIO_BRIDGE", {
					status: 200,
					headers: {
						"Content-Type": "audio/mpeg",
						"request-id": "el_bridge_req_1",
					},
				}),
			},
		]);

		const result = await execute({
			ir: {
				model: "eleven-labs/eleven-v3",
				input: "Bridge level ElevenLabs TTS check",
				voice: "voice_bridge_1",
				responseFormat: "mp3",
			},
			requestId: "req_bridge_tts_1",
			teamId: "team_test",
			providerId: "elevenlabs",
			endpoint: "audio.speech",
			byokMeta: [],
			pricingCard: {
				provider: "elevenlabs",
				model: "eleven-labs/eleven-v3",
				endpoint: "audio.speech",
				currency: "USD",
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
			},
			meta: {
				returnUpstreamRequest: true,
				echoUpstreamRequest: true,
			},
		} as any);

		mock.restore();

		expect(result.kind).toBe("completed");
		const irResult = result.ir as any;
		expect(irResult?.provider).toBe("elevenlabs");
		expect(irResult?.model).toBe("eleven-labs/eleven-v3");
		expect(irResult?.audio?.mimeType).toBe("audio/mpeg");
		expect(typeof irResult?.audio?.data).toBe("string");
		expect(irResult?.usage?.input_characters).toBe(
			"Bridge level ElevenLabs TTS check".length,
		);
		expect(result.mappedRequest).toContain("\"voice\":\"voice_bridge_1\"");
	});

	it("passes OpenAI video core fields and Veo superset options through to compat providers", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ id: "vid_456", status: "queued" }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute({
			ir: {
				model: "google/veo-3.1-generate-preview",
				prompt: "A quiet sunrise over the ocean.",
				seconds: 6,
				size: "1280x720",
				aspectRatio: "16:9",
				numberOfVideos: 1,
				compressionQuality: 70,
				negativePrompt: "low quality",
				seed: 42,
				generateAudio: true,
				referenceImages: [
					{
						reference_type: "style",
						uri: "gs://bucket/style.png",
					},
				],
			},
			requestId: "req_bridge_video_1",
			teamId: "team_test",
			providerId: "minimax",
			endpoint: "video.generation",
			byokMeta: [],
			pricingCard: {
				provider: "minimax",
				model: "google/veo-3.1-generate-preview",
				endpoint: "video.generation",
				currency: "USD",
				rules: [],
			},
			meta: {},
		} as any);

		mock.restore();

		expect(result.kind).toBe("completed");
		expect(capturedBody.model).toBe("google/veo-3.1-generate-preview");
		expect(capturedBody.prompt).toContain("sunrise");
		expect(capturedBody.seconds).toBe(6);
		expect(capturedBody.size).toBe("1280x720");
		expect(capturedBody.aspect_ratio).toBe("16:9");
		expect(capturedBody.number_of_videos).toBe(1);
		expect(capturedBody.compression_quality).toBe(70);
		expect(capturedBody.negative_prompt).toBe("low quality");
		expect(capturedBody.seed).toBe(42);
		expect(capturedBody.generate_audio).toBe(true);
		expect(Array.isArray(capturedBody.reference_images)).toBe(true);
	});
});
