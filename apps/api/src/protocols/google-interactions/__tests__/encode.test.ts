import { describe, expect, it } from "vitest";
import type { IRChatResponse } from "@core/ir";
import { encodeGoogleInteractionsResponse } from "../encode";

describe("encodeGoogleInteractionsResponse", () => {
	it("encodes IR content, thoughts, tools, and usage as an Interaction resource", () => {
		const ir: IRChatResponse = {
			id: "req_123",
			nativeId: "interactions/native",
			created: 123,
			model: "google/gemini-test",
			provider: "google-ai-studio",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [
							{
								type: "reasoning_text",
								text: "Thinking",
								summary: "Short thought",
								thoughtSignature: "sig_1",
							},
							{ type: "text", text: "Here is the result." },
							{
								type: "image",
								source: "data",
								data: "ZmFrZQ==",
								mimeType: "image/png",
							},
						],
						toolCalls: [
							{
								id: "call_1",
								name: "lookup",
								arguments: "{\"q\":\"x\"}",
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
			usage: {
				inputTokens: 10,
				outputTokens: 5,
				totalTokens: 15,
				cachedInputTokens: 3,
				reasoningTokens: 2,
				_ext: {
					inputImageTokens: 4,
					outputImageTokens: 7,
				},
			},
		};

		const response = encodeGoogleInteractionsResponse(ir, "req_123");

		expect(response.id).toBe("interactions/native");
		expect(response.gateway_id).toBe("req_123");
		expect(response.object).toBe("interaction");
		expect(response.status).toBe("requires_action");
		expect(response.output_text).toBe("Here is the result.");
		expect(response.steps).toEqual([
			{
				type: "thought",
				signature: "sig_1",
				summary: { type: "text", text: "Short thought" },
			},
			{
				type: "model_output",
				content: [
					{ type: "text", text: "Here is the result." },
					{ type: "image", mime_type: "image/png", data: "ZmFrZQ==" },
				],
			},
			{
				type: "function_call",
				id: "call_1",
				name: "lookup",
				arguments: { q: "x" },
			},
		]);
		expect(response.usage).toEqual({
			total_input_tokens: 10,
			total_output_tokens: 5,
			total_tokens: 15,
			total_cached_tokens: 3,
			total_thought_tokens: 2,
			input_tokens_by_modality: [{ modality: "image", tokens: 4 }],
			output_tokens_by_modality: [{ modality: "image", tokens: 7 }],
		});
	});
});
