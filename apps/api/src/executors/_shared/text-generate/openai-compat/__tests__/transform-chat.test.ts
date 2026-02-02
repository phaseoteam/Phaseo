// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Unit tests for Chat Completions transformations
import { describe, expect, it } from "vitest";
import { openAIChatToIR } from "../transform-chat";

describe("openAIChatToIR", () => {
	describe("Z.AI Reasoning Extraction", () => {
		it("should extract reasoning_content from Z.AI response", () => {
			const zaiResponse = {
				id: "chatcmpl_123",
				object: "chat.completion",
				created: 1234567890,
				model: "glm-4-7-flash",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "The answer is 8.",
							reasoning_content: "Let me think step by step: 5 + 3 = 8",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 20,
					total_tokens: 30,
					reasoning_tokens: 5,
				},
			};

			const ir = openAIChatToIR(zaiResponse, "req_123", "glm-4-7-flash", "z-ai");

			// Should have 1 choice with both reasoning_text and text parts
			expect(ir.choices.length).toBe(1);

			const choice = ir.choices[0];
			expect(choice.message.content.length).toBe(2);

			// First part should be reasoning_text
			const reasoningPart = choice.message.content.find((p) => p.type === "reasoning_text");
			expect(reasoningPart).toBeDefined();
			expect(reasoningPart?.text).toBe("Let me think step by step: 5 + 3 = 8");

			// Second part should be text
			const textPart = choice.message.content.find((p) => p.type === "text");
			expect(textPart).toBeDefined();
			expect(textPart?.text).toBe("The answer is 8.");

			// Usage should include reasoning tokens
			expect(ir.usage?.inputTokens).toBe(10);
			expect(ir.usage?.outputTokens).toBe(20);
			expect(ir.usage?.reasoningTokens).toBe(5);
		});

		it("should work with zai provider ID variant", () => {
			const response = {
				id: "chatcmpl_456",
				object: "chat.completion",
				created: 1234567890,
				model: "glm-4-7-flash",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "Final answer",
							reasoning_content: "Reasoning process",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 5,
					completion_tokens: 10,
					total_tokens: 15,
				},
			};

			const ir = openAIChatToIR(response, "req_456", "glm-4-7-flash", "zai");

			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.some((p) => p.type === "reasoning_text")).toBe(true);
		});

		it("should handle response without reasoning_content", () => {
			const response = {
				id: "chatcmpl_789",
				object: "chat.completion",
				created: 1234567890,
				model: "glm-4-7-flash",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "Simple answer without reasoning",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 3,
					completion_tokens: 5,
					total_tokens: 8,
				},
			};

			const ir = openAIChatToIR(response, "req_789", "glm-4-7-flash", "z-ai");

			// Should only have 1 choice with text content (no reasoning)
			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.length).toBe(1);
			expect(ir.choices[0].message.content[0].type).toBe("text");
			expect(ir.choices[0].message.content[0].text).toBe("Simple answer without reasoning");
		});

		it("should handle empty reasoning_content", () => {
			const response = {
				id: "chatcmpl_abc",
				object: "chat.completion",
				created: 1234567890,
				model: "glm-4-7-flash",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "Answer",
							reasoning_content: "", // Empty string
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 3,
					completion_tokens: 5,
					total_tokens: 8,
				},
			};

			const ir = openAIChatToIR(response, "req_abc", "glm-4-7-flash", "z-ai");

			// Empty reasoning should not create a reasoning_text part
			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.length).toBe(1);
			expect(ir.choices[0].message.content[0].type).toBe("text");
		});
	});

	describe("Non-Z.AI Providers", () => {
		it("should handle standard OpenAI responses", () => {
			const openaiResponse = {
				id: "chatcmpl_openai",
				object: "chat.completion",
				created: 1234567890,
				model: "gpt-4",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "Hello from OpenAI",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 5,
					completion_tokens: 4,
					total_tokens: 9,
				},
			};

			const ir = openAIChatToIR(openaiResponse, "req_openai", "gpt-4", "openai");

			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.length).toBe(1);
			expect(ir.choices[0].message.content[0].type).toBe("text");
			expect(ir.choices[0].message.content[0].text).toBe("Hello from OpenAI");
			expect(ir.provider).toBe("openai");
		});

		it("should handle tool calls", () => {
			const response = {
				id: "chatcmpl_tools",
				object: "chat.completion",
				created: 1234567890,
				model: "gpt-4",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "",
							tool_calls: [
								{
									id: "call_123",
									type: "function",
									function: {
										name: "get_weather",
										arguments: '{"city":"Boston"}',
									},
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 5,
					total_tokens: 15,
				},
			};

			const ir = openAIChatToIR(response, "req_tools", "gpt-4", "openai");

			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content).toEqual([]); // Empty content for tool calls
			expect(ir.choices[0].message.toolCalls).toBeDefined();
			expect(ir.choices[0].message.toolCalls?.[0].name).toBe("get_weather");
			expect(ir.choices[0].finishReason).toBe("tool_calls");
		});
	});
});

