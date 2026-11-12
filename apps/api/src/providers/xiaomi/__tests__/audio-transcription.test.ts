import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupRuntimeFromEnv, setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec, xiaomiEncodedAudioLength } from "../endpoints/audio-transcription";

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

describe("Xiaomi audio.transcription endpoint", () => {
	it("maps a WAV upload into Xiaomi chat audio input and normalizes the transcript", async () => {
		let capturedBody: any;
		let capturedHeaders: Record<string, string> = {};
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/chat/completions"),
			response: jsonResponse({
				id: "chatcmpl_asr_1",
				choices: [{
					message: { role: "assistant", content: "Recognized text" },
					finish_reason: "stop",
				}],
				usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
			}),
			onRequest: (call) => {
				capturedBody = call.bodyJson;
				capturedHeaders = call.headers;
			},
		}]);

		const result = await exec({
			endpoint: "audio.transcription",
			model: "xiaomi/mimo-v2.5-asr",
			body: {
				model: "xiaomi/mimo-v2.5-asr",
				file: new File([new Uint8Array([1, 2, 3, 4])], "sample.wav", { type: "audio/wav" }),
				language: "en",
			},
			meta: {
				requestId: "req_xiaomi_asr",
				apiKeyId: "key_test",
				testId: "aimock-xiaomi-transcription",
			},
			workspaceId: "team_test",
			providerId: "xiaomi",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "mimo-v2.5-asr",
			stream: false,
		} as any);
		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedHeaders["X-Test-Id"]).toBe("aimock-xiaomi-transcription");
		expect(capturedBody).toEqual({
			model: "mimo-v2.5-asr",
			messages: [{
				role: "user",
				content: [{
					type: "input_audio",
					input_audio: { data: "data:audio/wav;base64,AQIDBA==" },
				}],
			}],
			asr_options: { language: "en" },
		});
		expect(result.normalized?.text).toBe("Recognized text");
		expect((result.bill.usage as any)?.requests).toBe(1);
	});

	it("rejects unsupported audio formats before calling Xiaomi", async () => {
		const result = await exec({
			endpoint: "audio.transcription",
			body: {
				model: "xiaomi/mimo-v2.5-asr",
				file: new File([new Uint8Array([1])], "sample.flac", { type: "audio/flac" }),
			},
			meta: {},
			workspaceId: "team_test",
			providerId: "xiaomi",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "mimo-v2.5-asr",
			stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.json()).toMatchObject({ error: { param: "file" } });
	});

	it("measures the 10 MB limit on the base64 data URL, not the raw file", () => {
		const limit = 10 * 1024 * 1024;
		// 7,864,302 raw bytes is the largest WAV whose data URL fits.
		expect(xiaomiEncodedAudioLength(7_864_302, "audio/wav")).toBeLessThanOrEqual(limit);
		expect(xiaomiEncodedAudioLength(7_864_303, "audio/wav")).toBeGreaterThan(limit);
		expect(xiaomiEncodedAudioLength(4, "audio/wav")).toBe("data:audio/wav;base64,AQIDBA==".length);
	});

	it("rejects an 8 MB file, whose base64 is over 10 MB, before calling Xiaomi", async () => {
		let fetchCalled = false;
		const result = await exec({
			endpoint: "audio.transcription",
			body: {
				model: "xiaomi/mimo-v2.5-asr",
				file: new File([new Uint8Array(8 * 1024 * 1024)], "sample.mp3", { type: "audio/mpeg" }),
			},
			meta: {},
			workspaceId: "team_test",
			providerId: "xiaomi",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "mimo-v2.5-asr",
			stream: false,
			upstreamTiming: { fetch: async () => { fetchCalled = true; throw new Error("must not be called"); } },
		} as any);

		expect(result.upstream.status).toBe(400);
		expect(fetchCalled).toBe(false);
		expect(await result.upstream.json()).toMatchObject({ error: { param: "file", message: expect.stringContaining("7.5 MB") } });
	});

	it.each([
		["file_url", "https://example.com/sample.wav"],
		["s3_presigned_url", "https://example.com/sample.wav"],
		["file_id", "file_123"],
		["prompt", "Product names"],
		["temperature", 0],
		["response_format", "text"],
		["timestamp_granularities", ["word"]],
		["diarize", false],
		["enable_diarization", false],
		["output_content", "transcript"],
		["session_id", "session_123"],
		["context_bias", ["Phaseo"]],
		["include", ["logprobs"]],
		["chunking_strategy", "auto"],
		["config", { xiaomi: {} }],
	] as const)("rejects the unsupported %s parameter", async (parameter, value) => {
		const result = await exec({
			endpoint: "audio.transcription",
			body: {
				model: "xiaomi/mimo-v2.5-asr",
				file: new File([new Uint8Array([1])], "sample.wav", { type: "audio/wav" }),
				[parameter]: value,
			},
			meta: {},
			workspaceId: "team_test",
			providerId: "xiaomi",
			byokMeta: [],
			pricingCard: null,
			providerModelSlug: "mimo-v2.5-asr",
			stream: false,
		} as any);

		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.json()).toMatchObject({ error: { param: parameter } });
	});

	it("rejects an insecure upstream before sending credentials", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			XIAOMI_MIMO_API_KEY: "sensitive-test-key",
			XIAOMI_MIMO_BASE_URL: "http://xiaomi.example",
		});
		let fetchCalled = false;

		try {
			const result = await exec({
				endpoint: "audio.transcription",
				body: {
					model: "xiaomi/mimo-v2.5-asr",
					file: new File([new Uint8Array([1])], "sample.wav", { type: "audio/wav" }),
				},
				meta: {},
				workspaceId: "team_test",
				providerId: "xiaomi",
				byokMeta: [],
				pricingCard: null,
				providerModelSlug: "mimo-v2.5-asr",
				stream: false,
				upstreamTiming: {
					fetch: async () => {
						fetchCalled = true;
						throw new Error("insecure upstream must not be called");
					},
				},
			} as any);

			expect(result.upstream.status).toBe(500);
			expect(fetchCalled).toBe(false);
			expect(await result.upstream.json()).toMatchObject({
				error: { type: "configuration_error" },
			});
		} finally {
			teardownTestRuntime();
			setupTestRuntime();
		}
	});
});
