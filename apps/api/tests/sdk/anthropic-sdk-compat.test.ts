// Anthropic SDK Compatibility Tests
// Verifies that the official Anthropic SDK works with our gateway by changing base URL

import { describe, it, expect, beforeAll } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

/**
 * These tests verify that our gateway is fully compatible with the official Anthropic SDK.
 *
 * To run these tests:
 * 1. Set GATEWAY_API_KEY environment variable (your gateway API key)
 * 2. Set GATEWAY_BASE_URL environment variable (e.g., http://localhost:8787)
 * 3. Ensure gateway is running
 *
 * Example:
 * GATEWAY_API_KEY=gw_test123 GATEWAY_BASE_URL=http://localhost:8787 pnpm test tests/sdk/anthropic-sdk-compat
 */

const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY;

// Skip tests if environment variables not set
const shouldSkip = !GATEWAY_BASE_URL || !GATEWAY_API_KEY;
const describeIf = shouldSkip ? describe.skip : describe;

describeIf("Anthropic SDK Compatibility", () => {
	let client: Anthropic;

	beforeAll(() => {
		client = new Anthropic({
			baseURL: GATEWAY_BASE_URL,
			apiKey: GATEWAY_API_KEY,
		});
	});

	describe("Messages API", () => {
		it("should handle basic message creation", async () => {
			const message = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 50,
				messages: [{ role: "user", content: "Say 'test successful' if you can read this." }],
			});

			expect(message).toBeDefined();
			expect(message.id).toBeDefined();
			expect(message.id).toMatch(/^req_/); // Gateway ID format
			expect(message.type).toBe("message");
			expect(message.role).toBe("assistant");
			expect(message.content).toBeDefined();
			expect(Array.isArray(message.content)).toBe(true);
			expect(message.content.length).toBeGreaterThan(0);
			expect(message.stop_reason).toBeDefined();
		});

		it("should include nativeResponseId at top level (consistent with other protocols)", async () => {
			const message = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 20,
				messages: [{ role: "user", content: "Hello" }],
			});

			// Gateway should include nativeResponseId at top level (same as OpenAI protocols)
			const messageAny = message as any;
			expect(messageAny.nativeResponseId).toBeDefined();

			// Native ID should be different from gateway ID
			expect(messageAny.nativeResponseId).not.toBe(message.id);
		});

		it("should handle system messages", async () => {
			const message = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 50,
				system: "You are a helpful assistant that always responds politely.",
				messages: [{ role: "user", content: "Hello" }],
			});

			expect(message.content).toBeDefined();
			expect(message.content.length).toBeGreaterThan(0);
		});

		it("should handle streaming responses", async () => {
			const stream = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 100,
				messages: [{ role: "user", content: "Count to 3" }],
				stream: true,
			});

			const events: any[] = [];
			for await (const event of stream) {
				events.push(event);
			}

			expect(events.length).toBeGreaterThan(0);

			// Should have message_start event
			const messageStart = events.find(e => e.type === "message_start");
			expect(messageStart).toBeDefined();
			expect(messageStart.message.id).toMatch(/^req_/);

			// Should have content_block_delta events with text
			const hasTextDelta = events.some(
				e => e.type === "content_block_delta" && e.delta?.type === "text_delta"
			);
			expect(hasTextDelta).toBe(true);

			// Should have message_delta with stop_reason
			const messageDelta = events.find(e => e.type === "message_delta");
			expect(messageDelta).toBeDefined();
			expect(messageDelta.delta?.stop_reason).toBeDefined();
		});

		it("should include usage statistics", async () => {
			const message = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 50,
				messages: [{ role: "user", content: "Hello" }],
			});

			expect(message.usage).toBeDefined();
			expect(message.usage.input_tokens).toBeGreaterThan(0);
			expect(message.usage.output_tokens).toBeGreaterThan(0);
		});

		it("should handle temperature and other parameters", async () => {
			const message = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 50,
				messages: [{ role: "user", content: "Test" }],
				temperature: 0.7,
				top_p: 0.9,
			});

			expect(message).toBeDefined();
			expect(message.content).toBeDefined();
		});

		it("should handle stop sequences", async () => {
			const message = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 100,
				messages: [{ role: "user", content: "Count: 1, 2, 3, 4" }],
				stop_sequences: [", 3"],
			});

			expect(message).toBeDefined();

			// If stop sequence triggered, should have stop_sequence field
			if (message.stop_reason === "stop_sequence") {
				expect(message.stop_sequence).toBeDefined();
				expect(message.stop_sequence).toBe(", 3");
			}
		});
	});

	describe("Tool Use (Function Calling)", () => {
		it("should handle tool definitions", async () => {
			const message = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 200,
				messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
				tools: [
					{
						name: "get_weather",
						description: "Get the current weather in a location",
						input_schema: {
							type: "object",
							properties: {
								location: {
									type: "string",
									description: "The city and state, e.g. San Francisco, CA",
								},
								unit: {
									type: "string",
									enum: ["celsius", "fahrenheit"],
									description: "The unit of temperature",
								},
							},
							required: ["location"],
						},
					},
				],
			});

			expect(message).toBeDefined();
			expect(message.content).toBeDefined();

			// May or may not use tool depending on model behavior
			if (message.stop_reason === "tool_use") {
				const toolUseBlock = message.content.find(
					(block: any) => block.type === "tool_use"
				);
				expect(toolUseBlock).toBeDefined();
				expect((toolUseBlock as any).name).toBe("get_weather");
				expect((toolUseBlock as any).input).toBeDefined();
			}
		});

		it("should handle tool results in conversation", async () => {
			// First request with tools
			const firstMessage = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 200,
				messages: [{ role: "user", content: "What's the weather in NYC?" }],
				tools: [
					{
						name: "get_weather",
						description: "Get weather for a location",
						input_schema: {
							type: "object",
							properties: {
								location: { type: "string" },
							},
							required: ["location"],
						},
					},
				],
			});

			// If model used tool, continue conversation with result
			if (firstMessage.stop_reason === "tool_use") {
				const toolUseBlock = firstMessage.content.find(
					(block: any) => block.type === "tool_use"
				) as any;

				const secondMessage = await client.messages.create({
					model: "claude-3-5-sonnet-20241022",
					max_tokens: 200,
					messages: [
						{ role: "user", content: "What's the weather in NYC?" },
						{ role: "assistant", content: firstMessage.content },
						{
							role: "user",
							content: [
								{
									type: "tool_result",
									tool_use_id: toolUseBlock.id,
									content: JSON.stringify({ temperature: 72, condition: "sunny" }),
								},
							],
						},
					],
				});

				expect(secondMessage.content).toBeDefined();
				const textContent = secondMessage.content.find(
					(block: any) => block.type === "text"
				) as any;
				expect(textContent?.text.toLowerCase()).toContain("72");
			}
		});
	});

	describe("Multimodal Content", () => {
		it("should handle text content", async () => {
			const message = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 50,
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: "What is 2+2?" }],
					},
				],
			});

			expect(message.content).toBeDefined();
			const textBlock = message.content.find((block: any) => block.type === "text");
			expect(textBlock).toBeDefined();
		});

		// Note: Image support requires base64 data or URLs
		// Skipping actual image test to avoid external dependencies
	});

	describe("Conversation Context", () => {
		it("should maintain conversation history", async () => {
			const firstMessage = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 50,
				messages: [{ role: "user", content: "My name is Alice." }],
			});

			expect(firstMessage.content).toBeDefined();

			// Continue conversation
			const secondMessage = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 50,
				messages: [
					{ role: "user", content: "My name is Alice." },
					{ role: "assistant", content: firstMessage.content },
					{ role: "user", content: "What is my name?" },
				],
			});

			const textContent = secondMessage.content.find(
				(block: any) => block.type === "text"
			) as any;
			expect(textContent?.text.toLowerCase()).toContain("alice");
		});
	});

	describe("Error Handling", () => {
		it("should handle invalid model gracefully", async () => {
			await expect(
				client.messages.create({
					model: "invalid-model-name",
					max_tokens: 10,
					messages: [{ role: "user", content: "Test" }],
				})
			).rejects.toThrow();
		});

		it("should handle missing API key", async () => {
			const invalidClient = new Anthropic({
				baseURL: GATEWAY_BASE_URL,
				apiKey: "invalid_key_123",
			});

			await expect(
				invalidClient.messages.create({
					model: "claude-3-5-sonnet-20241022",
					max_tokens: 10,
					messages: [{ role: "user", content: "Test" }],
				})
			).rejects.toThrow();
		});

		it("should handle max_tokens exceeding limit", async () => {
			// This should fail gracefully with appropriate error
			await expect(
				client.messages.create({
					model: "claude-3-5-sonnet-20241022",
					max_tokens: 999999, // Way too high
					messages: [{ role: "user", content: "Test" }],
				})
			).rejects.toThrow();
		});
	});

	describe("Gateway Extensions", () => {
		it("should include nativeResponseId at top level (consistent with all protocols)", async () => {
			const message = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 20,
				messages: [{ role: "user", content: "Test" }],
			});

			// Should have nativeResponseId at top level (same structure as OpenAI protocols)
			expect((message as any).nativeResponseId).toBeDefined();
		});

		it("should maintain consistent ID structure across all gateway protocols", async () => {
			const message = await client.messages.create({
				model: "claude-3-5-sonnet-20241022",
				max_tokens: 20,
				messages: [{ role: "user", content: "Test" }],
			});

			const messageAny = message as any;

			// Same structure as OpenAI Chat and Responses:
			// - id: Gateway request ID
			// - nativeResponseId: Provider's native ID
			expect(message.id).toMatch(/^req_/);
			expect(messageAny.nativeResponseId).toBeDefined();
			expect(messageAny.nativeResponseId).not.toBe(message.id);
		});
	});
});

// Helper to check if tests should be skipped
if (shouldSkip) {
	console.log(`
⚠️  Skipping Anthropic SDK compatibility tests

To run these tests, set:
  GATEWAY_BASE_URL=http://localhost:8787
  GATEWAY_API_KEY=your_gateway_key
	`);
}
