// Round-trip transformation tests
// Verifies that Protocol → IR → Protocol preserves all data

import { describe, it, expect } from "vitest";
import { decodeOpenAIChatRequest } from "@/protocols/openai-chat/decode";
import { encodeOpenAIChatResponse } from "@/protocols/openai-chat/encode";
import type { ChatCompletionsRequest } from "@core/schemas";
import type { IRChatResponse } from "@core/ir";

describe("Round-trip Transformations", () => {
	describe("OpenAI Chat: Basic Message", () => {
		it("should preserve simple text message through round-trip", () => {
			const originalRequest: ChatCompletionsRequest = {
				model: "gpt-4",
				messages: [
					{ role: "system", content: "You are a helpful assistant." },
					{ role: "user", content: "Hello!" },
				],
			};

			// Decode to IR
			const ir = decodeOpenAIChatRequest(originalRequest);

			// Verify IR structure
			expect(ir.messages).toHaveLength(2);
			expect(ir.messages[0].role).toBe("system");
			expect(ir.messages[1].role).toBe("user");

			// Verify content is preserved
			const systemContent = ir.messages[0].content[0];
			const userContent = ir.messages[1].content[0];
			expect(systemContent.type).toBe("text");
			expect((systemContent as any).text).toBe("You are a helpful assistant.");
			expect(userContent.type).toBe("text");
			expect((userContent as any).text).toBe("Hello!");
		});

		it("should preserve generation parameters", () => {
			const originalRequest: ChatCompletionsRequest = {
				model: "gpt-4",
				messages: [{ role: "user", content: "Test" }],
				temperature: 0.7,
				max_tokens: 100,
				top_p: 0.9,
				seed: 12345,
				stream: false,
			};

			const ir = decodeOpenAIChatRequest(originalRequest);

			expect(ir.temperature).toBe(0.7);
			expect(ir.maxTokens).toBe(100);
			expect(ir.topP).toBe(0.9);
			expect(ir.seed).toBe(12345);
			expect(ir.stream).toBe(false);
		});
	});

	describe("Tool Calling", () => {
		it("should preserve tool definitions through IR", () => {
			const originalRequest: ChatCompletionsRequest = {
				model: "gpt-4",
				messages: [{ role: "user", content: "What's the weather?" }],
				tools: [
					{
						type: "function",
						function: {
							name: "get_weather",
							description: "Get weather for a location",
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
				tool_choice: "auto",
			};

			const ir = decodeOpenAIChatRequest(originalRequest);

			expect(ir.tools).toHaveLength(1);
			expect(ir.tools![0].name).toBe("get_weather");
			expect(ir.tools![0].description).toBe("Get weather for a location");
			expect(ir.tools![0].parameters).toEqual({
				type: "object",
				properties: {
					location: { type: "string" },
				},
				required: ["location"],
			});
			expect(ir.toolChoice).toBe("auto");
		});

		it("should preserve assistant tool calls in messages", () => {
			const originalRequest: ChatCompletionsRequest = {
				model: "gpt-4",
				messages: [
					{ role: "user", content: "What's the weather?" },
					{
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "call_abc123",
								type: "function",
								function: {
									name: "get_weather",
									arguments: '{"location":"San Francisco"}',
								},
							},
						],
					},
				],
			};

			const ir = decodeOpenAIChatRequest(originalRequest);

			const assistantMsg = ir.messages[1];
			expect(assistantMsg.role).toBe("assistant");
			expect(assistantMsg.toolCalls).toHaveLength(1);
			expect(assistantMsg.toolCalls![0].id).toBe("call_abc123");
			expect(assistantMsg.toolCalls![0].name).toBe("get_weather");
			expect(assistantMsg.toolCalls![0].arguments).toBe('{"location":"San Francisco"}');
		});

		it("should preserve tool results in messages", () => {
			const originalRequest: ChatCompletionsRequest = {
				model: "gpt-4",
				messages: [
					{
						role: "tool",
						tool_call_id: "call_abc123",
						content: '{"temperature":72,"condition":"sunny"}',
					},
				],
			};

			const ir = decodeOpenAIChatRequest(originalRequest);

			const toolMsg = ir.messages[0];
			expect(toolMsg.role).toBe("tool");
			expect(toolMsg.toolResults).toHaveLength(1);
			expect(toolMsg.toolResults[0].toolCallId).toBe("call_abc123");
			expect(toolMsg.toolResults[0].content).toBe('{"temperature":72,"condition":"sunny"}');
		});
	});

	describe("Multimodal Content", () => {
		it("should preserve image URL content", () => {
			const originalRequest: ChatCompletionsRequest = {
				model: "gpt-4-vision",
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

			const ir = decodeOpenAIChatRequest(originalRequest);

			const userMsg = ir.messages[0];
			expect(userMsg.content).toHaveLength(2);

			const textPart = userMsg.content[0];
			expect(textPart.type).toBe("text");
			expect((textPart as any).text).toBe("What's in this image?");

			const imagePart = userMsg.content[1];
			expect(imagePart.type).toBe("image");
			expect((imagePart as any).source).toBe("url");
			expect((imagePart as any).data).toBe("https://example.com/image.jpg");
			expect((imagePart as any).detail).toBe("high");
		});

		it("should preserve base64 image data", () => {
			const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
			const dataUrl = `data:image/png;base64,${base64Data}`;

			const originalRequest: ChatCompletionsRequest = {
				model: "gpt-4-vision",
				messages: [
					{
						role: "user",
						content: [
							{
								type: "image_url",
								image_url: { url: dataUrl },
							},
						],
					},
				],
			};

			const ir = decodeOpenAIChatRequest(originalRequest);

			const imagePart = ir.messages[0].content[0];
			expect(imagePart.type).toBe("image");
			expect((imagePart as any).source).toBe("data");
			expect((imagePart as any).data).toBe(base64Data);
		});

		it("should preserve audio content", () => {
			const originalRequest: ChatCompletionsRequest = {
				model: "gpt-4-audio",
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

			const ir = decodeOpenAIChatRequest(originalRequest);

			const audioPart = ir.messages[0].content[0];
			expect(audioPart.type).toBe("audio");
			expect((audioPart as any).source).toBe("data");
			expect((audioPart as any).data).toBe("base64audiodata");
			expect((audioPart as any).format).toBe("wav");
		});
	});

	describe("Response Round-trip", () => {
		it("should preserve basic response structure", () => {
			const mockIR: IRChatResponse = {
				id: "req_test123",
				nativeId: "chatcmpl_provider456",
				created: 1234567890,
				model: "gpt-4",
				provider: "openai",
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
					inputTokens: 10,
					outputTokens: 8,
					totalTokens: 18,
				},
			};

			const encoded = encodeOpenAIChatResponse(mockIR, "req_test123");

			expect(encoded.id).toBe("req_test123");
			expect(encoded.model).toBe("gpt-4");
			expect(encoded.choices).toHaveLength(1);
			expect(encoded.choices[0].message.content).toBe("Hello! How can I help you today?");
			expect(encoded.choices[0].finish_reason).toBe("stop");
			expect(encoded.usage?.prompt_tokens).toBe(10);
			expect(encoded.usage?.completion_tokens).toBe(8);
			expect(encoded.usage?.total_tokens).toBe(18);
		});

		it("should preserve tool calls in response", () => {
			const mockIR: IRChatResponse = {
				id: "req_test123",
				created: 1234567890,
				model: "gpt-4",
				provider: "openai",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: [],
							toolCalls: [
								{
									id: "call_xyz789",
									name: "get_weather",
									arguments: '{"location":"NYC"}',
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
			};

			const encoded = encodeOpenAIChatResponse(mockIR, "req_test123");

			expect(encoded.choices[0].message.tool_calls).toHaveLength(1);
			expect(encoded.choices[0].message.tool_calls![0].id).toBe("call_xyz789");
			expect(encoded.choices[0].message.tool_calls![0].function.name).toBe("get_weather");
			expect(encoded.choices[0].message.tool_calls![0].function.arguments).toBe('{"location":"NYC"}');
			expect(encoded.choices[0].finish_reason).toBe("tool_calls");
		});
	});

	describe("Edge Cases", () => {
		it("should handle developer role as system", () => {
			const originalRequest: ChatCompletionsRequest = {
				model: "gpt-4",
				messages: [{ role: "developer", content: "System instruction" }],
			};

			const ir = decodeOpenAIChatRequest(originalRequest);

			// Developer role should be normalized to system
			expect(ir.messages[0].role).toBe("system");
		});

		it("should handle empty content gracefully", () => {
			const originalRequest: ChatCompletionsRequest = {
				model: "gpt-4",
				messages: [{ role: "user", content: "" }],
			};

			const ir = decodeOpenAIChatRequest(originalRequest);

			expect(ir.messages[0].content).toHaveLength(1);
			expect(ir.messages[0].content[0].type).toBe("text");
			expect((ir.messages[0].content[0] as any).text).toBe("");
		});

		it("should handle null content with tool calls", () => {
			const originalRequest: ChatCompletionsRequest = {
				model: "gpt-4",
				messages: [
					{
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "call_123",
								type: "function",
								function: { name: "test", arguments: "{}" },
							},
						],
					},
				],
			};

			const ir = decodeOpenAIChatRequest(originalRequest);

			expect(ir.messages[0].role).toBe("assistant");
			expect(ir.messages[0].content).toHaveLength(1);
			expect(ir.messages[0].content[0].type).toBe("text");
			expect((ir.messages[0].content[0] as any).text).toBe("");
			expect(ir.messages[0].toolCalls).toHaveLength(1);
		});
	});
});
