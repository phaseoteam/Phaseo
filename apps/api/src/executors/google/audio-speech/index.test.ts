import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRAudioSpeechRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

function buildArgs(ir: IRAudioSpeechRequest): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_google_tts_test",
		workspaceId: "team_test",
		providerId: "google-ai-studio",
		endpoint: "audio.speech",
		protocol: "google.audio",
		capability: "audio.speech",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null,
		meta: {},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("google audio.speech executor", () => {
	it("maps IR to generateContent AUDIO response with voice settings", async () => {
		let capturedBody: any = null;
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":generateContent?key="),
				response: jsonResponse({
					responseId: "resp_google_tts_1",
					candidates: [
						{
							content: {
								parts: [
									{
										inlineData: {
											data: "QUJDREVGRw==",
											mimeType: "audio/wav",
										},
									},
								],
							},
						},
					],
					usageMetadata: {
						promptTokenCount: 11,
						cachedContentTokenCount: 3,
						candidatesTokenCount: 7,
						totalTokenCount: 18,
						promptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
						cacheTokensDetails: [{ modality: "TEXT", tokenCount: 3 }],
						candidatesTokensDetails: [{ modality: "AUDIO", tokenCount: 7 }],
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
					capturedUrl = call.url;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "gemini-2.5-flash-preview-tts",
			input: "Hello from Phaseo",
			voice: "Kore",
			instructions: "Use a calm and concise tone.",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedUrl).toContain("/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=");
		expect(capturedBody?.generationConfig?.responseModalities).toEqual(["AUDIO"]);
		expect(capturedBody?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe("Kore");
		expect(capturedBody?.contents?.[0]?.parts?.[0]?.text).toContain("Use a calm and concise tone.");
		expect(capturedBody?.contents?.[0]?.parts?.[0]?.text).toContain("Hello from Phaseo");

		expect(result.kind).toBe("completed");
		expect((result as any).ir?.audio?.data).toBe("QUJDREVGRw==");
		expect((result as any).ir?.audio?.mimeType).toBe("audio/wav");
		expect((result as any).ir?.usage?.totalTokens).toBe(18);
		expect((result as any).ir?.usage?.cachedInputTokens).toBe(3);
		expect((result as any).ir?.usage?._ext?.outputAudioTokens).toBe(7);
	});

	it("supports OpenAI-style voice object and config.google.voice_name fallback", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":generateContent?key="),
				response: () => jsonResponse({
					candidates: [
						{
							content: {
								parts: [
									{
										inlineData: {
											data: "QUJD",
											mimeType: "audio/wav",
										},
									},
								],
							},
						},
					],
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const withVoiceObject = await execute(buildArgs({
			model: "gemini-2.5-flash-preview-tts",
			input: "Test voice object",
			voice: { id: "Aoede" },
		}));

		expect(withVoiceObject.upstream?.status).toBe(200);
		expect(capturedBody?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe("Aoede");

		const withConfigVoice = await execute(buildArgs({
			model: "gemini-2.5-flash-preview-tts",
			input: "Test config voice",
			rawRequest: {
				config: {
					google: {
						voice_name: "Orus",
					},
				},
			},
		}));

		mock.restore();

		expect(withConfigVoice.upstream?.status).toBe(200);
		expect(capturedBody?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe("Orus");
	});

	it("normalizes Google voice aliases to canonical prebuilt voice names", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":generateContent?key="),
				response: jsonResponse({
					candidates: [
						{
							content: {
								parts: [
									{
										inlineData: {
											data: "QUJD",
											mimeType: "audio/wav",
										},
									},
								],
							},
						},
					],
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "gemini-2.5-flash-preview-tts",
			input: "Normalize Google voice aliases.",
			voice: "kore",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe("Kore");
	});

	it("sends Gemini 3.8 custom voice ids as voiceConfig.voice and maps response_format", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":generateContent?key="),
				response: () => jsonResponse({
					candidates: [{ content: { parts: [{ inlineData: { data: "QUJD", mimeType: "audio/wav" } }] } }],
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const stored = await execute(buildArgs({
			model: "gemini-3.8-flash-tts",
			input: "Custom voice",
			voice: "voice_abc123",
			responseFormat: "wav",
		}));
		expect(stored.upstream?.status).toBe(200);
		expect(capturedBody?.generationConfig?.speechConfig?.voiceConfig).toEqual({ voice: "voice_abc123" });
		expect(capturedBody?.generationConfig?.responseFormat).toEqual({ audio: { mimeType: "AUDIO_WAV" } });

		const replicated = await execute(buildArgs({
			model: "gemini-3.8-flash-lite-tts",
			input: "Replicated voice",
			voice: "voicekey_xyz",
			responseFormat: "pcm",
		}));
		mock.restore();
		expect(replicated.upstream?.status).toBe(200);
		expect(capturedBody?.generationConfig?.speechConfig?.voiceConfig).toEqual({ voice: "voicekey_xyz" });
		expect(capturedBody?.generationConfig?.responseFormat).toEqual({ audio: { mimeType: "AUDIO_L16" } });
	});

	it("rejects custom voice ids on models without custom voices", async () => {
		const result = await execute(buildArgs({
			model: "gemini-3.1-flash-tts-preview",
			input: "Custom voice on preview",
			voice: "voice_abc123",
		}));
		expect(result.upstream?.status).toBe(400);
		const payload = await result.upstream?.clone().json();
		expect(payload?.error?.param).toBe("voice");
		expect(payload?.error?.message).toContain("Gemini 3.8");
	});

	it.each([
		["gemini-3.8-flash-tts", "mp3", "AUDIO_WAV"],
		["gemini-3.1-flash-tts-preview", "opus", undefined],
	] as const)("returns WAV when %s is asked for a format it cannot make (%s)", async (model, responseFormat, mimeType) => {
		let capturedBody: any = null;
		const pcm = Buffer.from([1, 0, 2, 0]).toString("base64");
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":generateContent?key="),
				response: () => jsonResponse({
					candidates: [{ content: { parts: [{ inlineData: { data: pcm, mimeType: "audio/L16;codec=pcm;rate=24000" } }] } }],
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);
		const result = await execute(buildArgs({ model, input: "Format test", responseFormat }));
		mock.restore();
		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.generationConfig?.responseFormat?.audio?.mimeType).toBe(mimeType);
		expect((result as any).ir?.audio?.mimeType).toBe("audio/wav");
	});

	it("adds a WAV header when an older model returns raw PCM for a wav request", async () => {
		let capturedBody: any = null;
		const pcm = Buffer.from([1, 0, 2, 0]).toString("base64");
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":generateContent?key="),
				response: () => jsonResponse({
					candidates: [{ content: { parts: [{ inlineData: { data: pcm, mimeType: "audio/L16;codec=pcm;rate=24000" } }] } }],
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "gemini-3.1-flash-tts-preview",
			input: "Wrap me",
			responseFormat: "wav",
		}));
		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.generationConfig?.responseFormat).toBeUndefined();
		const audio = (result as any).ir?.audio;
		expect(audio?.mimeType).toBe("audio/wav");
		const bytes = Buffer.from(audio?.data, "base64");
		expect(bytes.length).toBe(48);
		expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
		expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
		expect(bytes.readUInt32LE(24)).toBe(24000);
		expect(bytes.readUInt32LE(40)).toBe(4);
		expect([...bytes.subarray(44)]).toEqual([1, 0, 2, 0]);
	});

	it("returns 400 for unsupported Google speech voice", async () => {
		const result = await execute(buildArgs({
			model: "gemini-2.5-flash-preview-tts",
			input: "Invalid voice test",
			voice: "not_a_real_google_voice",
		}));

		expect(result.upstream?.status).toBe(400);
		const payload = await result.upstream?.clone().json();
		expect(payload?.error?.param).toBe("voice");
	});
});
