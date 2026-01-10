// OpenAI SDK Compatibility Tests
// Verifies that the official OpenAI SDK works with our gateway by changing base URL

import { describe, it, expect, beforeAll } from "vitest";
import OpenAI from "openai";

/**
 * These tests verify that our gateway is fully compatible with the official OpenAI SDK.
 *
 * To run these tests:
 * 1. Set GATEWAY_API_KEY environment variable (your gateway API key)
 * 2. Set GATEWAY_BASE_URL environment variable (e.g., http://localhost:8787)
 * 3. Ensure gateway is running
 *
 * Example:
 * GATEWAY_API_KEY=gw_test123 GATEWAY_BASE_URL=http://localhost:8787 pnpm test tests/sdk/openai-sdk-compat
 */

const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY;

// Skip tests if environment variables not set
const shouldSkip = !GATEWAY_BASE_URL || !GATEWAY_API_KEY;
const describeIf = shouldSkip ? describe.skip : describe;

describeIf("OpenAI SDK Compatibility", () => {
	let client: OpenAI;

	beforeAll(() => {
		client = new OpenAI({
			baseURL: GATEWAY_BASE_URL,
			apiKey: GATEWAY_API_KEY,
		});
	});

	describe("Chat Completions API", () => {
		it("should handle basic chat completion", async () => {
			const completion = await client.chat.completions.create({
				model: "gpt-4",
				messages: [{ role: "user", content: "Say 'test successful' if you can read this." }],
				max_tokens: 20,
			});

			expect(completion).toBeDefined();
			expect(completion.id).toBeDefined();
			expect(completion.id).toMatch(/^req_/); // Gateway ID format
			expect(completion.object).toBe("chat.completion");
			expect(completion.model).toBe("gpt-4");
			expect(completion.choices).toHaveLength(1);
			expect(completion.choices[0].message.role).toBe("assistant");
			expect(completion.choices[0].message.content).toBeDefined();
			expect(completion.choices[0].finish_reason).toBeDefined();
		});

		it("should preserve nativeResponseId from provider", async () => {
			const completion = await client.chat.completions.create({
				model: "gpt-4",
				messages: [{ role: "user", content: "Hello" }],
				max_tokens: 10,
			});

			// Gateway should include nativeResponseId
			expect((completion as any).nativeResponseId).toBeDefined();
			expect((completion as any).nativeResponseId).not.toBe(completion.id);
		});

		it("should handle streaming responses", async () => {
			const stream = await client.chat.completions.create({
				model: "gpt-4",
				messages: [{ role: "user", content: "Count to 3" }],
				max_tokens: 50,
				stream: true,
			});

			const chunks: any[] = [];
			for await (const chunk of stream) {
				chunks.push(chunk);
			}

			expect(chunks.length).toBeGreaterThan(0);

			// First chunk should have ID
			expect(chunks[0].id).toBeDefined();
			expect(chunks[0].id).toMatch(/^req_/);

			// All chunks should have same ID
			const firstId = chunks[0].id;
			for (const chunk of chunks) {
				expect(chunk.id).toBe(firstId);
			}

			// Should have delta content
			const hasContent = chunks.some(chunk =>
				chunk.choices[0]?.delta?.content
			);
			expect(hasContent).toBe(true);
		});

		it("should handle system messages", async () => {
			const completion = await client.chat.completions.create({
				model: "gpt-4",
				messages: [
					{ role: "system", content: "You are a helpful assistant." },
					{ role: "user", content: "Hello" },
				],
				max_tokens: 20,
			});

			expect(completion.choices[0].message.content).toBeDefined();
		});

		it("should handle temperature and other parameters", async () => {
			const completion = await client.chat.completions.create({
				model: "gpt-4",
				messages: [{ role: "user", content: "Test" }],
				temperature: 0.7,
				top_p: 0.9,
				max_tokens: 10,
			});

			expect(completion).toBeDefined();
			expect(completion.choices[0]).toBeDefined();
		});

		it("should include usage statistics", async () => {
			const completion = await client.chat.completions.create({
				model: "gpt-4",
				messages: [{ role: "user", content: "Hello" }],
				max_tokens: 10,
			});

			expect(completion.usage).toBeDefined();
			expect(completion.usage?.prompt_tokens).toBeGreaterThan(0);
			expect(completion.usage?.completion_tokens).toBeGreaterThan(0);
			expect(completion.usage?.total_tokens).toBeGreaterThan(0);
		});
	});

	describe("Tool Calling (Function Calling)", () => {
		it("should handle tool definitions", async () => {
			const completion = await client.chat.completions.create({
				model: "gpt-4",
				messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
				tools: [
					{
						type: "function",
						function: {
							name: "get_weather",
							description: "Get the current weather in a location",
							parameters: {
								type: "object",
								properties: {
									location: {
										type: "string",
										description: "The city and state, e.g. San Francisco, CA",
									},
									unit: {
										type: "string",
										enum: ["celsius", "fahrenheit"],
									},
								},
								required: ["location"],
							},
						},
					},
				],
				tool_choice: "auto",
				max_tokens: 100,
			});

			expect(completion).toBeDefined();
			expect(completion.choices[0]).toBeDefined();

			// May or may not call the tool depending on model behavior
			if (completion.choices[0].message.tool_calls) {
				expect(completion.choices[0].message.tool_calls[0].function.name).toBe("get_weather");
				expect(completion.choices[0].finish_reason).toBe("tool_calls");
			}
		});

		it("should handle tool results in conversation", async () => {
			// First request with tools
			const firstCompletion = await client.chat.completions.create({
				model: "gpt-4",
				messages: [{ role: "user", content: "What's the weather in NYC?" }],
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
				max_tokens: 100,
			});

			// If model called a tool, continue conversation with result
			if (firstCompletion.choices[0].message.tool_calls) {
				const toolCall = firstCompletion.choices[0].message.tool_calls[0];

				const secondCompletion = await client.chat.completions.create({
					model: "gpt-4",
					messages: [
						{ role: "user", content: "What's the weather in NYC?" },
						firstCompletion.choices[0].message,
						{
							role: "tool",
							tool_call_id: toolCall.id,
							content: JSON.stringify({ temperature: 72, condition: "sunny" }),
						},
					],
					max_tokens: 100,
				});

				expect(secondCompletion.choices[0].message.content).toBeDefined();
				expect(secondCompletion.choices[0].message.content?.toLowerCase()).toContain("72");
			}
		});
	});

	describe("Error Handling", () => {
		it("should handle invalid model gracefully", async () => {
			await expect(
				client.chat.completions.create({
					model: "invalid-model-name",
					messages: [{ role: "user", content: "Test" }],
				})
			).rejects.toThrow();
		});

		it("should handle missing API key", async () => {
			const invalidClient = new OpenAI({
				baseURL: GATEWAY_BASE_URL,
				apiKey: "invalid_key_123",
			});

			await expect(
				invalidClient.chat.completions.create({
					model: "gpt-4",
					messages: [{ role: "user", content: "Test" }],
				})
			).rejects.toThrow();
		});
	});
});

