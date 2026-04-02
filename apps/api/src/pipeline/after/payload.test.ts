import { describe, expect, it } from "vitest";
import { enrichSuccessPayload } from "./payload";

describe("enrichSuccessPayload model selection", () => {
	it("backfills assistant phase from IR when raw output message omits it", async () => {
		const ctx: any = {
			endpoint: "responses",
			protocol: "openai.responses",
			requestId: "req_test_phase_backfill",
			model: "openai/gpt-5",
			body: {},
			meta: {},
		};
		const result: any = {
			provider: "openai",
			ir: {
				choices: [{
					index: 0,
					message: {
						role: "assistant",
						phase: "final_answer",
						content: [{ type: "text", text: "done" }],
					},
					finishReason: "stop",
				}],
				usage: {
					inputTokens: 1,
					outputTokens: 1,
					totalTokens: 2,
				},
			},
			rawResponse: {
				id: "resp_phase_backfill",
				model: "gpt-5",
				output: [{
					type: "message",
					id: "msg_1",
					status: "completed",
					role: "assistant",
					content: [{ type: "output_text", text: "done", annotations: [] }],
				}],
				usage: {
					input_tokens: 1,
					output_tokens: 1,
					total_tokens: 2,
				},
			},
		};

		const payload = await enrichSuccessPayload(ctx, result);
		expect(payload.output[0].phase).toBe("final_answer");
	});

	it("uses IR usage mapping when raw usage aliases conflict", async () => {
		const ctx: any = {
			endpoint: "responses",
			protocol: "openai.responses",
			requestId: "req_test_usage_conflict",
			model: "google/gemma-3-27b:free",
			body: {},
			meta: {},
		};
		const result: any = {
			provider: "google-ai-studio",
			ir: {
				choices: [{
					index: 0,
					message: {
						role: "assistant",
						content: [{ type: "text", text: "hello" }],
					},
					finishReason: "stop",
				}],
				usage: {
					inputTokens: 552,
					outputTokens: 2150,
					totalTokens: 2702,
				},
			},
			rawResponse: {
				id: "resp_native_usage_conflict",
				model: "gemma-3-27b-it",
				output: [],
				usage: {
					prompt_tokens: 552,
					completion_tokens: 2150,
					total_tokens: 2702,
					input_tokens: 552,
					output_tokens: 0,
				},
			},
		};

		const payload = await enrichSuccessPayload(ctx, result);
		expect(payload.usage.input_tokens).toBe(552);
		expect(payload.usage.output_tokens).toBe(2150);
		expect(payload.usage.total_tokens).toBe(2702);
	});

	it("keeps input_text_tokens equal to input_tokens and exposes cached read tokens", async () => {
		const ctx: any = {
			endpoint: "responses",
			protocol: "openai.responses",
			requestId: "req_test_cached_subset",
			model: "x-ai/grok-4",
			body: {},
			meta: {},
		};
		const result: any = {
			provider: "x-ai",
			ir: {
				choices: [{
					index: 0,
					message: {
						role: "assistant",
						content: [{ type: "text", text: "ok" }],
					},
					finishReason: "stop",
				}],
				usage: {
					inputTokens: 123,
					outputTokens: 9,
					totalTokens: 132,
					cachedInputTokens: 64,
				},
			},
			rawResponse: {
				id: "resp_cached_subset",
				model: "grok-4",
				output: [],
				usage: {
					input_tokens: 123,
					output_tokens: 9,
					total_tokens: 132,
					input_tokens_details: { cached_tokens: 64 },
				},
			},
		};

		const payload = await enrichSuccessPayload(ctx, result);
		expect(payload.usage.input_tokens).toBe(123);
		expect(payload.usage.input_text_tokens).toBe(123);
		expect(payload.usage.cached_read_text_tokens).toBe(64);
		expect(payload.usage.cached_read_tokens_are_subset_of_input).toBeUndefined();
	});

	it("returns canonical API model id for responses payloads", async () => {
		const ctx: any = {
			endpoint: "responses",
			protocol: "openai.responses",
			requestId: "req_test_model",
			model: "openai/gpt-5-nano",
			body: {},
			meta: {},
		};
		const result: any = {
			provider: "openai",
			rawResponse: {
				id: "resp_native_1",
				model: "gpt-5-nano-2025-08-07",
				output: [],
				usage: {
					input_tokens: 1,
					output_tokens: 1,
					total_tokens: 2,
				},
			},
		};

		const payload = await enrichSuccessPayload(ctx, result);

		expect(payload.model).toBe("openai/gpt-5-nano");
	});

	it("preserves server tool usage meters on responses payload usage", async () => {
		const ctx: any = {
			endpoint: "responses",
			protocol: "openai.responses",
			requestId: "req_test_server_tool_usage",
			model: "openai/gpt-4.1",
			body: {},
			meta: {},
		};
		const result: any = {
			provider: "openai",
			ir: {
				choices: [{
					index: 0,
					message: {
						role: "assistant",
						content: [{ type: "text", text: "current time" }],
					},
					finishReason: "stop",
				}],
				usage: {
					inputTokens: 12,
					outputTokens: 4,
					totalTokens: 16,
					_ext: {
						serverToolUse: {
							datetime_requests: 1,
						},
					},
				},
			},
			rawResponse: null,
		};

		const payload = await enrichSuccessPayload(ctx, result);
		expect(payload.usage.server_tool_use).toEqual({
			datetime_requests: 1,
		});
	});

	it("includes assistant phase in fallback responses output", async () => {
		const ctx: any = {
			endpoint: "responses",
			protocol: "openai.responses",
			requestId: "req_test_phase",
			model: "openai/gpt-5.3-codex",
			body: {},
			meta: {},
		};
		const result: any = {
			provider: "openai",
			ir: {
				choices: [{
					index: 0,
					message: {
						role: "assistant",
						phase: "final_answer",
						content: [{ type: "text", text: "done" }],
					},
					finishReason: "stop",
				}],
				usage: {
					inputTokens: 1,
					outputTokens: 1,
					totalTokens: 2,
				},
			},
			rawResponse: null,
		};

		const payload = await enrichSuccessPayload(ctx, result);
		expect(payload.output[0]).toMatchObject({
			type: "message",
			role: "assistant",
			phase: "final_answer",
		});
	});

	it("emits output_audio in fallback responses output when IR contains audio parts", async () => {
		const ctx: any = {
			endpoint: "responses",
			protocol: "openai.responses",
			requestId: "req_test_audio",
			model: "google/lyria-3-pro-preview",
			body: {},
			meta: {},
		};
		const result: any = {
			provider: "google-ai-studio",
			ir: {
				choices: [{
					index: 0,
					message: {
						role: "assistant",
						content: [
							{ type: "text", text: "Hook ready" },
							{
								type: "audio",
								source: "data",
								data: "UklGRlIAAABXQVZFZm10",
								format: "wav",
							},
						],
					},
					finishReason: "stop",
				}],
				usage: {
					inputTokens: 5,
					outputTokens: 7,
					totalTokens: 12,
				},
			},
			rawResponse: null,
		};

		const payload = await enrichSuccessPayload(ctx, result);
		const message = payload.output[0];
		expect(message.type).toBe("message");
		expect(message.role).toBe("assistant");
		expect(Array.isArray(message.content)).toBe(true);
		expect(message.content.some((item: any) => item.type === "output_audio")).toBe(true);
		expect(message.content).toContainEqual({
			type: "output_audio",
			b64_json: "UklGRlIAAABXQVZFZm10",
			mime_type: "audio/wav",
			format: "wav",
		});
	});
});
