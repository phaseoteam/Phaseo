// Cerebras Provider - Anthropic Messages Tests
// Validates Cerebras via /messages surface using gpt-oss-120b

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	createTestContext,
	expectStreamFrames,
	expectUsageTokens,
	printTestSummary,
	runProtocol,
	TEST_TOOL_ANTHROPIC,
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

describe("Cerebras - Messages", () => {
	beforeAll(() => {
		const apiKey = process.env.GATEWAY_API_KEY;
		if (!apiKey) {
			throw new Error("GATEWAY_API_KEY is required for provider tests");
		}
	});

	afterAll(() => {
		printTestSummary(context, "Cerebras Messages");
	});

	it("should handle basic text request", async () => {
		const response: any = await runProtocol(CONFIG, "/messages", {
			model: CONFIG.baseModel,
			max_tokens: 256,
			messages: [{ role: "user", content: "Say hello in exactly 3 words." }],
			...PROVIDER_ONLY,
		}, { headers: BETA_HEADERS });

		expect(response.id).toBeDefined();
		expect(response.type).toBe("message");
		expect(Array.isArray(response.content)).toBe(true);
		expectUsageTokens(response, context);
	});

	it("should handle forced tool call", async () => {
		const response: any = await runProtocol(CONFIG, "/messages", {
			model: CONFIG.baseModel,
			max_tokens: 512,
			messages: [{ role: "user", content: "Call get_weather for London and return a tool call." }],
			tools: [TEST_TOOL_ANTHROPIC],
			tool_choice: { type: "tool", name: "get_weather" },
			...PROVIDER_ONLY,
		}, { headers: BETA_HEADERS });

		const toolUse = (response?.content ?? []).find((item: any) => item?.type === "tool_use");
		expect(toolUse).toBeDefined();
		expect(toolUse?.name).toBe("get_weather");
		expectUsageTokens(response, context);
	});

	it("should handle json-style response request", async () => {
		const response: any = await runProtocol(CONFIG, "/messages", {
			model: CONFIG.baseModel,
			max_tokens: 384,
			system: "Return only valid JSON. No prose.",
			messages: [{ role: "user", content: "Return a JSON object with keys city and weather." }],
			...PROVIDER_ONLY,
		}, { headers: BETA_HEADERS });

		const text = Array.isArray(response?.content)
			? response.content.map((item: any) => String(item?.text ?? "")).join("\n")
			: String(response?.content ?? "");
		expect(text.length).toBeGreaterThan(0);
		expectUsageTokens(response, context);
	});

	it("should handle streaming response", async () => {
		const streamResult: any = await runProtocol(
			CONFIG,
			"/messages",
			{
				model: CONFIG.baseModel,
				max_tokens: 256,
				messages: [{ role: "user", content: "Stream a short greeting." }],
				...PROVIDER_ONLY,
			},
			{ stream: true, headers: BETA_HEADERS },
		);

		expectStreamFrames(streamResult.frames ?? [], context);
	});
});
