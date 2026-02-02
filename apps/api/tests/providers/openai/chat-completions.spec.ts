// OpenAI Provider - Chat Completions Tests
// Tests all Chat Completions scenarios for OpenAI

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
	createTestContext,
	expectUsageTokens,
	expectStreamFrames,
	printTestSummary,
	runProtocol,
	TEST_IMAGE_URL,
	TEST_IMAGE_BASE64,
	TEST_TOOL_OPENAI,
	type ProviderTestConfig,
} from "../helpers/provider-test-suite";

const CONFIG: ProviderTestConfig = {
	providerId: "openai",
	baseModel: "openai/gpt-4o-mini",
	capabilities: {
		chatCompletions: true,
		responsesApi: true,
		anthropicMessages: false,
		streaming: true,
		tools: true,
		reasoning: true,
		vision: true,
		audio: true,
		pdfInput: true,
	},
};

const context = createTestContext();

describe("OpenAI - Chat Completions", () => {
	beforeAll(() => {
		const apiKey = process.env.GATEWAY_API_KEY;
		if (!apiKey) {
			throw new Error("GATEWAY_API_KEY is required for provider tests");
		}
	});

	afterAll(() => {
		printTestSummary(context, "OpenAI Chat Completions");
	});

	describe("Text Input", () => {
		it("should handle basic text request", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "Say hello in exactly 3 words." }],
			});

			expect(response.id).toBeDefined();
			expect(response.object).toBe("chat.completion");
			expect(response.choices).toBeDefined();
			expect(response.choices.length).toBeGreaterThan(0);
			expect(response.choices[0].message).toBeDefined();
			expect(response.choices[0].message.role).toBe("assistant");
			expect(response.choices[0].message.content).toBeDefined();
			expect(typeof response.choices[0].message.content).toBe("string");
			expectUsageTokens(response, context);
		});

		it("should handle system message", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [
					{ role: "system", content: "You are a helpful assistant that speaks like a pirate." },
					{ role: "user", content: "Tell me about the weather." },
				],
			});

			expect(response.choices[0].message.content).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle multi-turn conversation", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [
					{ role: "user", content: "My name is Alice." },
					{ role: "assistant", content: "Nice to meet you, Alice!" },
					{ role: "user", content: "What's my name?" },
				],
			});

			expect(response.choices[0].message.content).toContain("Alice");
			expectUsageTokens(response, context);
		});

		it("should handle temperature parameter", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "Generate a random number between 1 and 100." }],
				temperature: 1.5,
			});

			expect(response.choices[0].message.content).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle max_tokens parameter", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "Write a long story." }],
				max_tokens: 20,
			});

			expect(response.choices[0].finish_reason).toMatch(/length|stop/);
			expectUsageTokens(response, context);
		});
	});

	describe("Vision - Image Input", () => {
		it("should handle image URL", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: "What is in this image? Be brief." },
							{ type: "image_url", image_url: { url: TEST_IMAGE_URL } },
						],
					},
				],
			});

			expect(response.choices[0].message.content).toBeDefined();
			expect(typeof response.choices[0].message.content).toBe("string");
			expect(response.choices[0].message.content.length).toBeGreaterThan(10);
			expectUsageTokens(response, context);
		});

		it("should handle base64 image", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: "What color is this image?" },
							{ type: "image_url", image_url: { url: TEST_IMAGE_BASE64 } },
						],
					},
				],
			});

			expect(response.choices[0].message.content).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle image with detail parameter", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: "Describe this image in detail." },
							{ type: "image_url", image_url: { url: TEST_IMAGE_URL, detail: "high" } },
						],
					},
				],
			});

			expect(response.choices[0].message.content).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle multiple images", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: "Compare these images." },
							{ type: "image_url", image_url: { url: TEST_IMAGE_URL } },
							{ type: "image_url", image_url: { url: TEST_IMAGE_BASE64 } },
						],
					},
				],
			});

			expect(response.choices[0].message.content).toBeDefined();
			expectUsageTokens(response, context);
		});
	});

	describe("Tools (Function Calling)", () => {
		it("should handle tool definition", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
				tools: [TEST_TOOL_OPENAI],
			});

			expect(response.choices[0].message).toBeDefined();
			// May or may not call the tool, but should not error
			expectUsageTokens(response, context);
		});

		it("should handle forced tool call", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "What's the weather in Boston?" }],
				tools: [TEST_TOOL_OPENAI],
				tool_choice: { type: "function", function: { name: "get_weather" } },
			});

			expect(response.choices[0].message.tool_calls).toBeDefined();
			expect(Array.isArray(response.choices[0].message.tool_calls)).toBe(true);
			expect(response.choices[0].message.tool_calls.length).toBeGreaterThan(0);
			expect(response.choices[0].message.tool_calls[0].function.name).toBe("get_weather");
			expect(response.choices[0].finish_reason).toBe("tool_calls");
			expectUsageTokens(response, context);
		});

		it("should handle tool result continuation", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [
					{ role: "user", content: "What's the weather in Seattle?" },
					{
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "call_123",
								type: "function",
								function: { name: "get_weather", arguments: '{"location":"Seattle, WA","unit":"fahrenheit"}' },
							},
						],
					},
					{ role: "tool", tool_call_id: "call_123", content: "72°F, sunny" },
				],
				tools: [TEST_TOOL_OPENAI],
			});

			expect(response.choices[0].message.content).toBeDefined();
			expect(response.choices[0].message.content).toContain("72");
			expectUsageTokens(response, context);
		});

		it("should handle parallel tool calls", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "What's the weather in NYC and LA?" }],
				tools: [TEST_TOOL_OPENAI],
				parallel_tool_calls: true,
			});

			// Should not error with parallel tools enabled
			expect(response.choices[0].message).toBeDefined();
			expectUsageTokens(response, context);
		});
	});

	describe("Reasoning", () => {
		it("should handle reasoning with extended thinking", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: "openai/gpt-5-nano-2025-08-07",
				messages: [{ role: "user", content: "What is 25 * 47? Think step by step." }],
				reasoning: { effort: "high" },
			});

			expect(response.choices[0].message.content).toBeDefined();
			// Check if reasoning was captured (may be in reasoning_content or reasoning_details)
			if (response.choices[0].message.reasoning_content) {
				expect(typeof response.choices[0].message.reasoning_content).toBe("string");
				expect(response.choices[0].message.reasoning_content.length).toBeGreaterThan(0);
			}
			expectUsageTokens(response, context);
		});

		it("should handle reasoning_details format", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: "openai/gpt-5-nano-2025-08-07",
				messages: [{ role: "user", content: "Solve this: If I have 3 apples and buy 2 more, how many do I have?" }],
				reasoning: { effort: "medium" },
			});

			expect(response.choices[0].message.content).toBeDefined();
			// If reasoning_details exists, verify format
			if (response.choices[0].message.reasoning_details) {
				expect(Array.isArray(response.choices[0].message.reasoning_details)).toBe(true);
				const detail = response.choices[0].message.reasoning_details[0];
				expect(detail.type).toMatch(/text|summary|encrypted/);
				if (detail.type === "text" || detail.type === "summary") {
					expect(detail.text).toBeDefined();
				}
			}
			expectUsageTokens(response, context);
		});
	});

	describe("Streaming", () => {
		it("should handle basic streaming", async () => {
			const result: any = await runProtocol(
				CONFIG,
				"/chat/completions",
				{
					model: CONFIG.baseModel,
					messages: [{ role: "user", content: "Count from 1 to 5." }],
				},
				{ stream: true }
			);

			expectStreamFrames(result.frames, context);

			// Verify streaming chunks have proper structure
			const chunks = result.frames.filter((f: any) => f?.choices);
			expect(chunks.length).toBeGreaterThan(0);

			// Check delta structure
			const hasDeltas = chunks.some((chunk: any) => chunk.choices?.[0]?.delta);
			expect(hasDeltas).toBe(true);
		});

		it("should handle streaming with tools", async () => {
			const result: any = await runProtocol(
				CONFIG,
				"/chat/completions",
				{
					model: CONFIG.baseModel,
					messages: [{ role: "user", content: "What's the weather in Miami?" }],
					tools: [TEST_TOOL_OPENAI],
					tool_choice: { type: "function", function: { name: "get_weather" } },
				},
				{ stream: true }
			);

			expectStreamFrames(result.frames, context);

			// Should have tool_calls in deltas
			const chunks = result.frames.filter((f: any) => f?.choices);
			const hasToolCalls = chunks.some((chunk: any) => chunk.choices?.[0]?.delta?.tool_calls);
			expect(hasToolCalls).toBe(true);
		});

		it("should handle streaming with reasoning", async () => {
			const result: any = await runProtocol(
				CONFIG,
				"/chat/completions",
				{
					model: "openai/gpt-5-nano-2025-08-07",
					messages: [{ role: "user", content: "What is 12 + 15?" }],
					reasoning: { effort: "low" },
				},
				{ stream: true }
			);

			expectStreamFrames(result.frames, context);

			// Check if reasoning_content appears in deltas
			const chunks = result.frames.filter((f: any) => f?.choices);
			const hasReasoningDeltas = chunks.some((chunk: any) => chunk.choices?.[0]?.delta?.reasoning_content);
			// Reasoning may or may not appear in deltas depending on model behavior
			expect(chunks.length).toBeGreaterThan(0);
		});

		it("should accumulate usage in final chunk", async () => {
			const result: any = await runProtocol(
				CONFIG,
				"/chat/completions",
				{
					model: CONFIG.baseModel,
					messages: [{ role: "user", content: "Say hi." }],
				},
				{ stream: true }
			);

			const chunks = result.frames.filter((f: any) => f && typeof f === "object");
			const usageChunk = chunks.find((chunk: any) => chunk.usage);
			expect(usageChunk).toBeDefined();
			expect(usageChunk.usage.total_tokens).toBeGreaterThan(0);
		});
	});

	describe("Response Format (JSON)", () => {
		it("should handle json_object response format", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [
					{
						role: "user",
						content: 'Return a JSON object with fields "name" and "age" for a fictional person.',
					},
				],
				response_format: { type: "json_object" },
			});

			expect(response.choices[0].message.content).toBeDefined();
			// Should be valid JSON
			const parsed = JSON.parse(response.choices[0].message.content);
			expect(parsed).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle json_schema response format", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "Generate a person's profile." }],
				response_format: {
					type: "json_schema",
					json_schema: {
						name: "person_profile",
						strict: true,
						schema: {
							type: "object",
							properties: {
								name: { type: "string" },
								age: { type: "number" },
								city: { type: "string" },
							},
							required: ["name", "age"],
							additionalProperties: false,
						},
					},
				},
			});

			expect(response.choices[0].message.content).toBeDefined();
			const parsed = JSON.parse(response.choices[0].message.content);
			expect(parsed.name).toBeDefined();
			expect(typeof parsed.age).toBe("number");
			expectUsageTokens(response, context);
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty user message gracefully", async () => {
			try {
				const response: any = await runProtocol(CONFIG, "/chat/completions", {
					model: CONFIG.baseModel,
					messages: [{ role: "user", content: "" }],
				});
				// If it doesn't error, verify response
				expect(response.choices).toBeDefined();
			} catch (error: any) {
				// Empty message may cause 400 error - that's acceptable
				expect(error.message).toContain("400");
			}
		});

		it("should handle very long context", async () => {
			const longText = "The quick brown fox jumps over the lazy dog. ".repeat(500);
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: `Summarize this: ${longText}` }],
			});

			expect(response.choices[0].message.content).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle n parameter (multiple choices)", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "Generate a random color name." }],
				n: 2,
			});

			expect(response.choices).toBeDefined();
			expect(response.choices.length).toBe(2);
			expect(response.choices[0].message.content).not.toBe(response.choices[1].message.content);
			expectUsageTokens(response, context);
		});
	});
});
