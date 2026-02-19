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

		expect(resolveOpenAICompatRoute("arcee", "arcee-ai/coder-large")).toBe("chat");
		expect(resolveOpenAICompatRoute("arcee-ai", "coder-large")).toBe("chat");
		expect(resolveOpenAICompatRoute("baseten", "openai/gpt-oss-120b")).toBe("chat");
		expect(resolveOpenAICompatRoute("chutes", "Qwen/Qwen3-235B-A22B-Thinking-2507")).toBe("chat");
		expect(resolveOpenAICompatRoute("cohere", "command-a-03-2025")).toBe("chat");
		expect(resolveOpenAICompatRoute("deepinfra", "meta-llama/Meta-Llama-3.1-8B-Instruct")).toBe("chat");
		expect(resolveOpenAICompatRoute("friendli", "meta-llama-3.1-8b-instruct")).toBe("chat");
		expect(resolveOpenAICompatRoute("deepseek", "deepseek-chat")).toBe("chat");
		expect(resolveOpenAICompatRoute("minimax", "minimax-m2")).toBe("chat");
		expect(resolveOpenAICompatRoute("alibaba", "qwen3.5-plus")).toBe("responses");
		expect(resolveOpenAICompatRoute("qwen", "qwen3-max")).toBe("responses");
		expect(resolveOpenAICompatRoute("alibaba", "qwen3-max-2026-01-23")).toBe("responses");
		expect(resolveOpenAICompatRoute("qwen", "alibaba/qwen3.5-plus-2026-02-15")).toBe("responses");
		expect(resolveOpenAICompatRoute("alibaba", "qwen-plus")).toBe("responses");
		expect(resolveOpenAICompatRoute("qwen", "qwen-max-latest")).toBe("responses");
		expect(resolveOpenAICompatRoute("alibaba", "qwen3-max-preview")).toBe("responses");
		expect(resolveOpenAICompatRoute("alibaba", "qwen2.5-72b-instruct")).toBe("chat");
		expect(resolveOpenAICompatRoute("z-ai", "glm-4.6")).toBe("chat");
		expect(resolveOpenAICompatRoute("zai", "glm-4.6")).toBe("chat");
		expect(resolveOpenAICompatRoute("xiaomi", "MiMo-7B-RL")).toBe("chat");
		expect(resolveOpenAICompatRoute("mistral", "mistral-large-latest")).toBe("chat");
		expect(resolveOpenAICompatRoute("moonshot-ai", "kimi-k2")).toBe("chat");
		expect(resolveOpenAICompatRoute("novitaai", "deepseek/deepseek-r1-turbo")).toBe("chat");
		expect(resolveOpenAICompatRoute("perplexity", "sonar")).toBe("chat");
		expect(resolveOpenAICompatRoute("together", "meta-llama/Llama-3.3-70B-Instruct-Turbo")).toBe("chat");
		expect(resolveOpenAICompatRoute("cerebras", "llama3.1-70b")).toBe("chat");
		expect(resolveOpenAICompatRoute("fireworks", "accounts/fireworks/models/llama-v3p3-70b-instruct")).toBe("responses");
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

	it("uses dashscope responses prefix for alibaba responses endpoint", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			ALIBABA_API_KEY: "test-alibaba-key",
		} as any);

		expect(openAICompatUrl("alibaba", "/responses")).toBe(
			"https://dashscope-intl.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1/responses",
		);
		expect(openAICompatUrl("alibaba", "/chat/completions")).toBe(
			"https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
		);
	});

	it("trims chat prefix from alibaba base url override when building responses url", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			ALIBABA_API_KEY: "test-alibaba-key",
			ALIBABA_BASE_URL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
		} as any);

		expect(openAICompatUrl("alibaba", "/responses")).toBe(
			"https://dashscope-intl.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1/responses",
		);
		expect(openAICompatUrl("alibaba", "/chat/completions")).toBe(
			"https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
		);
	});

	it("builds arcee chat-completions endpoint with /api/v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			ARCEE_API_KEY: "test-arcee-key",
		} as any);

		expect(openAICompatUrl("arcee", "/chat/completions")).toBe(
			"https://api.arcee.ai/api/v1/chat/completions",
		);
		expect(openAICompatUrl("arcee-ai", "/chat/completions")).toBe(
			"https://api.arcee.ai/api/v1/chat/completions",
		);
	});

	it("builds cerebras chat-completions endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			CEREBRAS_API_KEY: "test-cerebras-key",
		} as any);

		expect(openAICompatUrl("cerebras", "/chat/completions")).toBe(
			"https://api.cerebras.ai/v1/chat/completions",
		);
	});

	it("builds deepseek chat-completions endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			DEEPSEEK_API_KEY: "test-deepseek-key",
		} as any);

		expect(openAICompatUrl("deepseek", "/chat/completions")).toBe(
			"https://api.deepseek.com/v1/chat/completions",
		);
	});

	it("builds baseten chat-completions endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			BASETEN_API_KEY: "test-baseten-key",
		} as any);

		expect(openAICompatUrl("baseten", "/chat/completions")).toBe(
			"https://api.baseten.co/v1/chat/completions",
		);
	});

	it("builds chutes chat-completions endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			CHUTES_API_KEY: "test-chutes-key",
		} as any);

		expect(openAICompatUrl("chutes", "/chat/completions")).toBe(
			"https://llm.chutes.ai/v1/chat/completions",
		);
	});

	it("builds cohere chat-completions endpoint with /compatibility/v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			COHERE_API_KEY: "test-cohere-key",
		} as any);

		expect(openAICompatUrl("cohere", "/chat/completions")).toBe(
			"https://api.cohere.ai/compatibility/v1/chat/completions",
		);
	});

	it("builds deepinfra chat-completions endpoint with /v1/openai prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			DEEPINFRA_API_KEY: "test-deepinfra-key",
		} as any);

		expect(openAICompatUrl("deepinfra", "/chat/completions")).toBe(
			"https://api.deepinfra.com/v1/openai/chat/completions",
		);
	});

	it("builds friendli chat-completions endpoint with default serverless path", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			FRIENDLI_TOKEN: "test-friendli-key",
		} as any);

		expect(openAICompatUrl("friendli", "/chat/completions")).toBe(
			"https://api.friendli.ai/serverless/v1/chat/completions",
		);
	});

	it("uses dedicated friendli endpoint when base URL already includes /dedicated/v1", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			FRIENDLI_TOKEN: "test-friendli-key",
			FRIENDLI_BASE_URL: "https://api.friendli.ai/dedicated/v1",
		} as any);

		expect(openAICompatUrl("friendli", "/chat/completions")).toBe(
			"https://api.friendli.ai/dedicated/v1/chat/completions",
		);
	});

	it("adds /v1 when friendli base URL only specifies dedicated mode", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			FRIENDLI_TOKEN: "test-friendli-key",
			FRIENDLI_BASE_URL: "https://api.friendli.ai/dedicated",
		} as any);

		expect(openAICompatUrl("friendli", "/chat/completions")).toBe(
			"https://api.friendli.ai/dedicated/v1/chat/completions",
		);
	});

	it("builds groq chat and responses endpoints with /openai/v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			GROQ_API_KEY: "test-groq-key",
		} as any);

		expect(openAICompatUrl("groq", "/chat/completions")).toBe(
			"https://api.groq.com/openai/v1/chat/completions",
		);
		expect(openAICompatUrl("groq", "/responses")).toBe(
			"https://api.groq.com/openai/v1/responses",
		);
	});

	it("builds z-ai chat endpoint with /api/paas/v4 prefix for both aliases", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			ZAI_API_KEY: "test-zai-key",
		} as any);

		expect(openAICompatUrl("z-ai", "/chat/completions")).toBe(
			"https://api.z.ai/api/paas/v4/chat/completions",
		);
		expect(openAICompatUrl("zai", "/chat/completions")).toBe(
			"https://api.z.ai/api/paas/v4/chat/completions",
		);
	});

	it("builds fireworks chat and responses endpoints with /inference/v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			FIREWORKS_API_KEY: "test-fireworks-key",
		} as any);

		expect(openAICompatUrl("fireworks", "/chat/completions")).toBe(
			"https://api.fireworks.ai/inference/v1/chat/completions",
		);
		expect(openAICompatUrl("fireworks", "/responses")).toBe(
			"https://api.fireworks.ai/inference/v1/responses",
		);
	});

	it("builds novita chat endpoint with /openai/v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			NOVITA_API_KEY: "test-novita-key",
		} as any);

		expect(openAICompatUrl("novitaai", "/chat/completions")).toBe(
			"https://api.novita.ai/openai/v1/chat/completions",
		);
	});

	it("builds perplexity chat endpoint without a path prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			PERPLEXITY_API_KEY: "test-perplexity-key",
		} as any);

		expect(openAICompatUrl("perplexity", "/chat/completions")).toBe(
			"https://api.perplexity.ai/chat/completions",
		);
	});

	it("builds together chat endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			TOGETHER_API_KEY: "test-together-key",
		} as any);

		expect(openAICompatUrl("together", "/chat/completions")).toBe(
			"https://api.together.xyz/v1/chat/completions",
		);
	});
});

