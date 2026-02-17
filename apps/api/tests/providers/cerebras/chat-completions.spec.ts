// Cerebras Provider - Chat Completions Tests
// Validates Cerebras via chat.completions using gpt-oss-120b

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	createTestContext,
	expectStreamFrames,
	expectUsageTokens,
	printTestSummary,
	runProtocol,
	TEST_TOOL_OPENAI,
	type ProviderTestConfig,
} from "../helpers/provider-test-suite";

const CONFIG: ProviderTestConfig = {
	providerId: "cerebras",
	baseModel: "openai/gpt-oss-120b",
	capabilities: {
		chatCompletions: true,
		responsesApi: true,
		anthropicMessages: true,
		streaming: true,
		tools: true,
		reasoning: true,
		vision: false,
	},
};

const PROVIDER_ONLY = { provider: { only: [CONFIG.providerId] } };
const BETA_HEADERS = { "x-aistats-beta-capabilities": "1" };
const context = createTestContext();

describe("Cerebras - Chat Completions", () => {
	beforeAll(() => {
		const apiKey = process.env.GATEWAY_API_KEY;
		if (!apiKey) {
			throw new Error("GATEWAY_API_KEY is required for provider tests");
		}
	});

	afterAll(() => {
		printTestSummary(context, "Cerebras Chat Completions");
	});

	it("should handle basic text request", async () => {
		const response: any = await runProtocol(CONFIG, "/chat/completions", {
			model: CONFIG.baseModel,
			messages: [{ role: "user", content: "Say hello in exactly 3 words." }],
			...PROVIDER_ONLY,
		}, { headers: BETA_HEADERS });

		expect(response.id).toBeDefined();
		expect(response.object).toBe("chat.completion");
		expect(Array.isArray(response.choices)).toBe(true);
		expect(response.choices[0]?.message?.role).toBe("assistant");
		expect(typeof response.choices[0]?.message?.content).toBe("string");
		expectUsageTokens(response, context);
	});

	it("should handle forced tool call", async () => {
		const response: any = await runProtocol(CONFIG, "/chat/completions", {
			model: CONFIG.baseModel,
			messages: [{ role: "user", content: "Call get_weather for London." }],
			tools: [TEST_TOOL_OPENAI],
			tool_choice: { type: "function", function: { name: "get_weather" } },
			...PROVIDER_ONLY,
		}, { headers: BETA_HEADERS });

		const toolCalls = response?.choices?.[0]?.message?.tool_calls;
		expect(Array.isArray(toolCalls)).toBe(true);
		expect(toolCalls.length).toBeGreaterThan(0);
		expect(toolCalls[0]?.function?.name).toBe("get_weather");
		expectUsageTokens(response, context);
	});

	it("should handle structured output json_schema", async () => {
		const response: any = await runProtocol(CONFIG, "/chat/completions", {
			model: CONFIG.baseModel,
			messages: [{ role: "user", content: "Return JSON with keys city and weather." }],
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "weather_schema",
					strict: true,
					schema: {
						type: "object",
						properties: {
							city: { type: "string" },
							weather: { type: "string" },
						},
						required: ["city", "weather"],
					},
				},
			},
			...PROVIDER_ONLY,
		}, { headers: BETA_HEADERS });

		const content = response?.choices?.[0]?.message?.content;
		expect(typeof content).toBe("string");
		expect(content.length).toBeGreaterThan(0);
		expectUsageTokens(response, context);
	});

	it("should handle streaming response", async () => {
		const streamResult: any = await runProtocol(
			CONFIG,
			"/chat/completions",
			{
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "Stream a short greeting." }],
				...PROVIDER_ONLY,
			},
			{ stream: true, headers: BETA_HEADERS },
		);

		expectStreamFrames(streamResult.frames ?? [], context);
	});
});
