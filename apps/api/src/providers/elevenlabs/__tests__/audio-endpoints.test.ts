import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec as execSpeech } from "../endpoints/audio-speech";
import { exec as execTranscription } from "../endpoints/audio-transcription";

const REQUEST_META = {
	requestId: "req_test_123",
	apiKeyId: "key_test",
	apiKeyRef: "kid_test",
	apiKeyKid: "kid_test",
};

const PRICING_CARD = {
	provider: "elevenlabs",
	model: "test-model",
	endpoint: "audio.speech",
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
			tiering_mode: "flat",
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

describe("ElevenLabs audio endpoints", () => {
	it("maps audio.speech to text-to-speech with model slug conversion", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/v1/text-to-speech/voice_abc"),
				response: new Response("AUDIO", {
					status: 200,
					headers: {
						"Content-Type": "audio/mpeg",
						"request-id": "el_req_1",
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "eleven-labs/eleven-turbo-v2-5",
			body: {
				model: "eleven-labs/eleven-turbo-v2-5",
				input: "Hello world",
				voice: "voice_abc",
				format: "mp3",
			},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(result.normalized).toBeUndefined();
		expect(capturedBody?.text).toBe("Hello world");
		expect(capturedBody?.model_id).toBe("eleven_turbo_v2_5");
		expect(result.bill.usage).toBeDefined();
	});

	it("returns 400 when ElevenLabs audio.speech voice is missing", async () => {
		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "eleven-labs/eleven-v3",
			body: {
				model: "eleven-labs/eleven-v3",
				input: "Hello world",
			},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
	});

	it("maps audio.transcription to speech-to-text with cloud_storage_url", async () => {
		let formModelId: string | null = null;
		let formCloudStorageUrl: string | null = null;
		const mock = installFetchMock([
			{
				match: (url, init) => {
					if (!url.includes("/v1/speech-to-text")) return false;
					const form = init?.body as FormData | undefined;
					if (form && typeof (form as any).get === "function") {
						formModelId = String(form.get("model_id") ?? "");
						formCloudStorageUrl = String(form.get("cloud_storage_url") ?? "");
					}
					return true;
				},
				response: jsonResponse({ text: "Transcribed" }, { headers: { "request-id": "el_req_2" } }),
			},
		]);

		const result = await execTranscription({
			endpoint: "audio.transcription",
			model: "eleven-labs/scribe-v2-2026-01-09",
			body: {
				model: "eleven-labs/scribe-v2-2026-01-09",
				audio_url: "https://example.com/audio.wav",
			},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: {
				...PRICING_CARD,
				endpoint: "audio.transcription",
			},
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(result.normalized?.text).toBe("Transcribed");
		expect(result.normalized?.usage?.requests).toBe(1);
		expect(formModelId).toBe("scribe_v2");
		expect(formCloudStorageUrl).toBe("https://example.com/audio.wav");
	});

	it("returns 400 when ElevenLabs audio.transcription audio_b64 is invalid", async () => {
		const result = await execTranscription({
			endpoint: "audio.transcription",
			model: "eleven-labs/scribe-v1",
			body: {
				model: "eleven-labs/scribe-v1",
				audio_b64: "%%%",
			},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: {
				...PRICING_CARD,
				endpoint: "audio.transcription",
			},
			providerModelSlug: null,
			stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
	});
});
