// Alibaba Cloud Provider - Responses API Tests
// Validates Alibaba Cloud (DashScope Intl/Singapore) responses compatibility via gateway.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	createTestContext,
	expectStreamFrames,
	expectUsageTokens,
	printTestSummary,
	runProtocol,
	TEST_IMAGE_URL,
	TEST_TOOL_OPENAI,
	type ProviderTestConfig,
} from "../helpers/provider-test-suite";

const CONFIG: ProviderTestConfig = {
	providerId: "alibaba",
	baseModel: "qwen3.5-plus-2026-02-15",
	capabilities: {
		chatCompletions: true,
		responsesApi: true,
		anthropicMessages: true,
		streaming: true,
		tools: true,
		reasoning: true,
		vision: true,
	},
};

const PROVIDER_ONLY = { provider: { only: ["alibaba-cloud", "alibaba"] } };
const BETA_HEADERS = { "x-aistats-beta-capabilities": "1" };
const INTERNAL_TEST_TOKEN = (process.env.LIVE_INTERNAL_TEST_TOKEN ?? process.env.GATEWAY_INTERNAL_TEST_TOKEN ?? "").trim();
const TESTING_HEADERS = INTERNAL_TEST_TOKEN
	? {
		"x-aistats-testing-mode": "true",
		"x-aistats-internal-token": INTERNAL_TEST_TOKEN,
	}
	: {};
const ROUTING_HEADERS = {
	...BETA_HEADERS,
	...TESTING_HEADERS,
};
const TESTING_BODY = INTERNAL_TEST_TOKEN ? { testing_mode: true } : {};

const CORE_TEXT_MODELS = [
	"qwen3.5-plus-2026-02-15",
	"qwen3.5-plus",
	"qwen3.5-27b",
] as const;

const VISION_MODEL = "qwen3-vl-plus-2025-12-19";

const context = createTestContext();

function assertSingaporeEndpointConfigured() {
	const configured = (process.env.ALIBABA_BASE_URL || "https://dashscope-intl.aliyuncs.com").toLowerCase();
	expect(configured).toContain("dashscope-intl.aliyuncs.com");
}

function findMessageOutput(response: any): any {
	return Array.isArray(response?.output)
		? response.output.find((item: any) => item?.type === "message")
		: undefined;
}

function extractMessageText(response: any): string {
	const message = findMessageOutput(response);
	const content = Array.isArray(message?.content) ? message.content : [];
	return content.map((item: any) => String(item?.text ?? "")).join("").trim();
}

function parseJsonLoose(value: string): Record<string, any> | null {
	if (!value || typeof value !== "string") return null;
	const trimmed = value.trim();
	try {
		return JSON.parse(trimmed);
	} catch {
		const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
		if (!fenced?.[1]) return null;
		try {
			return JSON.parse(fenced[1]);
		} catch {
			return null;
		}
	}
}

describe("Alibaba Cloud - Responses API", () => {
	beforeAll(() => {
		const apiKey = process.env.GATEWAY_API_KEY;
		if (!apiKey) {
			throw new Error("GATEWAY_API_KEY is required for provider tests");
		}
		assertSingaporeEndpointConfigured();
	});

	afterAll(() => {
		printTestSummary(context, "Alibaba Cloud Responses API");
	});

	describe("Model Matrix Smoke", () => {
		for (const model of CORE_TEXT_MODELS) {
			it(`completes a short request on ${model}`, async () => {
				const response: any = await runProtocol(CONFIG, "/responses", {
					model,
					input: [
						{
							type: "message",
							role: "user",
							content: [{ type: "input_text", text: "hi" }],
						},
					],
					max_output_tokens: 64,
					...PROVIDER_ONLY,
					...TESTING_BODY,
				}, { headers: ROUTING_HEADERS });

				expect(response.id).toBeDefined();
				expect(response.object).toBe("response");
				expect(response.status).toBe("completed");
				const message = findMessageOutput(response);
				expect(message).toBeDefined();
				expect(message?.role).toBe("assistant");
				expectUsageTokens(response, context);
			});
		}
	});

	describe("Tools", () => {
		it("accepts tool definition payload", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "What is the weather in Singapore?" }],
					},
				],
				tools: [TEST_TOOL_OPENAI],
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			expect(Array.isArray(response.output)).toBe(true);
			expectUsageTokens(response, context);
		});

		it("handles forced tool call", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "Use weather tool for Paris." }],
					},
				],
				tools: [TEST_TOOL_OPENAI],
				tool_choice: { type: "function", name: "get_weather" },
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			expect(Array.isArray(response.output)).toBe(true);
			const fnCall = response.output?.find((item: any) => item?.type === "function_call");
			if (fnCall) {
				expect(fnCall.name).toBe("get_weather");
			}
			expectUsageTokens(response, context);
		});
	});

	describe("Reasoning and Vision", () => {
		it("returns a completed response with reasoning enabled", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "What is 31 + 46? Think it through." }],
					},
				],
				reasoning: { enabled: true },
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			expect(response.status).toBe("completed");
			const message = findMessageOutput(response);
			expect(message).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("handles vision input on a Qwen VL model", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: VISION_MODEL,
				input: [
					{
						type: "message",
						role: "user",
						content: [
							{ type: "input_text", text: "Describe this image in one sentence." },
							{ type: "input_image", image_url: TEST_IMAGE_URL },
						],
					},
				],
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			expect(response.status).toBe("completed");
			const message = findMessageOutput(response);
			expect(message).toBeDefined();
			expectUsageTokens(response, context);
		});
	});

	describe("Streaming", () => {
		it("streams response events for short requests", async () => {
			const result: any = await runProtocol(
				CONFIG,
				"/responses",
				{
					model: CONFIG.baseModel,
					input: [
						{
							type: "message",
							role: "user",
							content: [{ type: "input_text", text: "Say hello in five words." }],
						},
					],
					...PROVIDER_ONLY,
					...TESTING_BODY,
				},
				{ stream: true, headers: ROUTING_HEADERS },
			);

			expectStreamFrames(result.frames, context);
			const objectFrames = result.frames.filter((frame: any) => frame?.object === "response");
			expect(objectFrames.length).toBeGreaterThan(0);
		});
	});

	describe("Response Format / Structured Output", () => {
		it("handles text.format json_object", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "Return only JSON with keys city and weather." }],
					},
				],
				text: {
					format: { type: "json_object" },
				},
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			expect(response.status).toBe("completed");
			const text = extractMessageText(response);
			expect(text.length).toBeGreaterThan(0);
			expectUsageTokens(response, context);
		});

		it("handles response_format json_schema mapping", async () => {
			const response: any = await runProtocol(CONFIG, "/responses", {
				model: CONFIG.baseModel,
				input: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "Return JSON only with keys city and weather. City must be London." }],
					},
				],
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
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			expect(response.status).toBe("completed");
			const text = extractMessageText(response);
			expect(text.length).toBeGreaterThan(0);
			const parsed = parseJsonLoose(text);
			if (parsed) {
				expect(typeof parsed.city).toBe("string");
				expect(typeof parsed.weather).toBe("string");
			}
			expectUsageTokens(response, context);
		});
	});
});
