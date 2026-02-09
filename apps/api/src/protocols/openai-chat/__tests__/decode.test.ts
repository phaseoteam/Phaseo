// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// OpenAI Chat Completions - Decoder Tests
import { describe, it, expect } from "vitest";
import { decodeOpenAIChatRequest } from "../decode";
import type { IRChatRequest } from "@core/ir";

describe("decodeOpenAIChatRequest", () => {
	it("should decode simple text message", () => {
		const request = {
			model: "gpt-4",
			messages: [
				{ role: "user", content: "Hello, world!" },
			],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.model).toBe("gpt-4");
		expect(ir.messages).toHaveLength(1);
		expect(ir.messages[0].role).toBe("user");
		expect(ir.messages[0].content).toEqual([
			{ type: "text", text: "Hello, world!" },
		]);
		expect(ir.stream).toBe(false);
	});

	it("should decode system message", () => {
		const request = {
			model: "gpt-4",
			messages: [
				{ role: "system", content: "You are a helpful assistant." },
				{ role: "user", content: "Hi" },
			],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.messages).toHaveLength(2);
		expect(ir.messages[0].role).toBe("system");
		expect(ir.messages[0].content).toEqual([
			{ type: "text", text: "You are a helpful assistant." },
		]);
	});

	it("should decode multi-modal content (text + image)", () => {
		const request = {
			model: "gpt-4-vision-preview",
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "What's in this image?" },
						{
							type: "image_url",
							image_url: {
								url: "https://example.com/image.jpg",
								detail: "high",
							},
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.messages[0].content).toHaveLength(2);
		expect(ir.messages[0].content[0]).toEqual({
			type: "text",
			text: "What's in this image?",
		});
		expect(ir.messages[0].content[1]).toEqual({
			type: "image",
			source: "url",
			data: "https://example.com/image.jpg",
			detail: "high",
		});
	});

	it("should decode base64 image", () => {
		const request = {
			model: "gpt-4-vision-preview",
			messages: [
				{
					role: "user",
					content: [
						{
							type: "image_url",
							image_url: {
								url: "data:image/png;base64,iVBORw0KGgo=",
							},
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.messages[0].content[0]).toMatchObject({
			type: "image",
			source: "data",
			data: "iVBORw0KGgo=",
		});
	});

	it("should decode audio content", () => {
		const request = {
			model: "gpt-4-audio-preview",
			messages: [
				{
					role: "user",
					content: [
						{
							type: "input_audio",
							input_audio: {
								data: "base64audiodata",
								format: "wav",
							},
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.messages[0].content[0]).toEqual({
			type: "audio",
			source: "data",
			data: "base64audiodata",
			format: "wav",
		});
	});

	it("should decode video content", () => {
		const request = {
			model: "gpt-4.1",
			messages: [
				{
					role: "user",
					content: [
						{
							type: "input_video",
							video_url: "https://example.com/video.mp4",
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.messages[0].content[0]).toEqual({
			type: "video",
			source: "url",
			url: "https://example.com/video.mp4",
		});
	});

	it("should decode tool definitions", () => {
		const request = {
			model: "gpt-4",
			messages: [{ role: "user", content: "What's the weather?" }],
			tools: [
				{
					type: "function",
					function: {
						name: "get_weather",
						description: "Get the current weather",
						parameters: {
							type: "object",
							properties: {
								location: { type: "string" },
							},
							required: ["location"],
						},
					},
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.tools).toHaveLength(1);
		expect(ir.tools![0]).toEqual({
			name: "get_weather",
			description: "Get the current weather",
			parameters: {
				type: "object",
				properties: {
					location: { type: "string" },
				},
				required: ["location"],
			},
		});
	});

	it("should decode tool choice - auto", () => {
		const request = {
			model: "gpt-4",
			messages: [{ role: "user", content: "Hello" }],
			tools: [{ type: "function", function: { name: "test" } }],
			tool_choice: "auto",
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.toolChoice).toBe("auto");
	});

	it("should decode tool choice - required", () => {
		const request = {
			model: "gpt-4",
			messages: [{ role: "user", content: "Hello" }],
			tools: [{ type: "function", function: { name: "test" } }],
			tool_choice: "required",
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.toolChoice).toBe("required");
	});

	it("should decode tool choice - specific function", () => {
		const request = {
			model: "gpt-4",
			messages: [{ role: "user", content: "Hello" }],
			tools: [{ type: "function", function: { name: "get_weather" } }],
			tool_choice: {
				type: "function",
				function: { name: "get_weather" },
			},
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.toolChoice).toEqual({ name: "get_weather" });
	});

	it("should decode assistant tool calls", () => {
		const request = {
			model: "gpt-4",
			messages: [
				{ role: "user", content: "What's the weather in Paris?" },
				{
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "call_abc123",
							type: "function",
							function: {
								name: "get_weather",
								arguments: '{"location": "Paris"}',
							},
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.messages).toHaveLength(2);
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

	it("should decode tool results", () => {
		const request = {
			model: "gpt-4",
			messages: [
				{ role: "user", content: "What's the weather?" },
				{
					role: "assistant",
					tool_calls: [
						{
							id: "call_abc123",
							type: "function",
							function: { name: "get_weather", arguments: "{}" },
						},
					],
				},
				{
					role: "tool",
					tool_call_id: "call_abc123",
					content: "Sunny, 72°F",
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.messages).toHaveLength(3);
		expect(ir.messages[2].role).toBe("tool");
		if (ir.messages[2].role === "tool") {
			expect(ir.messages[2].toolResults).toHaveLength(1);
			expect(ir.messages[2].toolResults[0]).toEqual({
				toolCallId: "call_abc123",
				content: "Sunny, 72°F",
			});
		}
	});

	it("should decode generation parameters", () => {
		const request = {
			model: "gpt-4",
			messages: [{ role: "user", content: "Hello" }],
			max_tokens: 500,
			temperature: 0.7,
			top_p: 0.9,
			frequency_penalty: 0.5,
			presence_penalty: 0.3,
			stop: ["END"],
			stream: true,
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.maxTokens).toBe(500);
		expect(ir.temperature).toBe(0.7);
		expect(ir.topP).toBe(0.9);
		expect(ir.frequencyPenalty).toBe(0.5);
		expect(ir.presencePenalty).toBe(0.3);
		expect(ir.stop).toEqual(["END"]);
		expect(ir.stream).toBe(true);
	});

	it("should map speed fast to priority service tier", () => {
		const request = {
			model: "gpt-4",
			messages: [{ role: "user", content: "Hello" }],
			speed: "fast",
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.speed).toBe("fast");
		expect(ir.serviceTier).toBe("priority");
	});

	it("should preserve explicit service_tier from OpenAI request", () => {
		const request = {
			model: "gpt-4",
			messages: [{ role: "user", content: "Hello" }],
			service_tier: "priority",
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.serviceTier).toBe("priority");
		expect(ir.speed).toBeUndefined();
	});

	it("should decode user metadata", () => {
		const request = {
			model: "gpt-4",
			messages: [{ role: "user", content: "Hello" }],
			user: "user-123",
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.metadata?.user).toBe("user-123");
	});

	it("should handle developer role as system", () => {
		const request = {
			model: "gpt-4",
			messages: [
				{ role: "developer", content: "System instructions" },
				{ role: "user", content: "Hello" },
			],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.messages[0].role).toBe("system");
		expect(ir.messages[0].content).toEqual([
			{ type: "text", text: "System instructions" },
		]);
	});

	it("should handle multiple tool calls in single message", () => {
		const request = {
			model: "gpt-4",
			messages: [
				{ role: "user", content: "Get weather for Paris and London" },
				{
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "call_1",
							type: "function",
							function: {
								name: "get_weather",
								arguments: '{"location": "Paris"}',
							},
						},
						{
							id: "call_2",
							type: "function",
							function: {
								name: "get_weather",
								arguments: '{"location": "London"}',
							},
						},
					],
				},
			],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.messages[1].role).toBe("assistant");
		if (ir.messages[1].role === "assistant") {
			expect(ir.messages[1].toolCalls).toHaveLength(2);
			expect(ir.messages[1].toolCalls![0].id).toBe("call_1");
			expect(ir.messages[1].toolCalls![1].id).toBe("call_2");
		}
	});

	it("should default stream to false when not specified", () => {
		const request = {
			model: "gpt-4",
			messages: [{ role: "user", content: "Hello" }],
		};

		const ir: IRChatRequest = decodeOpenAIChatRequest(request as any);

		expect(ir.stream).toBe(false);
	});
});

