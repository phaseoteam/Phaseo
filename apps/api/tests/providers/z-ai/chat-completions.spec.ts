// Z.AI (GLM) Provider - Chat Completions Tests
// Tests Chat Completions scenarios for Z.AI with reasoning support

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
	createTestContext,
	expectUsageTokens,
	expectStreamFrames,
	printTestSummary,
	runProtocol,
	TEST_IMAGE_URL,
	TEST_TOOL_OPENAI,
	type ProviderTestConfig,
} from "../helpers/provider-test-suite";

const CONFIG: ProviderTestConfig = {
	providerId: "z-ai",
	baseModel: "z-ai/glm-4-7-flash:free",
	capabilities: {
		chatCompletions: true,
		responsesApi: true,
		anthropicMessages: false,
		streaming: true,
		tools: true,
		reasoning: true, // Z.AI supports reasoning via thinking mode
		vision: true,
	},
};

const context = createTestContext();

describe("Z.AI - Chat Completions", () => {
	beforeAll(() => {
		const apiKey = process.env.GATEWAY_API_KEY;
		if (!apiKey) {
			throw new Error("GATEWAY_API_KEY is required for provider tests");
		}
	});

	afterAll(() => {
		printTestSummary(context, "Z.AI Chat Completions");
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
					{ role: "system", content: "You are a helpful assistant." },
					{ role: "user", content: "Tell me about AI." },
				],
			});

			expect(response.choices[0].message.content).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle multi-turn conversation", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [
					{ role: "user", content: "My favorite color is blue." },
					{ role: "assistant", content: "That's a nice color!" },
					{ role: "user", content: "What's my favorite color?" },
				],
			});

			expect(response.choices[0].message.content).toContain("blue");
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
	});

	describe("Tools (Function Calling)", () => {
		it("should handle tool definition", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
				tools: [TEST_TOOL_OPENAI],
			});

			expect(response.choices[0].message).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle forced tool call", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "What's the weather in Boston?" }],
				tools: [TEST_TOOL_OPENAI],
				tool_choice: { type: "function", function: { name: "get_weather" } },
			});

			// Z.AI should support tool calls
			if (response.choices[0].message.tool_calls) {
				expect(Array.isArray(response.choices[0].message.tool_calls)).toBe(true);
				expect(response.choices[0].message.tool_calls.length).toBeGreaterThan(0);
				expect(response.choices[0].finish_reason).toBe("tool_calls");
			}
			expectUsageTokens(response, context);
		});
	});

	describe("Reasoning (Thinking Mode)", () => {
		it("should activate thinking mode with reasoning.enabled=true", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "What is 25 * 47? Think step by step." }],
				reasoning: { enabled: true },
			});

			expect(response.choices[0].message.content).toBeDefined();

			// Z.AI returns reasoning_content when thinking mode is enabled
			if (response.choices[0].message.reasoning_content) {
				expect(typeof response.choices[0].message.reasoning_content).toBe("string");
				expect(response.choices[0].message.reasoning_content.length).toBeGreaterThan(0);
				console.log("✓ Z.AI thinking mode activated - reasoning_content present");
			}

			expectUsageTokens(response, context);
		});

		it("should NOT activate thinking with reasoning.enabled=false", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "What is 12 + 15?" }],
				reasoning: { enabled: false },
			});

			expect(response.choices[0].message.content).toBeDefined();

			// Should not have reasoning_content when effort is "none"
			expect(response.choices[0].message.reasoning_content).toBeUndefined();

			expectUsageTokens(response, context);
		});

		it("should verify reasoning_details format matches industry standard", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "Solve: If I have 3 apples and buy 2 more, how many do I have?" }],
				reasoning: { enabled: true },
			});

			expect(response.choices[0].message.content).toBeDefined();

			// Verify reasoning_details format (OpenRouter-compatible)
			if (response.choices[0].message.reasoning_details) {
				expect(Array.isArray(response.choices[0].message.reasoning_details)).toBe(true);
				const detail = response.choices[0].message.reasoning_details[0];

				// Should have standard type: "text" | "summary" | "encrypted"
				expect(detail.type).toMatch(/text|summary|encrypted/);

				// Should have "text" field, not "reasoning_content"
				if (detail.type === "text" || detail.type === "summary") {
					expect(detail.text).toBeDefined();
					expect(typeof detail.text).toBe("string");
				}

				console.log("✓ Z.AI reasoning_details format matches industry standard");
			}

			expectUsageTokens(response, context);
		});

		it("should handle reasoning in multi-turn conversation", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [
					{ role: "user", content: "I have 5 cookies." },
					{ role: "assistant", content: "Okay, you have 5 cookies." },
					{ role: "user", content: "If I eat 2, how many do I have left? Think carefully." },
				],
				reasoning: { enabled: true },
			});

			expect(response.choices[0].message.content).toBeDefined();
			expect(response.choices[0].message.content).toContain("3");

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

		it("should handle streaming with reasoning", async () => {
			const result: any = await runProtocol(
				CONFIG,
				"/chat/completions",
				{
					model: CONFIG.baseModel,
					messages: [{ role: "user", content: "What is 12 + 15?" }],
					reasoning: { enabled: true },
				},
				{ stream: true }
			);

			expectStreamFrames(result.frames, context);

			// Check if reasoning_content appears in deltas
			const chunks = result.frames.filter((f: any) => f?.choices);
			const hasReasoningDeltas = chunks.some((chunk: any) => chunk.choices?.[0]?.delta?.reasoning_content);

			if (hasReasoningDeltas) {
				console.log("✓ Z.AI streaming includes reasoning_content in deltas");
			}

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

	describe("Edge Cases", () => {
		it("should handle temperature parameter", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "Generate a random number between 1 and 100." }],
				temperature: 1.0,
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

		it("should handle very long context", async () => {
			const longText = "The quick brown fox jumps over the lazy dog. ".repeat(300);
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: `Summarize this: ${longText}` }],
			});

			expect(response.choices[0].message.content).toBeDefined();
			expectUsageTokens(response, context);
		});
	});
});
