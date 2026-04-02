import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

function buildArgs(
	overrides?: Partial<IRChatRequest>,
	options?: { providerModelSlug?: string },
): ExecutorExecuteArgs {
	const ir: IRChatRequest = {
		model: "google/gemma-3-27b:free",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "Write a short paragraph." }] }],
		...overrides,
	};
	return {
		ir,
		requestId: "req_google_usage_fallback",
		teamId: "team_test",
		providerId: "google-ai-studio",
		endpoint: "responses",
		protocol: "openai.responses",
		capability: "text.generate",
		providerModelSlug: options?.providerModelSlug ?? "gemma-3-27b-it",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null as any,
		meta: {},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("google-ai-studio execute usage fallback", () => {
	it("estimates completion tokens when upstream usage reports prompt-only counts", async () => {
		const sseBody = [
			`data: ${JSON.stringify({
				candidates: [{
					index: 0,
					content: { parts: [{ text: "This is a generated answer from Gemini." }] },
					finishReason: "STOP",
				}],
				usageMetadata: {
					promptTokenCount: 552,
					candidatesTokenCount: 0,
					totalTokenCount: 552,
				},
			})}`,
			"",
			"data: [DONE]",
			"",
		].join("\n");

		const mock = installFetchMock([{
			match: (url) => url.includes(":streamGenerateContent"),
			response: new Response(sseBody, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		}]);

		const result = await executor(buildArgs());
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir?.choices?.[0]?.message?.content?.[0]).toEqual({
			type: "text",
			text: "This is a generated answer from Gemini.",
		});
		expect(result.ir?.usage?.inputTokens).toBe(552);
		expect(result.ir?.usage?.outputTokens ?? 0).toBeGreaterThan(0);
		expect(result.ir?.usage?.totalTokens ?? 0).toBeGreaterThan(552);

		const usage = (result.rawResponse as any)?.usage;
		expect(usage?.prompt_tokens).toBe(552);
		expect(usage?.completion_tokens ?? 0).toBeGreaterThan(0);
		expect(usage?.total_tokens ?? 0).toBeGreaterThan(552);
	});

	it("retries Lyria transient 5xx failures on the same candidate model", async () => {
		const sseBody = [
			`data: ${JSON.stringify({
				candidates: [{
					index: 0,
					content: { parts: [{ text: "Recovered after transient upstream failure." }] },
					finishReason: "STOP",
				}],
				usageMetadata: {
					promptTokenCount: 24,
					candidatesTokenCount: 11,
					totalTokenCount: 35,
				},
			})}`,
			"",
			"data: [DONE]",
			"",
		].join("\n");

		let attempts = 0;
		const mock = installFetchMock([{
			match: (url) => url.includes("models/lyria-3-pro-preview:streamGenerateContent"),
			response: () => {
				attempts += 1;
				if (attempts === 1) {
					return new Response(JSON.stringify({ error: { message: "Internal error encountered." } }), {
						status: 500,
						headers: { "Content-Type": "application/json" },
					});
				}
				return new Response(sseBody, {
					status: 200,
					headers: { "Content-Type": "text/event-stream" },
				});
			},
		}]);

		const result = await executor(buildArgs(
			{ model: "google/lyria-3-pro-preview" },
			{ providerModelSlug: "google/lyria-3-pro-preview" },
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(attempts).toBe(2);
		expect(mock.calls.every((call) => call.url.includes("models/lyria-3-pro-preview:streamGenerateContent"))).toBe(true);
		expect(result.ir?.choices?.[0]?.message?.content?.[0]).toEqual({
			type: "text",
			text: "Recovered after transient upstream failure.",
		});
	});

	it("falls back from non-preview Lyria alias to preview candidate model", async () => {
		const sseBody = [
			`data: ${JSON.stringify({
				candidates: [{
					index: 0,
					content: { parts: [{ text: "Served by fallback candidate." }] },
					finishReason: "STOP",
				}],
				usageMetadata: {
					promptTokenCount: 19,
					candidatesTokenCount: 8,
					totalTokenCount: 27,
				},
			})}`,
			"",
			"data: [DONE]",
			"",
		].join("\n");

		const mock = installFetchMock([
			{
				match: (url) => url.includes("models/lyria-3-pro:streamGenerateContent"),
				response: new Response(JSON.stringify({ error: { message: "Model not found." } }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				}),
			},
			{
				match: (url) => url.includes("models/lyria-3-pro-preview:streamGenerateContent"),
				response: new Response(sseBody, {
					status: 200,
					headers: { "Content-Type": "text/event-stream" },
				}),
			},
		]);

		const result = await executor(buildArgs(
			{ model: "google/lyria-3-pro" },
			{ providerModelSlug: "google/lyria-3-pro" },
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(
			mock.calls.some((call) => call.url.includes("models/lyria-3-pro-preview:streamGenerateContent")),
		).toBe(true);
		expect(result.ir?.model).toBe("lyria-3-pro-preview");
		expect(result.ir?.choices?.[0]?.message?.content?.[0]).toEqual({
			type: "text",
			text: "Served by fallback candidate.",
		});
	});

	it("parses Lyria JSON chunk-array responses into text+audio IR content", async () => {
		const payload = [
			{
				candidates: [{
					index: 0,
					content: {
						role: "model",
						parts: [{ text: "Verse line one" }],
					},
				}],
				usageMetadata: {
					promptTokenCount: 21,
					candidatesTokenCount: 573,
					totalTokenCount: 594,
				},
				modelVersion: "lyria-3-clip-preview",
				responseId: "resp_123",
			},
			{
				candidates: [{
					index: 0,
					content: {
						role: "model",
						parts: [{
							inlineData: {
								mimeType: "audio/mpeg",
								data: "RkFLRS1NUEczLURBVEE=",
							},
						}],
					},
				}],
				usageMetadata: {
					promptTokenCount: 21,
					candidatesTokenCount: 1106,
					totalTokenCount: 1127,
				},
				modelVersion: "lyria-3-clip-preview",
				responseId: "resp_123",
			},
			{
				candidates: [{
					index: 0,
					content: {
						role: "model",
						parts: [{ text: "" }],
					},
					finishReason: "STOP",
				}],
				usageMetadata: {
					promptTokenCount: 21,
					candidatesTokenCount: 1106,
					totalTokenCount: 1127,
				},
				modelVersion: "lyria-3-clip-preview",
				responseId: "resp_123",
			},
		];

		const mock = installFetchMock([{
			match: (url) => url.includes("models/lyria-3-clip-preview:streamGenerateContent"),
			response: new Response(JSON.stringify(payload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs(
			{ model: "google/lyria-3-clip-preview" },
			{ providerModelSlug: "google/lyria-3-clip-preview" },
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(mock.calls.some((call) => call.url.includes("?alt=sse"))).toBe(false);
		expect(result.ir?.nativeId).toBe("resp_123");
		expect(result.ir?.choices?.[0]?.finishReason).toBe("stop");
		expect(result.ir?.choices?.[0]?.message?.content).toEqual([
			{ type: "text", text: "Verse line one" },
			{
				type: "audio",
				source: "data",
				data: "RkFLRS1NUEczLURBVEE=",
				format: "mp3",
			},
		]);
		expect(result.ir?.usage?.totalTokens).toBe(1127);
	});
});

