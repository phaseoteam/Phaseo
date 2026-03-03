// Alibaba Cloud Provider - Chat Completions Tests
// Validates Alibaba Cloud (DashScope Intl/Singapore) chat compatibility via gateway.

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

describe("Alibaba Cloud - Chat Completions", () => {
	beforeAll(() => {
		const apiKey = process.env.GATEWAY_API_KEY;
		if (!apiKey) {
			throw new Error("GATEWAY_API_KEY is required for provider tests");
		}
		assertSingaporeEndpointConfigured();
	});

	afterAll(() => {
		printTestSummary(context, "Alibaba Cloud Chat Completions");
	});

	describe("Model Matrix Smoke", () => {
		for (const model of CORE_TEXT_MODELS) {
			it(`completes a short request on ${model}`, async () => {
				const response: any = await runProtocol(CONFIG, "/chat/completions", {
					model,
					messages: [{ role: "user", content: "hi" }],
					max_tokens: 32,
					...PROVIDER_ONLY,
					...TESTING_BODY,
				}, { headers: ROUTING_HEADERS });

				expect(response.id).toBeDefined();
				expect(response.object).toBe("chat.completion");
				expect(response.choices?.length ?? 0).toBeGreaterThan(0);
				expect(response.choices[0]?.message?.role).toBe("assistant");
				expect(typeof response.choices[0]?.message?.content).toBe("string");
				expect(response.choices[0]?.message?.content?.length ?? 0).toBeGreaterThan(0);
				expectUsageTokens(response, context);
			});
		}
	});

	describe("Tools", () => {
		it("accepts tool definitions without upstream errors", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "What is the weather in Singapore?" }],
				tools: [TEST_TOOL_OPENAI],
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			expect(response.choices?.[0]?.message).toBeDefined();
			expectUsageTokens(response, context);
		});

		it("handles forced tool choice payload shape", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "Use the weather tool for Tokyo." }],
				tools: [TEST_TOOL_OPENAI],
				tool_choice: { type: "function", function: { name: "get_weather" } },
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			expect(response.choices?.[0]?.message).toBeDefined();
			const toolCalls = response.choices?.[0]?.message?.tool_calls;
			if (Array.isArray(toolCalls) && toolCalls.length > 0) {
				expect(toolCalls[0]?.function?.name).toBe("get_weather");
			}
			expectUsageTokens(response, context);
		});
	});

	describe("Reasoning and Vision", () => {
		it("handles reasoning-enabled request", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "What is 17 * 19? Think carefully." }],
				reasoning: { enabled: true },
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			const message = response.choices?.[0]?.message;
			expect(message).toBeDefined();
			expect(typeof message?.content).toBe("string");
			if (message?.reasoning_content !== undefined) {
				expect(typeof message.reasoning_content).toBe("string");
			}
			if (message?.reasoning_details !== undefined) {
				expect(Array.isArray(message.reasoning_details)).toBe(true);
			}
			expectUsageTokens(response, context);
		});

		it("handles vision input on a Qwen VL model", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: VISION_MODEL,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: "Describe this image in one sentence." },
							{ type: "image_url", image_url: { url: TEST_IMAGE_URL } },
						],
					},
				],
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			expect(response.choices?.[0]?.message).toBeDefined();
			expect(typeof response.choices?.[0]?.message?.content).toBe("string");
			expect(response.choices?.[0]?.message?.content?.length ?? 0).toBeGreaterThan(0);
			expectUsageTokens(response, context);
		});
	});

	describe("Streaming", () => {
		it("streams deltas for short requests", async () => {
			const result: any = await runProtocol(
				CONFIG,
				"/chat/completions",
				{
					model: CONFIG.baseModel,
					messages: [{ role: "user", content: "Say hello in 5 words." }],
					...PROVIDER_ONLY,
					...TESTING_BODY,
				},
				{ stream: true, headers: ROUTING_HEADERS },
			);

			expectStreamFrames(result.frames, context);
			const chunks = result.frames.filter((frame: any) => Array.isArray(frame?.choices));
			expect(chunks.length).toBeGreaterThan(0);
		});
	});

	describe("Response Format / Structured Output", () => {
		it("handles json_object response_format", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "Return only JSON with keys city and weather." }],
				response_format: { type: "json_object" },
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			const content = String(response?.choices?.[0]?.message?.content ?? "");
			expect(content.length).toBeGreaterThan(0);
			expectUsageTokens(response, context);
		});

		it("handles json_schema response_format", async () => {
			const response: any = await runProtocol(CONFIG, "/chat/completions", {
				model: CONFIG.baseModel,
				messages: [{ role: "user", content: "Return JSON only with keys city and weather. City must be London." }],
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

			const content = String(response?.choices?.[0]?.message?.content ?? "");
			expect(content.length).toBeGreaterThan(0);
			const parsed = parseJsonLoose(content);
			if (parsed) {
				expect(typeof parsed.city).toBe("string");
				expect(typeof parsed.weather).toBe("string");
			}
			expectUsageTokens(response, context);
		});
	});
});