describeIf("OpenAI Responses API SDK Compatibility", () => {
	let client: OpenAI;

	beforeAll(() => {
		client = new OpenAI({
			baseURL: GATEWAY_BASE_URL,
			apiKey: GATEWAY_API_KEY,
		});
	});

	describe("Responses API", () => {
		it("should handle basic response creation", async () => {
			// Note: OpenAI SDK may not have full Responses API support yet
			// This tests the underlying HTTP compatibility
			const response = await client.post("/responses", {
				body: {
					model: "gpt-4",
					input_items: [
						{
							type: "message",
							role: "user",
							content: [{ type: "input_text", text: "Hello!" }],
						},
					],
					max_output_tokens: 100,
				},
			});

			const data = await response.json();

			expect(data.id).toBeDefined();
			expect(data.id).toMatch(/^req_/); // Gateway ID format
			expect(data.object).toBe("response");
			expect(data.status).toBe("completed");
			expect(data.output).toBeDefined();
			expect(Array.isArray(data.output)).toBe(true);
		});

		it("should use gateway request ID as primary id and include nativeResponseId", async () => {
			const response = await client.post("/responses", {
				body: {
					model: "gpt-4",
					input_items: [
						{
							type: "message",
							role: "user",
							content: [{ type: "input_text", text: "Test" }],
						},
					],
					max_output_tokens: 50,
				},
			});

			const data = await response.json();

			// Should use gateway request ID, not provider's native ID
			expect(data.id).toMatch(/^req_/);

			// Should also include nativeResponseId (consistent with Chat Completions)
			expect(data.nativeResponseId).toBeDefined();
			expect(data.nativeResponseId).not.toBe(data.id);
		});
	});
});

// Helper to check if tests should be skipped
if (shouldSkip) {
	console.log(`
⚠️  Skipping OpenAI SDK compatibility tests

To run these tests, set:
  GATEWAY_BASE_URL=http://localhost:8787
  GATEWAY_API_KEY=your_gateway_key
	`);
}
