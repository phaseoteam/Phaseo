import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec as execSpeech } from "../endpoints/audio-speech";

const REQUEST_META = {
	requestId: "req_test_xiaomi_tts",
	apiKeyId: "key_test",
	apiKeyRef: "kid_test",
	apiKeyKid: "kid_test",
};

const PRICING_CARD = {
	provider: "xiaomi",
	model: "mimo-v2-tts",
	endpoint: "audio.speech",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [],
} as any;

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("Xiaomi audio.speech endpoint", () => {
	it("maps gateway audio.speech into Xiaomi chat.completions payload", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/chat/completions"),
				response: jsonResponse({
					id: "chatcmpl_test_1",
					model: "mimo-v2-tts",
					choices: [
						{
							index: 0,
							message: {
								role: "assistant",
								content: "",
								audio: {
									id: "audio_1",
									data: "BASE64_AUDIO_DATA",
									transcript: "Hello",
								},
							},
						},
					],
					usage: {
						prompt_tokens: 11,
						completion_tokens: 3,
						total_tokens: 14,
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "xiaomi/mimo-v2-tts",
			body: {
				model: "xiaomi/mimo-v2-tts",
				input: "Yes, I had a sandwich.",
				instructions: "Warm and cheerful tone",
				voice: "mimo_default",
				response_format: "wav",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "xiaomi",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: "mimo-v2-tts",
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody).toEqual({
			model: "mimo-v2-tts",
			messages: [
				{ role: "user", content: "Warm and cheerful tone" },
				{ role: "assistant", content: "Yes, I had a sandwich." },
			],
			audio: {
				format: "wav",
				voice: "mimo_default",
			},
		});
		expect(result.normalized?.audio?.data).toBe("BASE64_AUDIO_DATA");
		expect(result.normalized?.audio?.transcript).toBe("Hello");
		expect(result.normalized?.mime_type).toBe("audio/wav");
		expect((result.bill.usage as any)?.prompt_tokens).toBe(11);
	});

	it("defaults missing voice to mimo_default and maps legacy format", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/chat/completions"),
				response: jsonResponse({
					id: "chatcmpl_test_2",
					model: "mimo-v2-tts",
					choices: [
						{
							index: 0,
							message: {
								role: "assistant",
								content: "",
								audio: {
									data: "BASE64_AUDIO_MP3",
								},
							},
						},
					],
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "xiaomi/mimo-v2-tts",
			body: {
				model: "xiaomi/mimo-v2-tts",
				input: "Hello world",
				format: "mp3",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "xiaomi",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(capturedBody.messages).toEqual([{ role: "assistant", content: "Hello world" }]);
		expect(capturedBody.audio).toEqual({ format: "mp3", voice: "mimo_default" });
		expect(result.normalized?.mime_type).toBe("audio/mpeg");
	});
});

