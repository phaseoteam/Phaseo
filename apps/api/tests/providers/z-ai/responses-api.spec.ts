// Z.AI (GLM) Provider - Responses API Tests
// Tests Responses API scenarios for Z.AI with reasoning support

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
	createTestContext,
	expectUsageTokens,
	printTestSummary,
	runProtocol,
	type ProviderTestConfig,
} from "../helpers/provider-test-suite";

const CONFIG: ProviderTestConfig = {
	providerId: "z-ai",
	baseModel: "z-ai/glm-4-7-flash:free",
	capabilities: {
		chatCompletions: true,
		responsesApi: true,
		anthropicMessages: false,
		streaming: false,
		tools: false,
		reasoning: true,
		vision: false,
	},
};

const context = createTestContext();

describe("Z.AI - Responses API (Reasoning)", () => {
	beforeAll(() => {
		const apiKey = process.env.GATEWAY_API_KEY;
		if (!apiKey) {
			throw new Error("GATEWAY_API_KEY is required for provider tests");
		}
	});

	afterAll(() => {
		printTestSummary(context, "Z.AI Responses API");
	});

	describe("Reasoning Format", () => {
		it("should return proper reasoning output item format", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "What is 5 + 3? Think step by step." }],
					},
				],
				reasoning: { enabled: true },
			});

			console.log("\n=== Z.AI Responses API Response ===");
			console.log(JSON.stringify(response, null, 2));

			expect(response.id).toBeDefined();
			expect(response.object).toBe("response");
			expect(response.status).toBe("completed");
			expect(response.output).toBeDefined();
			expect(Array.isArray(response.output)).toBe(true);

			// Check for reasoning output item
			const reasoningOutput = response.output.find((item: any) => item.type === "reasoning");
			console.log("\n=== Reasoning Output Item ===");
			console.log(JSON.stringify(reasoningOutput, null, 2));

			// CRITICAL: First output should be { type: "reasoning" }, not { type: "message" }
			expect(reasoningOutput).toBeDefined();
			expect(reasoningOutput.type).toBe("reasoning");

			// Check for message output item
			const messageOutput = response.output.find((item: any) => item.type === "message");
			console.log("\n=== Message Output Item ===");
			console.log(JSON.stringify(messageOutput, null, 2));

			expect(messageOutput).toBeDefined();
			expect(messageOutput.role).toBe("assistant");
			expect(messageOutput.content).toBeDefined();

			// Verify we have BOTH reasoning and message
			expect(response.output.length).toBeGreaterThanOrEqual(2);

			expectUsageTokens(response, context);
		});

		it("should extract usage tokens correctly", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "Say hello." }],
					},
				],
			});

			console.log("\n=== Usage Object ===");
			console.log(JSON.stringify(response.usage, null, 2));

			expect(response.usage).toBeDefined();
			expect(response.usage.input_tokens).toBeGreaterThan(0);
			expect(response.usage.output_tokens).toBeGreaterThan(0);
			expect(response.usage.total_tokens).toBeGreaterThan(0);

			expectUsageTokens(response, context);
		});
	});
});
