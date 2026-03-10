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
});
