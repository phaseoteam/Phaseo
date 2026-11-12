import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec as execSpeech } from "../endpoints/audio-speech";
import { exec as execTranscription } from "../endpoints/audio-transcription";
import { guardJson } from "../../../pipeline/before/guards";

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

describe("ElevenLabs audio endpoints", () => {
	it.each([
		["eleven-labs/eleven-v4", "eleven_v4"],
		["eleven-labs/eleven-v4-turbo", "eleven_v4_turbo"],
	])("routes %s with a voice library ID and v4 settings", async (model, providerModelSlug) => {
		let capturedBody: any;
		const voice = "NfUrCNRReUL9RXS9upG1";
		const mock = installFetchMock([{
			match: (url) => url.includes(`/v1/text-to-speech/${voice}`),
			response: new Response("AUDIO", { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
			onRequest: (call) => { capturedBody = call.bodyJson; },
		}]);
		try {
			const result = await execSpeech({
				endpoint: "audio.speech", model,
				body: { model, input: "[whispering] Hello world", voice,
					config: { elevenlabs: { voice_settings: { stability: 0.5, similarity_boost: 0.75 } } } },
				meta: REQUEST_META, workspaceId: "team_test", providerId: "elevenlabs",
				byokMeta: [], pricingCard: PRICING_CARD, providerModelSlug, stream: false,
			} as any);
			expect(result.upstream.status).toBe(200);
			expect(capturedBody).toMatchObject({ model_id: providerModelSlug,
				text: "[whispering] Hello world",
				voice_settings: { stability: 0.5, similarity_boost: 0.75 } });
		} finally { mock.restore(); }
	});

	it("rejects speed for Eleven v4 before calling the provider", async () => {
		const model = "eleven-labs/eleven-v4";
		const result = await execSpeech({ endpoint: "audio.speech", model,
			body: { model, input: "Hello", voice: "NfUrCNRReUL9RXS9upG1", speed: 1.2 },
			meta: REQUEST_META, workspaceId: "team_test", providerId: "elevenlabs",
			byokMeta: [], pricingCard: PRICING_CARD, providerModelSlug: "eleven_v4", stream: false,
		} as any);
		expect(result.upstream.status).toBe(400);
		expect((await result.upstream.json()).error.param).toBe("speed");
	});

	it.each([
		["speed", { speed: 1.2 }],
		["style", { style: 0.5 }],
	])("rejects nested %s for Eleven v4 before calling the provider", async (setting, voiceSettings) => {
		const model = "eleven-labs/eleven-v4";
		const result = await execSpeech({ endpoint: "audio.speech", model,
			body: { model, input: "Hello", voice: "NfUrCNRReUL9RXS9upG1",
				config: { elevenlabs: { voice_settings: voiceSettings } } },
			meta: REQUEST_META, workspaceId: "team_test", providerId: "elevenlabs",
			byokMeta: [], pricingCard: PRICING_CARD, providerModelSlug: "eleven_v4", stream: false,
		} as any);
		expect(result.upstream.status).toBe(400);
		expect((await result.upstream.json()).error.param).toBe(`voice_settings.${setting}`);
	});

	it("maps audio.speech to text-to-speech with model slug conversion", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM"),
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
				voice: "21m00Tcm4TlvDq8ikWAM",
				format: "mp3",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
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

	it("prefers response_format mapping for ElevenLabs output_format", async () => {
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM"),
				response: new Response("AUDIO", {
					status: 200,
					headers: {
						"Content-Type": "audio/mpeg",
					},
				}),
				onRequest: (call) => {
					capturedUrl = call.url;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "eleven-labs/eleven-v3",
			body: {
				model: "eleven-labs/eleven-v3",
				input: "Hello world",
				voice: "21m00Tcm4TlvDq8ikWAM",
				format: "mp3",
				response_format: "wav",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		// A WAV file, not headerless PCM.
		expect(capturedUrl).toContain("output_format=wav_44100");
	});

	it.each([
		["pcm", "pcm_44100"],
		["mp3", "mp3_44100_128"],
	])("maps response_format %s to %s", async (responseFormat, outputFormat) => {
		let capturedUrl = "";
		const mock = installFetchMock([{
			match: (url) => url.includes("/v1/text-to-speech/"),
			response: new Response("AUDIO", { status: 200 }),
			onRequest: (call) => { capturedUrl = call.url; },
		}]);
		await execSpeech({
			endpoint: "audio.speech", model: "eleven-labs/eleven-v3",
			body: { model: "eleven-labs/eleven-v3", input: "Hi", voice: "rachel", response_format: responseFormat },
			meta: REQUEST_META, workspaceId: "team_test", providerId: "elevenlabs", byokMeta: [], pricingCard: PRICING_CARD,
			providerModelSlug: null, stream: false,
		} as any);
		mock.restore();
		expect(capturedUrl).toContain(`output_format=${outputFormat}`);
	});

	it("accepts any library or cloned voice ID on every model, and rejects malformed ones", async () => {
		const voice = "NfUrCNRReUL9RXS9upG1";
		let called = 0;
		const mock = installFetchMock([{
			match: (url) => url.includes(`/v1/text-to-speech/${voice}`),
			response: new Response("AUDIO", { status: 200 }),
			onRequest: () => { called += 1; },
		}]);
		const run = (voiceValue: string) => execSpeech({
			endpoint: "audio.speech", model: "eleven-labs/eleven-flash-v2.5",
			body: { model: "eleven-labs/eleven-flash-v2.5", input: "Hi", voice: voiceValue },
			meta: REQUEST_META, workspaceId: "team_test", providerId: "elevenlabs", byokMeta: [], pricingCard: PRICING_CARD,
			providerModelSlug: null, stream: false,
		} as any);
		expect((await run(voice)).upstream.status).toBe(200);
		const bad = await run("not a voice");
		mock.restore();
		expect(called).toBe(1);
		expect(bad.upstream.status).toBe(400);
		expect((await bad.upstream.json()).error.message).toContain("20-character ElevenLabs voice ID");
	});

	it("maps OAI audio input schema and elevenlabs extensions into ElevenLabs TTS request", async () => {
		let capturedBody: any = null;
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM"),
				response: new Response("AUDIO", {
					status: 200,
					headers: {
						"Content-Type": "audio/mpeg",
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
					capturedUrl = call.url;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "eleven-labs/eleven-v3",
			body: {
				model: "eleven-labs/eleven-v3",
				input: "Hello world",
				voice: "21m00Tcm4TlvDq8ikWAM",
				response_format: "mp3",
				speed: 1.15,
				config: {
					elevenlabs: {
						output_format: "mp3_22050_32",
						language_code: "en",
						enable_logging: false,
						optimize_streaming_latency: 3,
						seed: 7,
						voice_settings: {
							stability: 0.42,
						},
						pronunciation_dictionary_locators: [
							{ id: "dict_1", version_id: "1" },
						],
						previous_text: "Previous sentence",
						next_text: "Next sentence",
						previous_request_ids: ["request_before"],
						next_request_ids: ["request_after"],
						apply_text_normalization: "on",
						apply_language_text_normalization: true,
						use_pvc_as_ivc: false,
					},
				},
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedUrl).toContain("output_format=mp3_22050_32");
		expect(capturedUrl).toContain("enable_logging=false");
		expect(capturedUrl).toContain("optimize_streaming_latency=3");
		expect(capturedBody?.text).toBe("Hello world");
		expect(capturedBody?.model_id).toBe("eleven_v3");
		expect(capturedBody?.language_code).toBe("en");
		expect(capturedBody?.seed).toBe(7);
		expect(capturedBody?.voice_settings?.stability).toBe(0.42);
		expect(capturedBody?.voice_settings?.speed).toBe(1.15);
		expect(Array.isArray(capturedBody?.pronunciation_dictionary_locators)).toBe(true);
		expect(capturedBody).toMatchObject({
			previous_text: "Previous sentence",
			next_text: "Next sentence",
			previous_request_ids: ["request_before"],
			next_request_ids: ["request_after"],
			apply_text_normalization: "on",
			apply_language_text_normalization: true,
			use_pvc_as_ivc: false,
		});
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
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
	});

	it("accepts object voice payloads (voice.id) for ElevenLabs audio.speech", async () => {
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM"),
				response: new Response("AUDIO", {
					status: 200,
					headers: {
						"Content-Type": "audio/mpeg",
					},
				}),
				onRequest: (call) => {
					capturedUrl = call.url;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "eleven-labs/eleven-v3",
			body: {
				model: "eleven-labs/eleven-v3",
				input: "Hello object voice",
				voice: {
					id: "21m00Tcm4TlvDq8ikWAM",
				},
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedUrl).toContain("/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM");
	});

	it("accepts config.elevenlabs.voice_id fallback when top-level voice is omitted", async () => {
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/v1/text-to-speech/AZnzlk1XvdvUeBnXmlld"),
				response: new Response("AUDIO", {
					status: 200,
					headers: {
						"Content-Type": "audio/mpeg",
					},
				}),
				onRequest: (call) => {
					capturedUrl = call.url;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "eleven-labs/eleven-v3",
			body: {
				model: "eleven-labs/eleven-v3",
				input: "Hello config voice",
				config: {
					elevenlabs: {
						voice_id: "AZnzlk1XvdvUeBnXmlld",
					},
				},
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedUrl).toContain("/v1/text-to-speech/AZnzlk1XvdvUeBnXmlld");
	});

	it("maps common ElevenLabs voice aliases to canonical voice IDs", async () => {
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM"),
				response: new Response("AUDIO", {
					status: 200,
					headers: {
						"Content-Type": "audio/mpeg",
					},
				}),
				onRequest: (call) => {
					capturedUrl = call.url;
				},
			},
		]);

		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "eleven-labs/eleven-v3",
			body: {
				model: "eleven-labs/eleven-v3",
				input: "Hello mapped ElevenLabs alias",
				voice: "rachel",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedUrl).toContain("/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM");
	});

	it("returns 400 for unsupported ElevenLabs speech voice", async () => {
		const result = await execSpeech({
			endpoint: "audio.speech",
			model: "eleven-labs/eleven-v3",
			body: {
				model: "eleven-labs/eleven-v3",
				input: "Unsupported voice",
				voice: "voice_that_is_not_in_registry",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
		const payload = await result.upstream.clone().json();
		expect(payload?.error?.param).toBe("voice");
	});

	it("maps audio.transcription to speech-to-text with multipart file upload", async () => {
		let formModelId: string | null = null;
		let fileName: string | null = null;
		const mock = installFetchMock([
			{
				match: (url, init) => {
					if (!url.includes("/v1/speech-to-text")) return false;
					const form = init?.body as FormData | undefined;
					if (form && typeof (form as any).get === "function") {
						formModelId = String(form.get("model_id") ?? "");
						const file = form.get("file");
						fileName = typeof File !== "undefined" && file instanceof File ? file.name : null;
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
				file: makeAudioFile("sample.wav"),
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
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
		expect(fileName).toBe("sample.wav");
	});

	it("carries a multipart config through request parsing to Scribe v3 form fields", async () => {
		const inbound = new FormData();
		inbound.set("model", "eleven-labs/scribe-v3");
		inbound.append("file", makeAudioFile("sample.wav"));
		inbound.append("config", JSON.stringify({ elevenlabs: { numbers_format: "digits", secondary_language_codes: ["es", "fr"] } }));
		const parsed = await guardJson(new Request("https://gateway.local/v1/audio/transcriptions", { method: "POST", body: inbound }), "team_test", "req_test");
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		let form: FormData | null = null;
		const mock = installFetchMock([{
			match: (url, init) => {
				if (!url.includes("/v1/speech-to-text")) return false;
				form = init?.body as FormData;
				return true;
			},
			response: jsonResponse({ text: "Transcribed" }),
		}]);
		await execTranscription({
			endpoint: "audio.transcription",
			model: "eleven-labs/scribe-v3",
			body: parsed.value,
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.transcription" },
			providerModelSlug: "scribe_v3",
			stream: false,
		} as any);
		mock.restore();

		expect(form).not.toBeNull();
		expect(form!.get("model_id")).toBe("scribe_v3");
		expect(form!.get("numbers_format")).toBe("digits");
		expect(form!.getAll("secondary_language_codes")).toEqual(["es", "fr"]);
	});

	it.each([
		["a null entry", ["es", null]],
		["an empty string", ["es", " "]],
		["a number", ["es", 3]],
		["an empty list", []],
		["an object", { es: true }],
	])("rejects Scribe v3 secondary language codes with %s", async (_label, codes) => {
		let called = false;
		const mock = installFetchMock([{
			match: (url) => { if (url.includes("/v1/speech-to-text")) called = true; return called; },
			response: jsonResponse({ text: "Transcribed" }),
		}]);
		const result = await execTranscription({
			endpoint: "audio.transcription",
			model: "eleven-labs/scribe-v3",
			body: { model: "eleven-labs/scribe-v3", file: makeAudioFile("sample.wav"), config: { elevenlabs: { secondary_language_codes: codes } } },
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: { ...PRICING_CARD, endpoint: "audio.transcription" },
			providerModelSlug: "scribe_v3",
			stream: false,
		} as any);
		mock.restore();

		expect(called).toBe(false);
		expect(result.upstream.status).toBe(400);
		const body = await result.upstream.json();
		expect(body.error.param).toBe("config.elevenlabs.secondary_language_codes");
	});

	it("derives billable audio seconds when ElevenLabs omits usage", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes("/v1/speech-to-text"),
			response: jsonResponse({ text: "Transcribed" }),
		}]);
		const file = new File([new Uint8Array(16000 * 3)], "sample.mp3", { type: "" });
		const result = await execTranscription({
			endpoint: "audio.transcription",
			model: "eleven-labs/scribe-v2",
			body: { model: "eleven-labs/scribe-v2", file },
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "elevenlabs",
			byokMeta: [],
			pricingCard: {
				...PRICING_CARD,
				endpoint: "audio.transcription",
				rules: [{ ...PRICING_CARD.rules[0], meter: "input_audio_seconds", unit: "second", price_per_unit: 0.22, unit_size: 3600 }],
			},
			providerModelSlug: null,
			stream: false,
		} as any);
		mock.restore();
		expect(result.normalized?.usage?.input_audio_seconds).toBe(3);
		expect(result.bill.usage?.input_audio_seconds).toBe(3);
		expect(result.bill.cost_cents).toBeGreaterThan(0);
	});

	it("prices a transcription with keyterms at the keyterm rate", async () => {
		const baseRule = { ...PRICING_CARD.rules[0], meter: "input_audio_seconds", unit: "second", unit_size: 3600 };
		const pricingCard = {
			...PRICING_CARD,
			endpoint: "audio.transcription",
			rules: [
				{ ...baseRule, id: "base", price_per_unit: 0.2, match: [] },
				{ ...baseRule, id: "keyterms", price_per_unit: 0.25, match: [{ op: "eq", path: "keyterms", value: true }] },
			],
		};
		const run = async (keywords?: string[]) => {
			let sentKeyterms: string[] = [];
			const mock = installFetchMock([{
				match: (url, init) => {
					if (!url.includes("/v1/speech-to-text")) return false;
					sentKeyterms = ((init?.body as FormData).getAll("keyterms") ?? []).map(String);
					return true;
				},
				response: jsonResponse({ text: "Transcribed", audio_duration: 3600 }),
			}]);
			const result = await execTranscription({
				endpoint: "audio.transcription",
				model: "eleven-labs/scribe-v3",
				body: { model: "eleven-labs/scribe-v3", file: makeAudioFile("hour.wav"), ...(keywords ? { keywords } : {}) },
				meta: REQUEST_META,
				workspaceId: "team_test",
				providerId: "elevenlabs",
				byokMeta: [],
				pricingCard,
				providerModelSlug: "scribe_v3",
				stream: false,
			} as any);
			mock.restore();
			return { result, sentKeyterms };
		};

		const plain = await run();
		expect(plain.sentKeyterms).toEqual([]);
		expect(plain.result.bill.cost_cents).toBeCloseTo(20, 6);

		const withKeyterms = await run(["Phaseo", "Scribe"]);
		expect(withKeyterms.sentKeyterms).toEqual(["Phaseo", "Scribe"]);
		expect(withKeyterms.result.bill.cost_cents).toBeCloseTo(25, 6);
	});

	it("bills at least 20 seconds when more than 100 keyterms are sent", async () => {
		// ElevenLabs: "When more than 100 keyterms are provided, a minimum billable duration of
		// 20 seconds applies per request."
		const baseRule = { ...PRICING_CARD.rules[0], meter: "input_audio_seconds", unit: "second", unit_size: 3600 };
		const pricingCard = {
			...PRICING_CARD,
			endpoint: "audio.transcription",
			rules: [
				{ ...baseRule, id: "base", price_per_unit: 0.2, match: [] },
				{ ...baseRule, id: "keyterms", price_per_unit: 0.25, match: [{ op: "eq", path: "keyterms", value: true }] },
			],
		};
		const keyterms = (count: number) => Array.from({ length: count }, (_, index) => `term ${index}`);
		const run = async (count: number, audioDuration: number) => {
			const mock = installFetchMock([{
				match: (url) => url.includes("/v1/speech-to-text"),
				response: jsonResponse({ text: "Transcribed", audio_duration: audioDuration }),
			}]);
			const result = await execTranscription({
				endpoint: "audio.transcription",
				model: "eleven-labs/scribe-v3",
				body: { model: "eleven-labs/scribe-v3", file: makeAudioFile("clip.wav"), keywords: keyterms(count) },
				meta: REQUEST_META,
				workspaceId: "team_test",
				providerId: "elevenlabs",
				byokMeta: [],
				pricingCard,
				providerModelSlug: "scribe_v3",
				stream: false,
			} as any);
			mock.restore();
			return result;
		};
		const centsFor = (seconds: number) => (seconds / 3600) * 25;

		// 101 keyterms on a 3 s clip: billed as 20 s.
		const short = await run(101, 3);
		expect(short.bill.usage?.input_audio_seconds).toBe(20);
		expect(short.normalized?.usage?.input_audio_seconds).toBe(20);
		expect(short.bill.cost_cents).toBeCloseTo(centsFor(20), 6);

		// Exactly 100 keyterms: no minimum.
		const atLimit = await run(100, 3);
		expect(atLimit.bill.usage?.input_audio_seconds).toBe(3);
		expect(atLimit.bill.cost_cents).toBeCloseTo(centsFor(3), 6);

		// A clip longer than the minimum is billed at its length.
		const long = await run(101, 45);
		expect(long.bill.usage?.input_audio_seconds).toBe(45);
		expect(long.bill.cost_cents).toBeCloseTo(centsFor(45), 6);
	});

	it("forwards language_code for ElevenLabs transcriptions", async () => {
		let languageCode: string | null = null;
		const mock = installFetchMock([
			{
				match: (url, init) => {
					if (!url.includes("/v1/speech-to-text")) return false;
					const form = init?.body as FormData | undefined;
					if (form && typeof (form as any).get === "function") {
						languageCode = String(form.get("language_code") ?? "");
					}
					return true;
				},
				response: jsonResponse({ text: "Transcribed" }),
			},
		]);

		const result = await execTranscription({
			endpoint: "audio.transcription",
			model: "eleven-labs/scribe-v1",
			body: {
				model: "eleven-labs/scribe-v1",
				file: makeAudioFile("lang.wav"),
				language: "en",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
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
		expect(languageCode).toBe("en");
	});

	it("maps URL input and Scribe controls to the native multipart contract", async () => {
		let capturedUrl = "";
		let capturedForm: FormData | null = null;
		const mock = installFetchMock([{ match: (url, init) => {
			capturedUrl = url;
			capturedForm = init?.body as FormData;
			return url.includes("/v1/speech-to-text");
		}, response: jsonResponse({ text: "Transcribed" }) }]);

		const result = await execTranscription({
			endpoint: "audio.transcription",
			model: "eleven-labs/scribe-v2",
			body: {
				model: "eleven-labs/scribe-v2",
				file_url: "https://example.com/call.mp3",
				keywords: ["Phaseo", "AC 42"],
				temperature: 1.5,
				diarize: true,
				timestamp_granularities: ["word"],
				config: { elevenlabs: { enable_logging: false, tag_audio_events: true } },
			},
			meta: REQUEST_META, workspaceId: "team_test", providerId: "elevenlabs",
			byokMeta: [], pricingCard: null, providerModelSlug: null, stream: false,
		} as any);
		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedUrl).toContain("enable_logging=false");
		expect(capturedForm?.get("source_url")).toBe("https://example.com/call.mp3");
		expect(capturedForm?.getAll("keyterms")).toEqual(["Phaseo", "AC 42"]);
		expect(capturedForm?.get("temperature")).toBe("1.5");
		expect(capturedForm?.get("diarize")).toBe("true");
		expect(capturedForm?.get("timestamps_granularity")).toBe("word");
		expect(capturedForm?.get("tag_audio_events")).toBe("true");
	});

	it("forwards ElevenLabs native character timestamps without duplicating the field", async () => {
		let capturedForm: FormData | null = null;
		const mock = installFetchMock([{
			match: (url, init) => {
				capturedForm = init?.body as FormData;
				return url.includes("/v1/speech-to-text");
			},
			response: jsonResponse({ text: "Transcribed" }),
		}]);

		const result = await execTranscription({
			endpoint: "audio.transcription",
			model: "eleven-labs/scribe-v2",
			body: {
				model: "eleven-labs/scribe-v2",
				file: makeAudioFile("character.wav"),
				timestamp_granularities: ["word"],
				config: { elevenlabs: { timestamps_granularity: "character" } },
			},
			meta: REQUEST_META, workspaceId: "team_test", providerId: "elevenlabs",
			byokMeta: [], pricingCard: null, providerModelSlug: null, stream: false,
		} as any);
		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedForm?.getAll("timestamps_granularity")).toEqual(["character"]);
	});

	it("rejects segment timestamps because ElevenLabs Scribe has no segment mode", async () => {
		const result = await execTranscription({
			endpoint: "audio.transcription",
			model: "eleven-labs/scribe-v2",
			body: {
				model: "eleven-labs/scribe-v2",
				file: makeAudioFile("segment.wav"),
				timestamp_granularities: ["segment"],
			},
			meta: REQUEST_META, workspaceId: "team_test", providerId: "elevenlabs",
			byokMeta: [], pricingCard: null, providerModelSlug: null, stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.clone().json()).toMatchObject({
			error: { param: "timestamp_granularities" },
		});
	});

	it("rejects unsupported native ElevenLabs timestamp granularity before fetching", async () => {
		const mock = installFetchMock([]);
		const result = await execTranscription({
			endpoint: "audio.transcription",
			model: "eleven-labs/scribe-v2",
			body: {
				model: "eleven-labs/scribe-v2",
				file: makeAudioFile("native-segment.wav"),
				config: { elevenlabs: { timestamps_granularity: "segment" } },
			},
			meta: REQUEST_META, workspaceId: "team_test", providerId: "elevenlabs",
			byokMeta: [], pricingCard: null, providerModelSlug: null, stream: false,
		} as any);
		mock.restore();

		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.clone().json()).toMatchObject({
			error: { param: "timestamps_granularity" },
		});
		expect(mock.calls).toHaveLength(0);
	});
});
