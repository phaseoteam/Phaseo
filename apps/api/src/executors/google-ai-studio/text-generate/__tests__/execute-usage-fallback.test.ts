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
	options?: {
		providerModelSlug?: string;
		endpoint?: string;
		protocol?: string;
	},
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
		workspaceId: "team_test",
		providerId: "google-ai-studio",
		endpoint: options?.endpoint ?? "responses",
		protocol: options?.protocol ?? "openai.responses",
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
	it("routes current Gemini Flash models through Interactions and rejects empty output", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response(JSON.stringify({
				id: "v1_empty_response",
				status: "completed",
				steps: [],
				usage: { total_input_tokens: 8, total_output_tokens: 0, total_tokens: 8 },
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs(
			{ model: "google/gemini-3.6-flash" },
			{ providerModelSlug: "google/gemini-3.6-flash" },
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir).toBeUndefined();
		expect(result.upstream?.status).toBe(502);
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("gemini-3.6-flash");
		expect(mock.calls[0]?.bodyJson?.generation_config).toBeUndefined();
	});

	it("does not transform a synthetic Interactions tool-call stream twice", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response(JSON.stringify({
				id: "interactions/tool-call",
				status: "completed",
				steps: [{
					type: "function_call",
					id: "call_datetime",
					name: "datetime",
					arguments: { timezone: "Europe/London" },
				}],
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		try {
			const result = await executor(buildArgs(
				{
					model: "google/gemini-3.5-flash-lite",
					stream: true,
					tools: [{
						name: "datetime",
						description: "Get the current datetime",
						parameters: { type: "object", properties: { timezone: { type: "string" } } },
					}],
				},
				{ providerModelSlug: "google/gemini-3.5-flash-lite" },
			));

			expect(result.kind).toBe("stream");
			if (result.kind !== "stream") return;
			const body = await new Response(result.stream).text();
			expect(body).toContain("response.created");
			expect(body).toContain("interactions/tool-call");
			expect(body).toContain("call_datetime");
			expect(body).not.toContain("google_empty_response");
		} finally {
			mock.restore();
		}
	});

	it("keeps legacy GenerateContent routing for older AI Studio models", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/models/gemini-2.5-flash:generateContent"),
			response: new Response(JSON.stringify({
				candidates: [{
					content: { parts: [{ text: "legacy response" }] },
					finishReason: "STOP",
				}],
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs(
			{ model: "google/gemini-2.5-flash" },
			{ providerModelSlug: "google/gemini-2.5-flash" },
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir?.choices[0]?.message.content[0]).toEqual({
			type: "text",
			text: "legacy response",
		});
		expect(mock.calls[0]?.bodyJson?.contents?.[0]?.role).toBe("user");
	});

	it("estimates completion tokens when upstream usage reports prompt-only counts", async () => {
		const payload = {
			id: "v1_usage_fallback",
			status: "completed",
			steps: [{
				type: "model_output",
				content: [{ type: "text", text: "This is a generated answer from Gemini." }],
			}],
			usage: {
				total_input_tokens: 552,
				total_output_tokens: 0,
				total_tokens: 552,
			},
		};

		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response(JSON.stringify(payload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs(undefined, {
			endpoint: "interactions",
			protocol: "google.interactions",
		}));
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

		expect(result.bill.usage?.output_text_tokens ?? 0).toBeGreaterThan(0);
	});

	it("retries Lyria transient 5xx failures on the same candidate model", async () => {
		const payload = {
			id: "v1_lyria_retry",
			status: "completed",
			steps: [{
				type: "model_output",
				content: [{ type: "text", text: "Recovered after transient upstream failure." }],
			}],
			usage: {
				total_input_tokens: 24,
				total_output_tokens: 11,
				total_tokens: 35,
			},
		};

		let attempts = 0;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: () => {
				attempts += 1;
				if (attempts === 1) {
					return new Response(JSON.stringify({ error: { message: "Internal error encountered." } }), {
						status: 500,
						headers: { "Content-Type": "application/json" },
					});
				}
				return new Response(JSON.stringify(payload), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		}]);

		const result = await executor(buildArgs(
			{ model: "google/lyria-3-pro-preview" },
			{
				providerModelSlug: "google/lyria-3-pro-preview",
				endpoint: "interactions",
				protocol: "google.interactions",
			},
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(attempts).toBe(2);
		expect(mock.calls.every((call) => call.bodyJson?.model === "lyria-3-pro-preview")).toBe(true);
		expect(result.ir?.choices?.[0]?.message?.content?.[0]).toEqual({
			type: "text",
			text: "Recovered after transient upstream failure.",
		});
	});

	it("falls back from non-preview Lyria alias to preview candidate model", async () => {
		const payload = {
			id: "v1_lyria_fallback",
			status: "completed",
			steps: [{
				type: "model_output",
				content: [{ type: "text", text: "Served by fallback candidate." }],
			}],
			usage: {
				total_input_tokens: 19,
				total_output_tokens: 8,
				total_tokens: 27,
			},
		};
		let attempts = 0;

		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1beta/interactions"),
				response: () => {
					attempts += 1;
					if (attempts === 1) {
						return new Response(JSON.stringify({ error: { message: "Model not found." } }), {
							status: 404,
							headers: { "Content-Type": "application/json" },
						});
					}
					return new Response(JSON.stringify(payload), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				},
			},
		]);

		const result = await executor(buildArgs(
			{ model: "google/lyria-3-pro" },
			{
				providerModelSlug: "google/lyria-3-pro",
				endpoint: "interactions",
				protocol: "google.interactions",
			},
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(
			mock.calls.some((call) => call.bodyJson?.model === "lyria-3-pro-preview"),
		).toBe(true);
		expect(result.ir?.model).toBe("lyria-3-pro-preview");
		expect(result.ir?.choices?.[0]?.message?.content?.[0]).toEqual({
			type: "text",
			text: "Served by fallback candidate.",
		});
	});

	it("parses Interactions JSON responses into text+audio IR content", async () => {
		const payload = {
			id: "resp_123",
			status: "completed",
			steps: [{
				type: "model_output",
				content: [
					{ type: "text", text: "Verse line one" },
					{
						type: "audio",
						mime_type: "audio/mpeg",
						data: "RkFLRS1NUEczLURBVEE=",
					},
				],
			}],
			usage: {
				total_input_tokens: 21,
				total_output_tokens: 1106,
				total_tokens: 1127,
			},
		};

		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/interactions"),
			response: new Response(JSON.stringify(payload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		}]);

		const result = await executor(buildArgs(
			{ model: "google/lyria-3-clip-preview" },
			{
				providerModelSlug: "google/lyria-3-clip-preview",
				endpoint: "interactions",
				protocol: "google.interactions",
			},
		));
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(mock.calls.some((call) => call.bodyJson?.stream)).toBe(false);
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
