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
		teamId: "team_test",
		providerId: "google",
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
						candidatesTokenCount: 7,
						totalTokenCount: 18,
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
			input: "Hello from AI Stats",
			voice: "Kore",
			instructions: "Use a calm and concise tone.",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedUrl).toContain("/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=");
		expect(capturedBody?.generationConfig?.responseModalities).toEqual(["AUDIO"]);
		expect(capturedBody?.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe("Kore");
		expect(capturedBody?.contents?.[0]?.parts?.[0]?.text).toContain("Use a calm and concise tone.");
		expect(capturedBody?.contents?.[0]?.parts?.[0]?.text).toContain("Hello from AI Stats");

		expect(result.kind).toBe("completed");
		expect((result as any).ir?.audio?.data).toBe("QUJDREVGRw==");
		expect((result as any).ir?.audio?.mimeType).toBe("audio/wav");
		expect((result as any).ir?.usage?.totalTokens).toBe(18);
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
