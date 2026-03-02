import { describe, expect, it } from "vitest";
import { enrichSuccessPayload } from "./payload";

describe("enrichSuccessPayload model selection", () => {
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
