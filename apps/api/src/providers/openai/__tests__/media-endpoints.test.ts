import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
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

function makeAudioFile(filename = "audio.wav"): File {
	return new File([new Uint8Array([1, 2, 3])], filename, { type: "audio/wav" });
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
			teamId: "team_test",
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
			teamId: "team_test",
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

	it("uses OpenAI-native response_format for speech", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/audio/speech"),
				response: new Response("AUDIO", {
					status: 200,
					headers: { "Content-Type": "audio/wav" },
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
					stream_format: "audio",
				},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "openai",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.speech" },
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody.response_format).toBe("wav");
		expect(capturedBody.stream_format).toBe("audio");
		expect(capturedBody.format).toBeUndefined();
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
			teamId: "team_test",
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
			teamId: "team_test",
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
			teamId: "team_test",
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
			teamId: "team_test",
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
			teamId: "team_test",
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
});
