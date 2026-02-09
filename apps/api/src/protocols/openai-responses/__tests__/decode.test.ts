// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// OpenAI Responses API - Decoder Tests
import { describe, it, expect } from "vitest";
import { decodeOpenAIResponsesRequest } from "../decode";
import type { IRChatRequest } from "@core/ir";

describe("decodeOpenAIResponsesRequest", () => {
	it("should decode simple string input as user message", () => {
		const request = {
			model: "gpt-4",
			input: "Hello, world!",
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.model).toBe("gpt-4");
		expect(ir.messages).toHaveLength(1);
		expect(ir.messages[0].role).toBe("user");
		expect(ir.messages[0].content).toEqual([
			{ type: "text", text: "Hello, world!" },
		]);
		expect(ir.stream).toBe(false);
	});

	it("should decode instructions as system message", () => {
		const request = {
			model: "gpt-4",
			instructions: "You are a helpful assistant.",
			input: "Hello",
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.messages).toHaveLength(2);
		expect(ir.messages[0].role).toBe("system");
		expect(ir.messages[0].content).toEqual([
			{ type: "text", text: "You are a helpful assistant." },
		]);
		expect(ir.messages[1].role).toBe("user");
	});

	it("should decode input array with message items", () => {
		const request = {
			model: "gpt-4",
			input: [
				{
					type: "message",
					role: "user",
					content: "What's the weather?",
				},
				{
					type: "message",
					role: "assistant",
					content: "I'll check that for you.",
				},
				{
					type: "message",
					role: "user",
					content: "Thanks!",
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.messages).toHaveLength(3);
		expect(ir.messages[0].role).toBe("user");
		expect(ir.messages[1].role).toBe("assistant");
		expect(ir.messages[2].role).toBe("user");
	});

	it("should decode message with content array", () => {
		const request = {
			model: "gpt-4",
			input: [
				{
					type: "message",
					role: "user",
					content: [
						{ type: "text", text: "What's in this image?" },
						{
							type: "image_url",
							image_url: { url: "https://example.com/img.jpg" },
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.messages[0].content).toHaveLength(2);
		expect(ir.messages[0].content[0]).toEqual({
			type: "text",
			text: "What's in this image?",
		});
		expect(ir.messages[0].content[1]).toMatchObject({
			type: "image",
			source: "url",
			data: "https://example.com/img.jpg",
		});
	});

	it("should decode function_call items as tool calls", () => {
		const request = {
			model: "gpt-4",
			input: [
				{
					type: "message",
					role: "user",
					content: "What's the weather in Paris?",
				},
				{
					type: "function_call",
					call_id: "call_abc123",
					name: "get_weather",
					arguments: '{"location": "Paris"}',
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.messages).toHaveLength(2);
		expect(ir.messages[0].role).toBe("user");
		expect(ir.messages[1].role).toBe("assistant");

		if (ir.messages[1].role === "assistant") {
			expect(ir.messages[1].toolCalls).toHaveLength(1);
			expect(ir.messages[1].toolCalls![0]).toEqual({
				id: "call_abc123",
				name: "get_weather",
				arguments: '{"location": "Paris"}',
			});
		}
	});

	it("should generate call_id if missing in function_call", () => {
		const request = {
			model: "gpt-4",
			input: [
				{
					type: "function_call",
					name: "test_function",
					arguments: "{}",
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.messages[0].role).toBe("assistant");
		if (ir.messages[0].role === "assistant") {
			expect(ir.messages[0].toolCalls![0].id).toMatch(/^call_/);
		}
	});

	it("should decode function_call_output as tool result", () => {
		const request = {
			model: "gpt-4",
			input: [
				{
					type: "function_call",
					call_id: "call_abc123",
					name: "get_weather",
					arguments: '{"location": "Paris"}',
				},
				{
					type: "function_call_output",
					call_id: "call_abc123",
					output: "Sunny, 22°C",
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.messages).toHaveLength(2);
		expect(ir.messages[0].role).toBe("assistant");
		expect(ir.messages[1].role).toBe("tool");

		if (ir.messages[1].role === "tool") {
			expect(ir.messages[1].toolResults).toHaveLength(1);
			expect(ir.messages[1].toolResults[0]).toEqual({
				toolCallId: "call_abc123",
				content: "Sunny, 22°C",
			});
		}
	});

	it("should handle multiple function calls", () => {
		const request = {
			model: "gpt-4",
			input: [
				{
					type: "function_call",
					call_id: "call_1",
					name: "get_weather",
					arguments: '{"location": "Paris"}',
				},
				{
					type: "function_call",
					call_id: "call_2",
					name: "get_weather",
					arguments: '{"location": "London"}',
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.messages).toHaveLength(1);
		expect(ir.messages[0].role).toBe("assistant");

		if (ir.messages[0].role === "assistant") {
			expect(ir.messages[0].toolCalls).toHaveLength(2);
			expect(ir.messages[0].toolCalls![0].id).toBe("call_1");
			expect(ir.messages[0].toolCalls![1].id).toBe("call_2");
		}
	});

	it("should decode tools definitions", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			tools: [
				{
					name: "get_weather",
					description: "Get current weather",
					parameters: {
						type: "object",
						properties: {
							location: { type: "string" },
						},
					},
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.tools).toHaveLength(1);
		expect(ir.tools![0]).toEqual({
			name: "get_weather",
			description: "Get current weather",
			parameters: {
				type: "object",
				properties: {
					location: { type: "string" },
				},
			},
		});
	});

	it("should decode tools with function wrapper (OpenAI Chat format)", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			tools: [
				{
					type: "function",
					function: {
						name: "get_weather",
						description: "Get weather",
						parameters: { type: "object" },
					},
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.tools).toHaveLength(1);
		expect(ir.tools![0].name).toBe("get_weather");
	});

	it("should decode tool_choice - auto", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			tool_choice: "auto",
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.toolChoice).toBe("auto");
	});

	it("should decode tool_choice - required", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			tool_choice: "required",
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.toolChoice).toBe("required");
	});

	it("should decode tool_choice - any (maps to required)", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			tool_choice: "any",
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.toolChoice).toBe("required");
	});

	it("should decode tool_choice - none", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			tool_choice: "none",
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.toolChoice).toBe("none");
	});

	it("should decode tool_choice - specific function", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			tool_choice: { name: "get_weather" },
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.toolChoice).toEqual({ name: "get_weather" });
	});

	it("should decode tool_choice - function object form", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			tool_choice: {
				type: "function",
				function: {
					name: "get_weather",
				},
			},
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);
		expect(ir.toolChoice).toEqual({ name: "get_weather" });
	});

	it("should stringify non-string function_call_output payloads", () => {
		const request = {
			model: "gpt-4",
			input: [
				{
					type: "function_call_output",
					call_id: "call_abc123",
					output: { weather: "sunny", c: 22 },
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);
		expect(ir.messages[0].role).toBe("tool");
		if (ir.messages[0].role === "tool") {
			expect(ir.messages[0].toolResults[0]).toEqual({
				toolCallId: "call_abc123",
				content: JSON.stringify({ weather: "sunny", c: 22 }),
			});
		}
	});

	it("should decode reasoning configuration", () => {
		const request = {
			model: "gpt-4",
			input: "Solve this problem",
			reasoning: {
				effort: "high",
				summary: "detailed",
			},
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.reasoning).toEqual({
			effort: "high",
			summary: "detailed",
		});
	});

	it("should use default reasoning effort if not specified", () => {
		const request = {
			model: "gpt-4",
			input: "Test",
			reasoning: {},
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.reasoning?.effort).toBe("medium");
	});

	it("should decode generation parameters", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			max_output_tokens: 500,
			temperature: 0.8,
			top_p: 0.95,
			stream: true,
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.maxTokens).toBe(500);
		expect(ir.temperature).toBe(0.8);
		expect(ir.topP).toBe(0.95);
		expect(ir.stream).toBe(true);
	});

	it("should map speed fast to priority service tier", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			speed: "fast",
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);
		expect(ir.speed).toBe("fast");
		expect(ir.serviceTier).toBe("priority");
	});

	it("should preserve explicit service_tier from OpenAI Responses request", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			service_tier: "priority",
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);
		expect(ir.serviceTier).toBe("priority");
		expect(ir.speed).toBeUndefined();
	});

	it("should handle developer role as system", () => {
		const request = {
			model: "gpt-4",
			input: [
				{
					type: "message",
					role: "developer",
					content: "System instructions",
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.messages[0].role).toBe("system");
	});

	it("should handle empty input array", () => {
		const request = {
			model: "gpt-4",
			input: [],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.messages).toHaveLength(0);
	});

	it("should handle mixed input items", () => {
		const request = {
			model: "gpt-4",
			input: [
				{ type: "message", role: "user", content: "Question" },
				{
					type: "function_call",
					call_id: "call_1",
					name: "tool",
					arguments: "{}",
				},
				{
					type: "function_call_output",
					call_id: "call_1",
					output: "Result",
				},
				{ type: "message", role: "user", content: "Follow up" },
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.messages).toHaveLength(4);
		expect(ir.messages[0].role).toBe("user");
		expect(ir.messages[1].role).toBe("assistant");
		expect(ir.messages[2].role).toBe("tool");
		expect(ir.messages[3].role).toBe("user");
	});

	it("should handle input_audio in message content", () => {
		const request = {
			model: "gpt-4",
			input: [
				{
					type: "message",
					role: "user",
					content: [
						{
							type: "input_audio",
							input_audio: {
								data: "base64data",
								format: "wav",
							},
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.messages[0].content[0]).toEqual({
			type: "audio",
			source: "data",
			data: "base64data",
			format: "wav",
		});
	});

	it("should preserve metadata", () => {
		const request = {
			model: "gpt-4",
			input: "Hello",
			metadata: { custom: "value" },
		};

		const ir: IRChatRequest = decodeOpenAIResponsesRequest(request as any);

		expect(ir.metadata).toEqual({ custom: "value" });
	});
});

