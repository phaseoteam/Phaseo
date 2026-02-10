// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Unit tests for Responses API transformations
import { describe, expect, it } from "vitest";
import { irToOpenAIResponses, openAIResponsesToIR } from "../transform";

describe("openAIResponsesToIR", () => {
	describe("Z.AI Reasoning Format", () => {
		it("should convert Z.AI multi-message response to reasoning + message", () => {
			// Simulate Z.AI's response format: two message items instead of reasoning + message
			const zaiResponse = {
				id: "resp_123",
				object: "response",
				status: "completed",
				created_at: 1234567890,
				output: [
					{
						type: "message",
						output_index: 0,
						role: "assistant",
						content: [
							{
								type: "output_text",
								text: "Let me think through this step by step...",
							},
						],
					},
					{
						type: "message",
						output_index: 0,
						role: "assistant",
						content: [
							{
								type: "output_text",
								text: "The answer is 8.",
							},
						],
					},
				],
				usage: {
					input_tokens: 10,
					output_tokens: 20,
					total_tokens: 30,
				},
			};

			const ir = openAIResponsesToIR(zaiResponse, "req_123", "glm-4-7-flash", "z-ai");

			// Should have 1 choice with both reasoning_text and text content parts
			expect(ir.choices.length).toBe(1);

			const choice = ir.choices[0];
			expect(choice.message.content.length).toBe(2);

			// First part should be reasoning_text
			const reasoningPart = choice.message.content.find((p) => p.type === "reasoning_text");
			expect(reasoningPart).toBeDefined();
			expect(reasoningPart?.text).toBe("Let me think through this step by step...");

			// Second part should be text
			const textPart = choice.message.content.find((p) => p.type === "text");
			expect(textPart).toBeDefined();
			expect(textPart?.text).toBe("The answer is 8.");

			// Usage should be extracted
			expect(ir.usage).toBeDefined();
			expect(ir.usage?.inputTokens).toBe(10);
			expect(ir.usage?.outputTokens).toBe(20);
			expect(ir.usage?.totalTokens).toBe(30);
		});

		it("should handle Z.AI response with output_items field", () => {
			const zaiResponse = {
				id: "resp_456",
				object: "response",
				status: "completed",
				created_at: 1234567890,
				output_items: [
					{
						type: "message",
						output_index: 0,
						role: "assistant",
						content: [{ type: "output_text", text: "Reasoning content" }],
					},
					{
						type: "message",
						output_index: 0,
						role: "assistant",
						content: [{ type: "output_text", text: "Final answer" }],
					},
				],
				usage: {
					input_tokens: 5,
					output_tokens: 10,
					total_tokens: 15,
				},
			};

			const ir = openAIResponsesToIR(zaiResponse, "req_456", "glm-4-7-flash", "zai");

			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.some((p) => p.type === "reasoning_text")).toBe(true);
		});

		it("should not modify single message responses", () => {
			const singleMessageResponse = {
				id: "resp_789",
				object: "response",
				status: "completed",
				created_at: 1234567890,
				output: [
					{
						type: "message",
						output_index: 0,
						role: "assistant",
						content: [{ type: "output_text", text: "Just one message" }],
					},
				],
				usage: {
					input_tokens: 5,
					output_tokens: 5,
					total_tokens: 10,
				},
			};

			const ir = openAIResponsesToIR(singleMessageResponse, "req_789", "glm-4-7-flash", "z-ai");

			// Should have 1 choice with only text content
			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.length).toBe(1);
			expect(ir.choices[0].message.content[0].type).toBe("text");
			expect(ir.choices[0].message.content[0].text).toBe("Just one message");
		});

		it("should handle properly formatted reasoning responses", () => {
			const properResponse = {
				id: "resp_abc",
				object: "response",
				status: "completed",
				created_at: 1234567890,
				output: [
					{
						type: "reasoning",
						output_index: 0,
						content: [{ type: "output_text", text: "Reasoning..." }],
					},
					{
						type: "message",
						output_index: 0,
						role: "assistant",
						content: [{ type: "output_text", text: "Answer" }],
					},
				],
				usage: {
					input_tokens: 5,
					output_tokens: 5,
					total_tokens: 10,
				},
			};

			const ir = openAIResponsesToIR(properResponse, "req_abc", "glm-4-7-flash", "z-ai");

			// Should have 1 choice with both reasoning_text and text parts
			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.some((p) => p.type === "reasoning_text")).toBe(true);
			expect(ir.choices[0].message.content.some((p) => p.type === "text")).toBe(true);
		});
	});

	describe("Non-Z.AI Providers", () => {
		it("should handle OpenAI Responses API format normally", () => {
			const openaiResponse = {
				id: "resp_openai",
				object: "response",
				status: "completed",
				created_at: 1234567890,
				output: [
					{
						type: "message",
						output_index: 0,
						role: "assistant",
						content: [{ type: "output_text", text: "Hello from OpenAI" }],
					},
				],
				usage: {
					input_tokens: 3,
					output_tokens: 5,
					total_tokens: 8,
				},
			};

			const ir = openAIResponsesToIR(openaiResponse, "req_openai", "gpt-4", "openai");

			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.length).toBe(1);
			expect(ir.choices[0].message.content[0].type).toBe("text");
			expect(ir.choices[0].message.content[0].text).toBe("Hello from OpenAI");
			expect(ir.provider).toBe("openai");
		});
	});
});

describe("irToOpenAIResponses", () => {
	it("preserves caller-provided OpenAI reasoning.summary", () => {
		const request = irToOpenAIResponses({
			model: "openai/gpt-5-nano",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "hi" }],
			}],
			stream: false,
			reasoning: {
				effort: "low",
				summary: "detailed",
			},
		} as any, "gpt-5-nano", "openai");

		expect(request.reasoning).toBeDefined();
		expect(request.reasoning.effort).toBe("low");
		expect(request.reasoning.summary).toBe("detailed");
	});

	it("defaults OpenAI reasoning.summary to auto when omitted", () => {
		const request = irToOpenAIResponses({
			model: "openai/gpt-5-nano",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "hi" }],
			}],
			stream: false,
			reasoning: {
				effort: "low",
			},
		} as any, "gpt-5-nano", "openai");

		expect(request.reasoning).toBeDefined();
		expect(request.reasoning.effort).toBe("low");
		expect(request.reasoning.summary).toBe("auto");
	});
});

