// OpenAI Provider - Responses API Tests
// Tests all Responses API scenarios for OpenAI

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
	baseModel: "openai/gpt-4.1-nano",
	capabilities: {
		chatCompletions: true,
		responsesApi: true,
		anthropicMessages: false,
		streaming: true,
		tools: true,
		reasoning: true,
		vision: true,
	},
};
const REASONING_MODEL = "openai/gpt-5-nano";

const context = createTestContext();

describe("OpenAI - Responses API", () => {
	beforeAll(() => {
		const apiKey = process.env.GATEWAY_API_KEY;
		if (!apiKey) {
			throw new Error("GATEWAY_API_KEY is required for provider tests");
		}
	});

	afterAll(() => {
		printTestSummary(context, "OpenAI Responses API");
	});

	describe("Text Input", () => {
		it("should handle basic text request", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "Say hello in exactly 3 words." }],
					},
				],
			});

			expect(response.id).toBeDefined();
			expect(response.object).toBe("response");
			expect(response.status).toBe("completed");
			expect(response.output).toBeDefined();
			expect(Array.isArray(response.output)).toBe(true);

			// Find message output
			const messageOutput = response.output.find((item: any) => item.type === "message");
			expect(messageOutput).toBeDefined();
			expect(messageOutput.role).toBe("assistant");
			expect(messageOutput.content).toBeDefined();

			expectUsageTokens(response, context);
		});

		it("should handle system message", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "system",
						content: [{ type: "input_text", text: "You are a helpful assistant that speaks like a pirate." }],
					},
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "Tell me about the weather." }],
					},
				],
			});

			const messageOutput = response.output.find((item: any) => item.type === "message");
			expect(messageOutput.content).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle multi-turn conversation", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "My name is Bob." }],
					},
					{
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: "Nice to meet you, Bob!" }],
					},
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "What's my name?" }],
					},
				],
			});

			const messageOutput = response.output.find((item: any) => item.type === "message");
			const contentText = messageOutput.content
				.map((c: any) => c.text || "")
				.join("");
			expect(contentText).toContain("Bob");
			expectUsageTokens(response, context);
		});
	});

	describe("Vision - Image Input", () => {
		it("should handle image URL", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [
							{ type: "input_text", text: "What is in this image? Be brief." },
							{ type: "input_image", image_url: TEST_IMAGE_URL },
						],
					},
				],
			});

			const messageOutput = response.output.find((item: any) => item.type === "message");
			expect(messageOutput).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle base64 image", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [
							{ type: "input_text", text: "What color is this?" },
							{ type: "input_image", image_url: TEST_IMAGE_BASE64 },
						],
					},
				],
			});

			const messageOutput = response.output.find((item: any) => item.type === "message");
			expect(messageOutput).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle image with detail parameter", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [
							{ type: "input_text", text: "Describe this image in detail." },
							{ type: "input_image", image_url: TEST_IMAGE_URL, detail: "high" },
						],
					},
				],
			});

			const messageOutput = response.output.find((item: any) => item.type === "message");
			expect(messageOutput).toBeDefined();
			expectUsageTokens(response, context);
		});
	});

	describe("Tools (Function Calling)", () => {
		it("should handle tool definition", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "What's the weather in San Francisco?" }],
					},
				],
				tools: [TEST_TOOL_OPENAI],
			});

			expect(response.output).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle forced tool call", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "What's the weather in Boston?" }],
					},
				],
				tools: [TEST_TOOL_OPENAI],
				tool_choice: { type: "function", name: "get_weather" },
			});

			// Should have function_call output
			const functionCall = response.output.find((item: any) => item.type === "function_call");
			expect(functionCall).toBeDefined();
			expect(functionCall.name).toBe("get_weather");
			expectUsageTokens(response, context);
		});

		it("should handle tool result continuation", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "What's the weather in Seattle?" }],
					},
					{
						type: "function_call",
						call_id: "call_123",
						name: "get_weather",
						arguments: '{"location":"Seattle, WA","unit":"fahrenheit"}',
					},
					{
						type: "function_call_output",
						call_id: "call_123",
						output: "72°F, sunny",
					},
				],
				tools: [TEST_TOOL_OPENAI],
			});

			const messageOutput = response.output.find((item: any) => item.type === "message");
			expect(messageOutput).toBeDefined();
			expectUsageTokens(response, context);
		});
	});

	describe("Reasoning", () => {
		it("should handle reasoning with extended thinking", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: REASONING_MODEL,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "What is 25 * 47? Think step by step." }],
					},
				],
				reasoning: { effort: "high" },
			});

			expect(response.output).toBeDefined();

			// Check for reasoning output item
			const reasoningOutput = response.output.find((item: any) => item.type === "reasoning");
			if (reasoningOutput) {
				expect(reasoningOutput).toBeDefined();
				// Reasoning output should have content or summary
				expect(reasoningOutput.content || reasoningOutput.summary).toBeDefined();
			}

			const messageOutput = response.output.find((item: any) => item.type === "message");
			expect(messageOutput).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should verify reasoning output format", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: REASONING_MODEL,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "Solve: If I have 3 apples and buy 2 more, how many do I have?" }],
					},
				],
				reasoning: { effort: "medium" },
			});

			expect(response.output).toBeDefined();

			// Verify output items are properly typed
			const messageItems = response.output.filter((item: any) => item.type === "message");
			expect(messageItems.length).toBeGreaterThan(0);

			expectUsageTokens(response, context);
		});
	});

	describe("Streaming", () => {
		it("should handle basic streaming", async () => {
			const result: any = await runProtocol(
				CONFIG,
				"/responses",
				{
					model: CONFIG.baseModel,
					input: [
						{
							type: "message",
							role: "user",
							content: [{ type: "input_text", text: "Count from 1 to 5." }],
						},
					],
				},
				{ stream: true }
			);

			expectStreamFrames(result.frames, context);

			// Verify response object structure
			const chunks = result.frames.filter((f: any) => f?.object === "response");
			expect(chunks.length).toBeGreaterThan(0);
		});

		it("should handle streaming with tools", async () => {
			const result: any = await runProtocol(
				CONFIG,
				"/responses",
				{
					model: CONFIG.baseModel,
					input: [
						{
							type: "message",
							role: "user",
							content: [{ type: "input_text", text: "What's the weather in Miami?" }],
						},
					],
					tools: [TEST_TOOL_OPENAI],
					tool_choice: { type: "function", name: "get_weather" },
				},
				{ stream: true }
			);

			expectStreamFrames(result.frames, context);
			const toolEventTypes = result.frames
				.filter((frame: any) => frame && typeof frame === "object")
				.map((frame: any) => frame.type)
				.filter((type: any) => typeof type === "string");
			expect(toolEventTypes).toContain("response.output_item.added");
			expect(toolEventTypes).toContain("response.function_call_arguments.delta");
			expect(toolEventTypes).toContain("response.function_call_arguments.done");
			expect(toolEventTypes).toContain("response.output_item.done");
		});

		it("should handle streaming with reasoning", async () => {
			const result: any = await runProtocol(
				CONFIG,
				"/responses",
				{
					model: REASONING_MODEL,
					input: [
						{
							type: "message",
							role: "user",
							content: [{ type: "input_text", text: "What is 12 + 15?" }],
						},
					],
					reasoning: { effort: "low" },
				},
				{ stream: true }
			);

			expectStreamFrames(result.frames, context);
		});
	});

	describe("Response Format (JSON)", () => {
		it("should handle json_object response format", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [
							{
								type: "input_text",
								text: 'Return a JSON object with fields "name" and "age" for a fictional person.',
							},
						],
					},
				],
				text: {
					format: { type: "json_object" },
				},
			});

			const messageOutput = response.output.find((item: any) => item.type === "message");
			const contentText = messageOutput.content.map((c: any) => c.text || "").join("");

			// Should be valid JSON
			const parsed = JSON.parse(contentText);
			expect(parsed).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("should handle json_schema response format", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "Generate a person's profile." }],
					},
				],
				text: {
					format: {
						type: "json_schema",
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

			const messageOutput = response.output.find((item: any) => item.type === "message");
			const contentText = messageOutput.content.map((c: any) => c.text || "").join("");

			const parsed = JSON.parse(contentText);
			expect(parsed.name).toBeDefined();
			expect(typeof parsed.age).toBe("number");
			expectUsageTokens(response, context);
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty user message gracefully", async () => {
			try {
				const response: any = await runProtocol(CONFIG, "/responses", {
					model: CONFIG.baseModel,
					input: [
						{
							type: "message",
							role: "user",
							content: [{ type: "input_text", text: "" }],
						},
					],
				});
				expect(response.output).toBeDefined();
			} catch (error: any) {
				expect(error.message).toContain("400");
			}
		});

		it("should handle very long context", async () => {
			const longText = "The quick brown fox jumps over the lazy dog. ".repeat(500);
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: `Summarize this: ${longText}` }],
					},
				],
			});

			const messageOutput = response.output.find((item: any) => item.type === "message");
			expect(messageOutput).toBeDefined();
			expectUsageTokens(response, context);
		});
	});
});
