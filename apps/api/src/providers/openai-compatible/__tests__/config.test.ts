// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openAICompatUrl, resolveOpenAICompatRoute } from "../config";
import { setupRuntimeFromEnv, setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("resolveOpenAICompatRoute", () => {
	it("routes openai chat-only models to chat", () => {
		expect(resolveOpenAICompatRoute("openai", "openai/gpt-audio")).toBe("chat");
		expect(resolveOpenAICompatRoute("openai", "gpt-audio-mini")).toBe("chat");
	});

	it("routes openai legacy models to legacy completions", () => {
		expect(resolveOpenAICompatRoute("openai", "openai/babbage-002")).toBe("legacy_completions");
		expect(resolveOpenAICompatRoute("openai", "davinci-002")).toBe("legacy_completions");
	});

	it("routes xai aliases to responses", () => {
		expect(resolveOpenAICompatRoute("x-ai", "grok-4")).toBe("responses");
		expect(resolveOpenAICompatRoute("xai", "grok-4")).toBe("responses");
	});

	it("routes production provider set to expected upstream route", () => {
		expect(resolveOpenAICompatRoute("openai", "gpt-4.1")).toBe("responses");
		expect(resolveOpenAICompatRoute("x-ai", "grok-4")).toBe("responses");
		expect(resolveOpenAICompatRoute("xai", "grok-4")).toBe("responses");

		expect(resolveOpenAICompatRoute("deepseek", "deepseek-chat")).toBe("chat");
		expect(resolveOpenAICompatRoute("minimax", "minimax-m2")).toBe("chat");
		expect(resolveOpenAICompatRoute("alibaba", "qwen-plus")).toBe("chat");
		expect(resolveOpenAICompatRoute("qwen", "qwen-plus")).toBe("chat");
		expect(resolveOpenAICompatRoute("z-ai", "glm-4.6")).toBe("chat");
		expect(resolveOpenAICompatRoute("zai", "glm-4.6")).toBe("chat");
		expect(resolveOpenAICompatRoute("xiaomi", "MiMo-7B-RL")).toBe("chat");
		expect(resolveOpenAICompatRoute("moonshot-ai", "kimi-k2")).toBe("chat");
		expect(resolveOpenAICompatRoute("cerebras", "llama3.1-70b")).toBe("chat");
		expect(resolveOpenAICompatRoute("groq", "llama-3.3-70b-versatile")).toBe("responses");
		expect(resolveOpenAICompatRoute("amazon-bedrock", "anthropic.claude-3-5-sonnet-20240620-v1:0")).toBe("chat");
		expect(resolveOpenAICompatRoute("google-vertex", "claude-sonnet-4@20250514")).toBe("chat");
	});
});

describe("openAICompatUrl", () => {
	it("does not duplicate the configured prefix when base URL already includes it", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			OPENAI_API_KEY: "test-openai-key",
			OPENAI_BASE_URL: "https://api.openai.com/v1",
		} as any);

		expect(openAICompatUrl("openai", "/chat/completions")).toBe(
			"https://api.openai.com/v1/chat/completions",
		);
	});
});

