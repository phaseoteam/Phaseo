// Cerebras Provider - Responses API Tests
// Validates Cerebras via responses surface using gpt-oss-120b

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

describe("Cerebras - Responses API", () => {
	beforeAll(() => {
		const apiKey = process.env.GATEWAY_API_KEY;
		if (!apiKey) {
			throw new Error("GATEWAY_API_KEY is required for provider tests");
		}
	});

	afterAll(() => {
		printTestSummary(context, "Cerebras Responses API");
	});

	it("should handle basic text request", async () => {
		const response: any = await runProtocol(CONFIG, "/responses", {
			model: CONFIG.baseModel,
			input: "Say hello in exactly 3 words.",
			...PROVIDER_ONLY,
		}, { headers: BETA_HEADERS });

		expect(response.id).toBeDefined();
		expect(response.object).toBe("response");
		expect(Array.isArray(response.output)).toBe(true);
		expectUsageTokens(response, context);
	});

	it("should handle forced tool call", async () => {
		const response: any = await runProtocol(CONFIG, "/responses", {
			model: CONFIG.baseModel,
			input: "Call get_weather for London and return a tool call.",
			tools: [TEST_TOOL_OPENAI],
			tool_choice: { type: "function", name: "get_weather" },
			...PROVIDER_ONLY,
		}, { headers: BETA_HEADERS });

		const functionCall = (response?.output ?? []).find((item: any) => item?.type === "function_call");
		expect(functionCall).toBeDefined();
		expect(functionCall?.name).toBe("get_weather");
		expectUsageTokens(response, context);
	});

	it("should handle structured output json_schema", async () => {
		const response: any = await runProtocol(CONFIG, "/responses", {
			model: CONFIG.baseModel,
			input: "Return JSON with keys city and weather.",
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

		expect(Array.isArray(response.output)).toBe(true);
		expectUsageTokens(response, context);
	});

	it("should handle streaming response", async () => {
		const streamResult: any = await runProtocol(
			CONFIG,
			"/responses",
			{
				model: CONFIG.baseModel,
				input: "Stream a short greeting.",
				...PROVIDER_ONLY,
			},
			{ stream: true, headers: BETA_HEADERS },
		);

		expectStreamFrames(streamResult.frames ?? [], context);
	});
});
