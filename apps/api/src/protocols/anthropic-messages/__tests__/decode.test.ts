// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// Anthropic Messages API - Decoder Tests
import { describe, it, expect } from "vitest";
import { decodeAnthropicMessagesRequest } from "../decode";
import type { IRChatRequest } from "@core/ir";

describe("decodeAnthropicMessagesRequest", () => {
	it("should decode simple text message", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [
				{
					role: "user",
					content: "Hello, Claude!",
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.model).toBe("claude-3-5-sonnet-20241022");
		expect(ir.maxTokens).toBe(1024);
		expect(ir.messages).toHaveLength(1);
		expect(ir.messages[0].role).toBe("user");
		expect(ir.messages[0].content).toEqual([
			{ type: "text", text: "Hello, Claude!" },
		]);
		expect(ir.stream).toBe(false);
	});

	it("should decode system parameter as system message", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			system: "You are a helpful assistant.",
			messages: [
				{
					role: "user",
					content: "Hi",
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.messages).toHaveLength(2);
		expect(ir.messages[0].role).toBe("system");
		expect(ir.messages[0].content).toEqual([
			{ type: "text", text: "You are a helpful assistant." },
		]);
		expect(ir.messages[1].role).toBe("user");
	});

	it("should decode system as array of content blocks", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			system: [
				{ type: "text", text: "You are helpful." },
				{ type: "text", text: "Be concise." },
			],
			messages: [{ role: "user", content: "Hi" }],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.messages[0].role).toBe("system");
		expect(ir.messages[0].content).toHaveLength(2);
		expect(ir.messages[0].content[0]).toEqual({
			type: "text",
			text: "You are helpful.",
		});
		expect(ir.messages[0].content[1]).toEqual({
			type: "text",
			text: "Be concise.",
		});
	});

	it("should decode multi-modal content (text + image)", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "What's in this image?" },
						{
							type: "image",
							source: {
								type: "url",
								url: "https://example.com/image.jpg",
							},
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.messages[0].content).toHaveLength(2);
		expect(ir.messages[0].content[0]).toEqual({
			type: "text",
			text: "What's in this image?",
		});
		expect(ir.messages[0].content[1]).toEqual({
			type: "image",
			source: "url",
			data: "https://example.com/image.jpg",
		});
	});

	it("should decode base64 image", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/png",
								data: "iVBORw0KGgo=",
							},
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.messages[0].content[0]).toEqual({
			type: "image",
			source: "data",
			data: "iVBORw0KGgo=",
			mimeType: "image/png",
		});
	});

	it("should decode tool definitions", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [{ role: "user", content: "What's the weather?" }],
			tools: [
				{
					name: "get_weather",
					description: "Get current weather",
					input_schema: {
						type: "object",
						properties: {
							location: { type: "string" },
						},
						required: ["location"],
					},
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.tools).toHaveLength(1);
		expect(ir.tools![0]).toEqual({
			name: "get_weather",
			description: "Get current weather",
			parameters: {
				type: "object",
				properties: {
					location: { type: "string" },
				},
				required: ["location"],
			},
		});
	});

	it("should decode tool_choice - auto", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [{ role: "user", content: "Test" }],
			tools: [{ name: "test", input_schema: {} }],
			tool_choice: { type: "auto" },
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.toolChoice).toBe("auto");
	});

	it("should decode tool_choice - any (maps to required)", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [{ role: "user", content: "Test" }],
			tools: [{ name: "test", input_schema: {} }],
			tool_choice: { type: "any" },
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.toolChoice).toBe("required");
	});

	it("should decode tool_choice - specific tool", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [{ role: "user", content: "Test" }],
			tools: [{ name: "get_weather", input_schema: {} }],
			tool_choice: { type: "tool", name: "get_weather" },
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.toolChoice).toEqual({ name: "get_weather" });
	});

	it("should extract tool_use blocks from assistant message", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [
				{ role: "user", content: "What's the weather in Paris?" },
				{
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_abc123",
							name: "get_weather",
							input: { location: "Paris" },
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.messages).toHaveLength(2);
		expect(ir.messages[1].role).toBe("assistant");

		if (ir.messages[1].role === "assistant") {
			expect(ir.messages[1].toolCalls).toHaveLength(1);
			expect(ir.messages[1].toolCalls![0]).toEqual({
				id: "toolu_abc123",
				name: "get_weather",
				arguments: '{"location":"Paris"}',
			});
		}
	});

	it("should extract multiple tool_use blocks", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [
				{ role: "user", content: "Get weather for Paris and London" },
				{
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_1",
							name: "get_weather",
							input: { location: "Paris" },
						},
						{
							type: "tool_use",
							id: "toolu_2",
							name: "get_weather",
							input: { location: "London" },
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		if (ir.messages[1].role === "assistant") {
			expect(ir.messages[1].toolCalls).toHaveLength(2);
			expect(ir.messages[1].toolCalls![0].id).toBe("toolu_1");
			expect(ir.messages[1].toolCalls![1].id).toBe("toolu_2");
		}
	});

	it("should extract tool_result blocks as tool messages", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [
				{ role: "user", content: "What's the weather?" },
				{
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_abc123",
							name: "get_weather",
							input: {},
						},
					],
				},
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_abc123",
							content: "Sunny, 72°F",
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.messages).toHaveLength(3);
		expect(ir.messages[2].role).toBe("tool");

		if (ir.messages[2].role === "tool") {
			expect(ir.messages[2].toolResults).toHaveLength(1);
			expect(ir.messages[2].toolResults[0]).toEqual({
				toolCallId: "toolu_abc123",
				content: "Sunny, 72°F",
			});
		}
	});

	it("should handle tool_result with structured content", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_123",
							content: [
								{ type: "text", text: "Result: " },
								{ type: "text", text: "Success" },
							],
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		if (ir.messages[0].role === "tool") {
			expect(ir.messages[0].toolResults[0].content).toBe("Result: Success");
		}
	});

	it("should handle mixed text and tool_use in assistant message", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Let me check that." },
						{
							type: "tool_use",
							id: "toolu_1",
							name: "search",
							input: {},
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		if (ir.messages[0].role === "assistant") {
			expect(ir.messages[0].content).toHaveLength(1);
			expect(ir.messages[0].content[0]).toEqual({
				type: "text",
				text: "Let me check that.",
			});
			expect(ir.messages[0].toolCalls).toHaveLength(1);
		}
	});

	it("should decode generation parameters", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 2048,
			temperature: 0.7,
			top_p: 0.9,
			top_k: 40,
			stop_sequences: ["END"],
			stream: true,
			messages: [{ role: "user", content: "Hello" }],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.maxTokens).toBe(2048);
		expect(ir.temperature).toBe(0.7);
		expect(ir.topP).toBe(0.9);
		expect(ir.topK).toBe(40);
		expect(ir.stop).toEqual(["END"]);
		expect(ir.stream).toBe(true);
	});

	it("should map speed fast to priority service tier", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 2048,
			speed: "fast",
			messages: [{ role: "user", content: "Hello" }],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);
		expect(ir.speed).toBe("fast");
		expect(ir.serviceTier).toBe("priority");
	});

	it("should decode output_config.effort=max into IR reasoning effort xhigh", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 2048,
			output_config: {
				effort: "max",
			},
			messages: [{ role: "user", content: "Hello" }],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);
		expect(ir.reasoning?.effort).toBe("xhigh");
	});

	it("should decode reasoning.effort=xhigh on Anthropic messages surface", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 2048,
			reasoning: {
				effort: "xhigh",
			},
			messages: [{ role: "user", content: "Hello" }],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);
		expect(ir.reasoning?.effort).toBe("xhigh");
	});

	it("should decode thinking.effort values and preserve thinking budget", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 2048,
			thinking: {
				type: "enabled",
				budget_tokens: 512,
				effort: "high",
			},
			messages: [{ role: "user", content: "Hello" }],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);
		expect(ir.reasoning?.effort).toBe("high");
		expect(ir.reasoning?.enabled).toBe(true);
		expect(ir.reasoning?.maxTokens).toBe(512);
	});

	it("should preserve service_tier on decode", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 2048,
			service_tier: "standard_only",
			messages: [{ role: "user", content: "Hello" }],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);
		expect(ir.serviceTier).toBe("standard_only");
	});

	it("should handle metadata field", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [{ role: "user", content: "Test" }],
			metadata: {
				user_id: "user-123",
			},
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.metadata).toEqual({ user_id: "user-123" });
	});

	it("should default stream to false", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [{ role: "user", content: "Test" }],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.stream).toBe(false);
	});

	it("should handle thinking blocks (extended thinking)", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [
				{
					role: "assistant",
					content: [
						{
							type: "thinking",
							thinking: "Let me analyze this problem...",
						},
						{ type: "text", text: "The answer is 42." },
					],
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		if (ir.messages[0].role === "assistant") {
			// Thinking blocks are preserved in content
			expect(ir.messages[0].content).toHaveLength(2);
			expect(ir.messages[0].content[0].type).toBe("text");
			expect(ir.messages[0].content[1].type).toBe("text");
		}
	});

	it("should handle empty content array", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [
				{
					role: "user",
					content: [],
				},
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.messages[0].content).toEqual([]);
	});

	it("should handle multiple messages with different roles", () => {
		const request = {
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 1024,
			messages: [
				{ role: "user", content: "First question" },
				{ role: "assistant", content: "First answer" },
				{ role: "user", content: "Follow up" },
				{ role: "assistant", content: "Second answer" },
			],
		};

		const ir: IRChatRequest = decodeAnthropicMessagesRequest(request as any);

		expect(ir.messages).toHaveLength(4);
		expect(ir.messages.map((m) => m.role)).toEqual([
			"user",
			"assistant",
			"user",
			"assistant",
		]);
	});
});

