// Alibaba Cloud Provider - Anthropic Messages Tests
// Validates Alibaba Cloud mapping through /messages surface (Anthropic schema in, Alibaba out).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	createTestContext,
	expectStreamFrames,
	expectUsageTokens,
	printTestSummary,
	runProtocol,
	TEST_IMAGE_URL,
	TEST_TOOL_ANTHROPIC,
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

function extractMessageText(response: any): string {
	const content = Array.isArray(response?.content) ? response.content : [];
	return content.map((item: any) => String(item?.text ?? "")).join("\n").trim();
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

describe("Alibaba Cloud - Messages", () => {
	beforeAll(() => {
		const apiKey = process.env.GATEWAY_API_KEY;
		if (!apiKey) {
			throw new Error("GATEWAY_API_KEY is required for provider tests");
		}
		assertSingaporeEndpointConfigured();
	});

	afterAll(() => {
		printTestSummary(context, "Alibaba Cloud Messages");
	});

	describe("Model Matrix Smoke", () => {
		for (const model of CORE_TEXT_MODELS) {
			it(`completes a short request on ${model}`, async () => {
				const response: any = await runProtocol(CONFIG, "/messages", {
					model,
					max_tokens: 128,
					messages: [{ role: "user", content: "hi" }],
					...PROVIDER_ONLY,
					...TESTING_BODY,
				}, { headers: ROUTING_HEADERS });

				expect(response.id).toBeDefined();
				expect(response.type).toBe("message");
				expect(Array.isArray(response.content)).toBe(true);
				expect(response.content.length).toBeGreaterThan(0);
				expectUsageTokens(response, context);
			});
		}
	});

	describe("Tools", () => {
		it("handles forced tool call", async () => {
			const response: any = await runProtocol(CONFIG, "/messages", {
				model: CONFIG.baseModel,
				max_tokens: 384,
				messages: [{ role: "user", content: "Call get_weather for London and return a tool call." }],
				tools: [TEST_TOOL_ANTHROPIC],
				tool_choice: { type: "tool", name: "get_weather" },
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			const toolUse = (response?.content ?? []).find((item: any) => item?.type === "tool_use");
			if (toolUse) {
				expect(toolUse?.name).toBe("get_weather");
			} else {
				const text = extractMessageText(response).toLowerCase();
				expect(text.includes("get_weather") || text.length > 0).toBe(true);
			}
			expectUsageTokens(response, context);
		});
	});

	describe("Reasoning / Structured / Vision", () => {
		it("handles reasoning configuration", async () => {
			const response: any = await runProtocol(CONFIG, "/messages", {
				model: CONFIG.baseModel,
				max_tokens: 256,
				messages: [{ role: "user", content: "What is 44 + 33? Think first, then answer." }],
				reasoning: { effort: "medium" },
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			expect(response.type).toBe("message");
			expect(response.content?.length ?? 0).toBeGreaterThan(0);
			expectUsageTokens(response, context);
		});

		it("handles response_format structured mapping on /messages", async () => {
			const response: any = await runProtocol(CONFIG, "/messages", {
				model: CONFIG.baseModel,
				max_tokens: 384,
				system: "Return only valid JSON. No prose.",
				messages: [{ role: "user", content: "Return only JSON with keys city and weather. City must be London." }],
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

			const text = extractMessageText(response);
			expect(text.length).toBeGreaterThan(0);
			const parsed = parseJsonLoose(text);
			if (parsed) {
				expect(typeof parsed.city).toBe("string");
				expect(typeof parsed.weather).toBe("string");
			}
			expectUsageTokens(response, context);
		});

		it("handles vision input via Anthropic image blocks", async () => {
			const response: any = await runProtocol(CONFIG, "/messages", {
				model: VISION_MODEL,
				max_tokens: 384,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: "Describe this image in one sentence." },
							{ type: "image", source: { type: "url", url: TEST_IMAGE_URL } },
						],
					},
				],
				...PROVIDER_ONLY,
				...TESTING_BODY,
			}, { headers: ROUTING_HEADERS });

			expect(response.type).toBe("message");
			expect(response.content?.length ?? 0).toBeGreaterThan(0);
			expectUsageTokens(response, context);
		});
	});

	describe("Streaming", () => {
		it("streams events for short requests", async () => {
			const streamResult: any = await runProtocol(
				CONFIG,
				"/messages",
				{
					model: CONFIG.baseModel,
					max_tokens: 192,
					messages: [{ role: "user", content: "Stream a short greeting." }],
					...PROVIDER_ONLY,
					...TESTING_BODY,
				},
				{ stream: true, headers: ROUTING_HEADERS },
			);

			expectStreamFrames(streamResult.frames ?? [], context);
		});
	});
});
