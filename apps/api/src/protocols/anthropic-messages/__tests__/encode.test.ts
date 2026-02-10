// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// Anthropic Messages API - Encoder Tests
// Tests the CRITICAL FIX for tool_use block extraction bug
import { describe, it, expect } from "vitest";
import { encodeAnthropicMessagesResponse } from "../encode";
import type { IRChatResponse } from "@core/ir";

describe("encodeAnthropicMessagesResponse", () => {
	it("should encode simple text response", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [{ type: "text", text: "Hello! How can I help you today?" }],
					},
					finishReason: "stop",
				},
			],
			usage: {
				promptTokens: 10,
				completionTokens: 9,
				totalTokens: 19,
			},
		};

		const response = encodeAnthropicMessagesResponse(ir);

        expect(response.id).toBe("req-123");
        expect(response.nativeResponseId).toBe("msg_abc123");
		expect(response.type).toBe("message");
		expect(response.role).toBe("assistant");
		expect(response.model).toBe("claude-3-5-sonnet-20241022");
		expect(response.content).toHaveLength(1);
		expect(response.content[0]).toEqual({
			type: "text",
			text: "Hello! How can I help you today?",
			citations: null,
		});
		expect(response.stop_reason).toBe("end_turn");
		expect(response.usage).toEqual({
			cache_creation: null,
			cache_creation_input_tokens: null,
			cache_read_input_tokens: null,
			input_tokens: 10,
			output_tokens: 9,
			server_tool_use: null,
			service_tier: null,
		});
	});

	it("should encode tool_use blocks (CRITICAL BUG FIX TEST)", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						toolCalls: [
							{
								id: "toolu_abc123",
								name: "get_weather",
								arguments: '{"location":"Paris"}',
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		// CRITICAL: Must include tool_use block in content
		expect(response.content).toHaveLength(1);
		expect(response.content[0].type).toBe("tool_use");

		const toolUse = response.content[0];
		if (toolUse.type === "tool_use") {
			expect(toolUse.id).toBe("toolu_abc123");
			expect(toolUse.name).toBe("get_weather");
			expect(toolUse.input).toEqual({ location: "Paris" });
		}

		expect(response.stop_reason).toBe("tool_use");
	});

	it("should encode multiple tool_use blocks", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						toolCalls: [
							{
								id: "toolu_1",
								name: "get_weather",
								arguments: '{"location":"Paris"}',
							},
							{
								id: "toolu_2",
								name: "get_weather",
								arguments: '{"location":"London"}',
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		expect(response.content).toHaveLength(2);
		expect(response.content[0].type).toBe("tool_use");
		expect(response.content[1].type).toBe("tool_use");

		if (
			response.content[0].type === "tool_use" &&
			response.content[1].type === "tool_use"
		) {
			expect(response.content[0].id).toBe("toolu_1");
			expect(response.content[1].id).toBe("toolu_2");
		}
	});

	it("should encode text content AND tool_use blocks together", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [{ type: "text", text: "Let me check that for you." }],
						toolCalls: [
							{
								id: "toolu_1",
								name: "search",
								arguments: "{}",
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		expect(response.content).toHaveLength(2);
		expect(response.content[0]).toEqual({
			type: "text",
			text: "Let me check that for you.",
			citations: null,
		});
		expect(response.content[1].type).toBe("tool_use");
	});

	it("should map finish reasons correctly", () => {
		const testCases: Array<{
			irReason: IRChatResponse["choices"][0]["finishReason"];
			expected: string;
		}> = [
			{ irReason: "stop", expected: "end_turn" },
			{ irReason: "length", expected: "max_tokens" },
			{ irReason: "tool_calls", expected: "tool_use" },
			{ irReason: "content_filter", expected: "refusal" },
		];

		for (const { irReason, expected } of testCases) {
			const ir: IRChatResponse = {
				id: "req-123",
				nativeId: "msg_abc123",
				model: "claude-3-5-sonnet-20241022",
				choices: [
					{
						index: 0,
						message: { role: "assistant", content: [{ type: "text", text: "Test" }] },
						finishReason: irReason,
					},
				],
			};

			const response = encodeAnthropicMessagesResponse(ir);
			expect(response.stop_reason).toBe(expected);
		}
	});

	it("should handle missing usage", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: [{ type: "text", text: "Test" }] },
					finishReason: "stop",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		expect(response.usage).toEqual({
			cache_creation: null,
			cache_creation_input_tokens: null,
			cache_read_input_tokens: null,
			input_tokens: 0,
			output_tokens: 0,
			server_tool_use: null,
			service_tier: null,
		});
	});

	it("should use fallback ID when nativeId is missing", () => {
		const ir: IRChatResponse = {
			id: "req-456",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: [{ type: "text", text: "Test" }] },
					finishReason: "stop",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

        expect(response.id).toBe("req-456");
        expect(response.nativeResponseId).toBeUndefined();
	});

	it("should handle empty content", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: [{ type: "text", text: "" }] },
					finishReason: "stop",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		expect(response.content).toHaveLength(1);
		expect(response.content[0]).toEqual({ type: "text", text: "", citations: null });
	});

	it("should handle null content with tool calls", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						toolCalls: [
							{
								id: "toolu_1",
								name: "test",
								arguments: "{}",
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		// Should only have tool_use, no text
		expect(response.content).toHaveLength(1);
		expect(response.content[0].type).toBe("tool_use");
	});

	it("should encode reasoning as thinking blocks", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [
							{ type: "reasoning_text", text: "Thinking..." },
							{ type: "text", text: "Final answer" },
						],
					},
					finishReason: "stop",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		expect(response.content).toHaveLength(2);
		expect(response.content[0]).toEqual({
			type: "text",
			text: "Final answer",
			citations: null,
		});
		expect(response.content[1]).toEqual({
			type: "thinking",
			thinking: "Thinking...",
			signature: "",
		});
	});

	it("should handle reasoning-only content", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: [{ type: "reasoning_text", text: "Thinking..." }] },
					finishReason: "stop",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		expect(response.content).toHaveLength(1);
		expect(response.content[0]).toEqual({
			type: "thinking",
			thinking: "Thinking...",
			signature: "",
		});
	});

	it("should handle tool calls with invalid JSON in arguments", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						toolCalls: [
							{
								id: "toolu_1",
								name: "test",
								arguments: "not valid json",
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		// Should gracefully handle invalid JSON
		expect(response.content).toHaveLength(1);
		expect(response.content[0].type).toBe("tool_use");
		if (response.content[0].type === "tool_use") {
			// Falls back to empty object on parse error
			expect(response.content[0].input).toEqual({});
		}
	});

	it("should handle refusal content", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						refusal: "I cannot help with that request.",
					},
					finishReason: "stop",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		// Refusal is treated as regular text content in Anthropic
		expect(response.content).toHaveLength(1);
		expect(response.content[0]).toEqual({
			type: "text",
			text: "I cannot help with that request.",
			citations: null,
		});
	});

	it("should validate tool_use id is preserved exactly", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						toolCalls: [
							{
								id: "toolu_01ABC123xyz",
								name: "test_function",
								arguments: '{"key":"value"}',
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		if (response.content[0].type === "tool_use") {
			// ID must be exactly preserved for tool result correlation
			expect(response.content[0].id).toBe("toolu_01ABC123xyz");
		}
	});

	it("should handle complex nested tool arguments", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "claude-3-5-sonnet-20241022",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						toolCalls: [
							{
								id: "toolu_1",
								name: "complex_tool",
								arguments: JSON.stringify({
									nested: {
										array: [1, 2, 3],
										object: { key: "value" },
									},
									boolean: true,
									number: 42,
								}),
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);

		if (response.content[0].type === "tool_use") {
			expect(response.content[0].input).toEqual({
				nested: {
					array: [1, 2, 3],
					object: { key: "value" },
				},
				boolean: true,
				number: 42,
			});
		}
	});

	it("should encode image parts as Anthropic image content blocks", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "msg_abc123",
			model: "google/gemini-3-pro-image-preview",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [
							{ type: "text", text: "Here are images." },
							{
								type: "image",
								source: "data",
								data: "ZmFrZS1pbWFnZS1kYXRh",
								mimeType: "image/png",
							},
							{
								type: "image",
								source: "url",
								data: "https://example.com/generated.png",
								mimeType: "image/png",
							},
						],
					},
					finishReason: "stop",
				},
			],
		};

		const response = encodeAnthropicMessagesResponse(ir);
		const imageBlocks = response.content.filter((block) => block.type === "image");

		expect(imageBlocks).toHaveLength(2);
		expect(imageBlocks[0]).toEqual({
			type: "image",
			source: {
				type: "base64",
				media_type: "image/png",
				data: "ZmFrZS1pbWFnZS1kYXRh",
			},
		});
		expect(imageBlocks[1]).toEqual({
			type: "image",
			source: {
				type: "url",
				media_type: "image/png",
				url: "https://example.com/generated.png",
			},
		});
	});
});

