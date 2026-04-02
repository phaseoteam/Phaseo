import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRMusicGenerateRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

vi.mock("@core/music-jobs", () => ({
	saveMusicJobMeta: vi.fn(async () => undefined),
}));

function buildArgs(ir: IRMusicGenerateRequest): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_google_music_test",
		teamId: "team_test",
		providerId: "google-ai-studio",
		endpoint: "music.generate",
		protocol: "google.music",
		capability: "music.generate",
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

describe("google music.generate executor", () => {
	it("maps prompt and image input to Gemini generateContent and returns normalized audio", async () => {
		let capturedBody: any = null;
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":generateContent?key="),
				response: jsonResponse({
					responseId: "resp_lyria_1",
					candidates: [
						{
							content: {
								parts: [
									{ text: "short instrumental loop" },
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
						promptTokenCount: 12,
						candidatesTokenCount: 8,
						totalTokenCount: 20,
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
					capturedUrl = call.url;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "lyria-3-pro-preview",
			prompt: "warm lo-fi piano with subtle tape hiss",
			rawRequest: {
				input: [
					{
						type: "input_image",
						image_url: "data:image/png;base64,QUJDRA==",
					},
				],
				google: {
					responseModalities: ["audio", "text"],
				},
			},
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedUrl).toContain("/v1beta/models/lyria-3-pro-preview:generateContent?key=");
		expect(capturedBody?.generationConfig?.responseModalities).toEqual(["AUDIO", "TEXT"]);
		expect(capturedBody?.contents?.[0]?.parts?.[0]?.text).toBe("warm lo-fi piano with subtle tape hiss");
		expect(capturedBody?.contents?.[0]?.parts?.[1]?.inline_data?.mime_type).toBe("image/png");
		expect(capturedBody?.contents?.[0]?.parts?.[1]?.inline_data?.data).toBe("QUJDRA==");

		expect(result.kind).toBe("completed");
		expect((result as any).ir?.status).toBe("completed");
		expect((result as any).ir?.audioBase64).toBe("QUJDREVGRw==");
		expect((result as any).ir?.usage?.totalTokens).toBe(20);
		expect((result as any).ir?.result?.text).toBe("short instrumental loop");
	});

	it("returns 400 when prompt and input are both missing", async () => {
		const result = await execute(buildArgs({
			model: "lyria-3-pro-preview",
		}));

		expect(result.upstream?.status).toBe(400);
		const payload = await result.upstream?.clone().json();
		expect(payload?.error?.reason).toBe("missing_prompt_or_input");
	});

	it("passes through upstream errors", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":generateContent?key="),
				response: jsonResponse(
					{
						error: {
							message: "model not found",
						},
					},
					{ status: 404 },
				),
			},
		]);

		const result = await execute(buildArgs({
			model: "lyria-3-pro-preview",
			prompt: "minimal techno",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(404);
		expect(result.kind).toBe("completed");
		expect((result as any).ir).toBeUndefined();
	});

	it("falls back to alternative Lyria candidate when the first model is unavailable", async () => {
		const calledUrls: string[] = [];
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/models/lyria-3-pro:generateContent?key="),
				response: jsonResponse(
					{
						error: {
							message: "Model not found.",
						},
					},
					{ status: 404 },
				),
				onRequest: (call) => {
					calledUrls.push(call.url);
				},
			},
			{
				match: (url) => url.includes("/models/lyria-3-pro-preview:generateContent?key="),
				response: jsonResponse({
					responseId: "resp_lyria_fallback",
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
					calledUrls.push(call.url);
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "google/lyria-3-pro",
			prompt: "cinematic synth pulse",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(calledUrls.length).toBe(2);
		expect(calledUrls[0]).toContain("/models/lyria-3-pro:generateContent?key=");
		expect(calledUrls[1]).toContain("/models/lyria-3-pro-preview:generateContent?key=");
		expect((result as any).ir?.model).toBe("lyria-3-pro-preview");
		expect((result as any).ir?.audioBase64).toBe("QUJD");
	});
});
