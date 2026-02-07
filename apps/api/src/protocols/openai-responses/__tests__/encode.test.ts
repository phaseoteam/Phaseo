// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// OpenAI Responses API - Encoder Tests
import { describe, it, expect } from "vitest";
import { encodeOpenAIResponsesResponse } from "../encode";
import type { IRChatResponse } from "@core/ir";

describe("encodeOpenAIResponsesResponse", () => {
	it("should encode simple text response", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [{ type: "text", text: "Hello! How can I help?" }],
					},
					finishReason: "stop",
				},
			],
			usage: {
				promptTokens: 10,
				completionTokens: 7,
				totalTokens: 17,
			},
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.id).toBe("req-123");
		expect(response.nativeResponseId).toBe("resp-abc123");
		expect(response.model).toBe("gpt-4");
		expect(response.object).toBe("response");
		expect(response.output).toHaveLength(1);
		expect(response.output[0]).toEqual({
			type: "message",
			role: "assistant",
			content: [{ type: "output_text", text: "Hello! How can I help?", annotations: [] }],
		});
		expect(response.usage).toEqual({
			prompt_tokens: 10,
			completion_tokens: 7,
			total_tokens: 17,
		});
	});

	it("should encode tool calls as function_call items", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						toolCalls: [
							{
								id: "call_abc123",
								name: "get_weather",
								arguments: '{"location": "Paris"}',
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.output).toHaveLength(1);
		expect(response.output[0]).toEqual({
			type: "function_call",
			call_id: "call_abc123",
			name: "get_weather",
			arguments: '{"location": "Paris"}',
		});
	});

	it("should encode multiple tool calls", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						toolCalls: [
							{
								id: "call_1",
								name: "get_weather",
								arguments: '{"location": "Paris"}',
							},
							{
								id: "call_2",
								name: "get_weather",
								arguments: '{"location": "London"}',
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.output).toHaveLength(2);
		expect(response.output[0].type).toBe("function_call");
		expect(response.output[1].type).toBe("function_call");
		if (
			response.output[0].type === "function_call" &&
			response.output[1].type === "function_call"
		) {
			expect(response.output[0].call_id).toBe("call_1");
			expect(response.output[1].call_id).toBe("call_2");
		}
	});

	it("should handle response with both text and tool calls", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [{ type: "text", text: "Let me check that for you." }],
						toolCalls: [
							{
								id: "call_1",
								name: "search",
								arguments: "{}",
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.output).toHaveLength(2);
		expect(response.output[0].type).toBe("message");
		expect(response.output[1].type).toBe("function_call");
	});

	it("should encode reasoning and main content as separate outputs", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [
							{ type: "reasoning_text", text: "Let me think about this..." },
							{ type: "text", text: "The answer is 42." },
						],
					},
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.output).toHaveLength(2);

		// First output should be reasoning
		expect(response.output[0].type).toBe("reasoning");
		if (response.output[0].type === "reasoning") {
			expect(response.output[0].content).toHaveLength(1);
			expect(response.output[0].content[0]).toEqual({
				type: "output_text",
				text: "Let me think about this...",
				annotations: [],
			});
		}

		// Second output should be the main message
		expect(response.output[1].type).toBe("message");
		if (response.output[1].type === "message") {
			expect(response.output[1].content).toEqual([
				{ type: "output_text", text: "The answer is 42.", annotations: [] },
			]);
		}
	});

	it("should handle multiple reasoning blocks", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [
							{ type: "reasoning_text", text: "Step 1..." },
							{ type: "reasoning_text", text: "Step 2..." },
							{ type: "text", text: "Final answer" },
						],
					},
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.output).toHaveLength(3);
		expect(response.output[0].type).toBe("reasoning");
		expect(response.output[1].type).toBe("reasoning");
		expect(response.output[2].type).toBe("message");
	});

	it("should handle missing usage", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: [{ type: "text", text: "Test" }] },
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.usage).toBeUndefined();
	});

	it("should use fallback ID when nativeId is missing", () => {
		const ir: IRChatResponse = {
			id: "req-456",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: [{ type: "text", text: "Test" }] },
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-456");

		expect(response.id).toBe("req-456");
	});

	it("should handle empty content", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: [{ type: "text", text: "" }] },
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.output).toHaveLength(1);
		expect(response.output[0].type).toBe("message");
		if (response.output[0].type === "message") {
			expect(response.output[0].content).toEqual([{ type: "output_text", text: "", annotations: [] }]);
		}
	});

	it("should handle null content when there are tool calls", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						toolCalls: [
							{
								id: "call_1",
								name: "test",
								arguments: "{}",
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		// Should only have function_call, no message
		expect(response.output).toHaveLength(1);
		expect(response.output[0].type).toBe("function_call");
	});

	it("should encode refusal if present", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						refusal: "I cannot help with that.",
					},
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.output).toHaveLength(1);
		if (response.output[0].type === "message") {
			expect(response.output[0].refusal).toBe("I cannot help with that.");
		}
	});

	it("should include created timestamp", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: [{ type: "text", text: "Test" }] },
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.created).toBeGreaterThan(0);
		expect(typeof response.created).toBe("number");
	});

	it("should handle only reasoning without main content", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: [{ type: "reasoning_text", text: "Thinking..." }] },
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.output).toHaveLength(1);
		expect(response.output[0].type).toBe("reasoning");
	});

	it("should handle content with no reasoning flag (defaults to main content)", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "resp-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: [{ type: "text", text: "Regular response" }] },
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIResponsesResponse(ir, "req-123");

		expect(response.output).toHaveLength(1);
		expect(response.output[0].type).toBe("message");
	});
});

