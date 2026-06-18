// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey, resolveOpenAICompatRoute } from "../config";
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

	it("routes openai legacy text-completion models to chat", () => {
		expect(resolveOpenAICompatRoute("openai", "openai/babbage-002")).toBe("chat");
		expect(resolveOpenAICompatRoute("openai", "davinci-002")).toBe("chat");
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
			expect(resolveOpenAICompatRoute("akashml", "DeepSeek-V3.2")).toBe("chat");
			expect(resolveOpenAICompatRoute("baseten", "openai/gpt-oss-120b")).toBe("chat");
			expect(resolveOpenAICompatRoute("byteplus", "deepseek-v3.2")).toBe("chat");
		expect(resolveOpenAICompatRoute("chutes", "Qwen/Qwen3-235B-A22B-Thinking-2507")).toBe("chat");
		expect(resolveOpenAICompatRoute("cohere", "command-a-03-2025")).toBe("chat");
			expect(resolveOpenAICompatRoute("deepinfra", "meta-llama/Meta-Llama-3.1-8B-Instruct")).toBe("chat");
			expect(resolveOpenAICompatRoute("friendli", "meta-llama-3.1-8b-instruct")).toBe("chat");
			expect(resolveOpenAICompatRoute("gmicloud", "Qwen/Qwen3-235B-A22B-Thinking-2507")).toBe("chat");
			expect(resolveOpenAICompatRoute("deepseek", "deepseek-chat")).toBe("chat");
			expect(resolveOpenAICompatRoute("tensorix", "z-ai/glm-5")).toBe("chat");
				expect(resolveOpenAICompatRoute("ionrouter", "qwen3.5-122b-a10b")).toBe("chat");
				expect(resolveOpenAICompatRoute("longcat", "LongCat-Flash-Chat")).toBe("chat");
				expect(resolveOpenAICompatRoute("nebius-token-factory", "nvidia/nemotron-3-super-120b-a12b")).toBe("chat");
				expect(resolveOpenAICompatRoute("nebius-token-factory-eu-north-1", "nvidia/nemotron-3-super-120b-a12b")).toBe("chat");
				expect(resolveOpenAICompatRoute("nebius-token-factory-us-central-1", "nvidia/nemotron-3-super-120b-a12b")).toBe("chat");
			expect(resolveOpenAICompatRoute("minimax", "minimax-m2")).toBe("chat");
		expect(resolveOpenAICompatRoute("alibaba-cloud", "qwen3.5-plus")).toBe("responses");
		expect(resolveOpenAICompatRoute("z-ai", "glm-4.6")).toBe("chat");
		expect(resolveOpenAICompatRoute("zai", "glm-4.6")).toBe("chat");
		expect(resolveOpenAICompatRoute("xiaomi", "MiMo-7B-RL")).toBe("chat");
		expect(resolveOpenAICompatRoute("mistral", "mistral-large-latest")).toBe("chat");
		expect(resolveOpenAICompatRoute("moonshot-ai", "kimi-k2")).toBe("chat");
		expect(resolveOpenAICompatRoute("novitaai", "deepseek/deepseek-r1-turbo")).toBe("chat");
		expect(resolveOpenAICompatRoute("ovhcloud", "Qwen3-32B")).toBe("chat");
		expect(resolveOpenAICompatRoute("perplexity", "sonar")).toBe("chat");
		expect(resolveOpenAICompatRoute("poolside", "poolside/laguna-m.1")).toBe("chat");
		expect(resolveOpenAICompatRoute("scaleway", "llama-3.3-70b-instruct")).toBe("chat");
		expect(resolveOpenAICompatRoute("together", "meta-llama/Llama-3.3-70B-Instruct-Turbo")).toBe("chat");
		expect(resolveOpenAICompatRoute("venice", "venice-uncensored")).toBe("responses");
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

	it("builds the openai-eu chat-completions endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			OPENAI_API_KEY: "test-openai-key",
		} as any);

		expect(openAICompatUrl("openai-eu", "/chat/completions")).toBe(
			"https://api.openai.com/v1/chat/completions",
		);
	});

	it("uses dashscope responses prefix for alibaba-cloud responses endpoint", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			ALIBABA_CLOUD_API_KEY: "test-alibaba-cloud-key",
		} as any);

		expect(openAICompatUrl("alibaba-cloud", "/responses")).toBe(
			"https://dashscope-intl.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1/responses",
		);
		expect(openAICompatUrl("alibaba-cloud", "/chat/completions")).toBe(
			"https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
		);
	});

	it("trims chat prefix from alibaba-cloud base url override when building responses url", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			ALIBABA_CLOUD_API_KEY: "test-alibaba-cloud-key",
			ALIBABA_BASE_URL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
		} as any);

		expect(openAICompatUrl("alibaba-cloud", "/responses")).toBe(
			"https://dashscope-intl.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1/responses",
		);
		expect(openAICompatUrl("alibaba-cloud", "/chat/completions")).toBe(
			"https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
		);
	});

	it("trims responses prefix from alibaba-cloud base url override when building chat url", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			ALIBABA_CLOUD_API_KEY: "test-alibaba-cloud-key",
			ALIBABA_BASE_URL: "https://dashscope-intl.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1",
		} as any);

		expect(openAICompatUrl("alibaba-cloud", "/chat/completions")).toBe(
			"https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
		);
		expect(openAICompatUrl("alibaba-cloud", "/responses")).toBe(
			"https://dashscope-intl.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1/responses",
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
			"https://inference.baseten.co/v1/chat/completions",
		);
	});

	it("builds byteplus chat-completions endpoint with /api/v3 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			BYTEPLUS_API_KEY: "test-byteplus-key",
		} as any);

		expect(openAICompatUrl("byteplus", "/chat/completions")).toBe(
			"https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions",
		);
		expect(openAICompatUrl("bytedance-seed", "/chat/completions")).toBe(
			"https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions",
		);
	});

	it("builds longcat chat-completions endpoint with /openai/v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			LONGCAT_API_KEY: "test-longcat-key",
		} as any);

		expect(openAICompatUrl("longcat", "/chat/completions")).toBe(
			"https://api.longcat.chat/openai/v1/chat/completions",
		);
	});

	it("uses Api-Key Authorization prefix for baseten", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			BASETEN_API_KEY: "test-baseten-key",
		} as any);

		expect(openAICompatHeaders("baseten", "test-baseten-key")).toEqual(
			expect.objectContaining({
				Authorization: "Api-Key test-baseten-key",
				"Content-Type": "application/json",
			}),
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

	it("builds voyage chat and embeddings endpoints with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		expect(openAICompatUrl("voyage", "/chat/completions")).toBe(
			"https://api.voyageai.com/v1/chat/completions",
		);
		expect(openAICompatUrl("voyage", "/embeddings")).toBe(
			"https://api.voyageai.com/v1/embeddings",
		);
		expect(openAICompatUrl("voyageai", "/embeddings")).toBe(
			"https://api.voyageai.com/v1/embeddings",
		);
		expect(openAICompatUrl("voyage", "/rerank")).toBe(
			"https://api.voyageai.com/v1/rerank",
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

	it("builds gmicloud chat endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			GMI_API_KEY: "test-gmi-key",
		} as any);

		expect(openAICompatUrl("gmicloud", "/chat/completions")).toBe(
			"https://api.gmi-serving.com/v1/chat/completions",
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
		expect(openAICompatUrl("novita", "/chat/completions")).toBe(
			"https://api.novita.ai/openai/v1/chat/completions",
		);
	});

	it("builds perplexity chat and embeddings endpoints with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			PERPLEXITY_API_KEY: "test-perplexity-key",
		} as any);

		expect(openAICompatUrl("perplexity", "/chat/completions")).toBe(
			"https://api.perplexity.ai/v1/chat/completions",
		);
		expect(openAICompatUrl("perplexity", "/embeddings")).toBe(
			"https://api.perplexity.ai/v1/embeddings",
		);
	});

	it("builds poolside chat-completions endpoint with /openai/v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			POOLSIDE_API_KEY: "test-poolside-key",
		} as any);

		expect(openAICompatUrl("poolside", "/chat/completions")).toBe(
			"https://inference.poolside.ai/openai/v1/chat/completions",
		);
	});

	it("does not duplicate the poolside openai prefix when the base url override already includes it", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			POOLSIDE_API_KEY: "test-poolside-key",
			POOLSIDE_BASE_URL: "https://poolside.example/openai/v1",
		} as any);

		expect(openAICompatUrl("poolside", "/chat/completions")).toBe(
			"https://poolside.example/openai/v1/chat/completions",
		);
	});

	it("builds ovhcloud chat-completions endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			OVH_AI_ENDPOINTS_ACCESS_TOKEN: "test-ovh-key",
		} as any);

		expect(openAICompatUrl("ovhcloud", "/chat/completions")).toBe(
			"https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",
		);
		expect(openAICompatUrl("ovhcloud", "/embeddings")).toBe(
			"https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/embeddings",
		);
	});

	it("builds scaleway chat-completions endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			SCW_SECRET_KEY: "test-scaleway-key",
		} as any);

		expect(openAICompatUrl("scaleway", "/chat/completions")).toBe(
			"https://api.scaleway.ai/v1/chat/completions",
		);
		expect(openAICompatUrl("scaleway", "/embeddings")).toBe(
			"https://api.scaleway.ai/v1/embeddings",
		);
	});

	it("builds together chat endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			TOGETHER_API_KEY: "test-together-key",
		} as any);

		expect(openAICompatUrl("together", "/chat/completions")).toBe(
			"https://api.together.ai/v1/chat/completions",
		);
	});

	it("builds akashml chat endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AKASHML_API_KEY: "test-akashml-key",
		} as any);

		expect(openAICompatUrl("akashml", "/chat/completions")).toBe(
			"https://api.akashml.com/v1/chat/completions",
		);
	});

	it("builds ionrouter chat endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			IONROUTER_API_KEY: "test-ionrouter-key",
		} as any);

		expect(openAICompatUrl("ionrouter", "/chat/completions")).toBe(
			"https://api.ionrouter.io/v1/chat/completions",
		);
	});

	it("builds nebius regional chat endpoints with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			NEBIUS_API_KEY: "test-nebius-key",
		} as any);

		expect(openAICompatUrl("nebius-token-factory", "/chat/completions")).toBe(
			"https://api.tokenfactory.nebius.com/v1/chat/completions",
		);
		expect(openAICompatUrl("nebius-token-factory-eu-north-1", "/chat/completions")).toBe(
			"https://api.tokenfactory.nebius.com/v1/chat/completions",
		);
		expect(openAICompatUrl("nebius-token-factory-us-central-1", "/chat/completions")).toBe(
			"https://api.tokenfactory.nebius.com/v1/chat/completions",
		);
	});

	it("uses regional Nebius base URL overrides with NEBIUS_BASE_URL fallback", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			NEBIUS_API_KEY: "test-nebius-key",
			NEBIUS_BASE_URL: "https://global.api.nebius.example",
			NEBIUS_EU_NORTH_1_BASE_URL: "https://eu-north-1.api.nebius.example",
			NEBIUS_US_CENTRAL_1_BASE_URL: "https://us-central-1.api.nebius.example",
		} as any);

		expect(openAICompatUrl("nebius-token-factory", "/chat/completions")).toBe(
			"https://global.api.nebius.example/v1/chat/completions",
		);
		expect(openAICompatUrl("nebius-token-factory-eu-north-1", "/chat/completions")).toBe(
			"https://eu-north-1.api.nebius.example/v1/chat/completions",
		);
		expect(openAICompatUrl("nebius-token-factory-us-central-1", "/chat/completions")).toBe(
			"https://us-central-1.api.nebius.example/v1/chat/completions",
		);
	});

	it("builds the google-vertex-eu chat-completions endpoint without a path prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			GOOGLE_VERTEX_API_KEY: "test-google-vertex-key",
			GOOGLE_VERTEX_BASE_URL: "https://europe-west4-aiplatform.googleapis.com",
		} as any);

		expect(openAICompatUrl("google-vertex-eu", "/chat/completions")).toBe(
			"https://europe-west4-aiplatform.googleapis.com/chat/completions",
		);
	});

	it("builds venice chat and responses endpoints with /api/v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			VENICE_API_KEY: "test-venice-key",
		} as any);

		expect(openAICompatUrl("venice", "/chat/completions")).toBe(
			"https://api.venice.ai/api/v1/chat/completions",
		);
		expect(openAICompatUrl("venice", "/responses")).toBe(
			"https://api.venice.ai/api/v1/responses",
		);
	});

	it("uses VENICE_BASE_URL override for venice endpoints", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			VENICE_API_KEY: "test-venice-key",
			VENICE_BASE_URL: "https://api.venice.example",
		} as any);

		expect(openAICompatUrl("venice", "/chat/completions")).toBe(
			"https://api.venice.example/api/v1/chat/completions",
		);
	});

	it("builds weights-and-biases chat endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			WEIGHTSANDBIASES_API_KEY: "test-wandb-key",
		} as any);

		expect(openAICompatUrl("weights-and-biases", "/chat/completions")).toBe(
			"https://api.inference.wandb.ai/v1/chat/completions",
		);
	});
});

describe("resolveOpenAICompatKey", () => {
	it("uses WEIGHTSANDBIASES_API_KEY for weights-and-biases", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			WEIGHTSANDBIASES_API_KEY: "test-wandb-key",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "weights-and-biases",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-wandb-key");
		expect(resolved.source).toBe("gateway");
	});

	it("accepts WANDB_API_KEY fallback for weights-and-biases", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			WANDB_API_KEY: "test-wandb-key-fallback",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "weights-and-biases",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-wandb-key-fallback");
		expect(resolved.source).toBe("gateway");
	});

	it("prefers WEIGHTSANDBIASES_API_KEY over WANDB_API_KEY for weights-and-biases", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			WEIGHTSANDBIASES_API_KEY: "test-wandb-key-primary",
			WANDB_API_KEY: "test-wandb-key-fallback",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "weights-and-biases",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-wandb-key-primary");
		expect(resolved.source).toBe("gateway");
	});

	it("uses ALIBABA_CLOUD_API_KEY for alibaba-cloud", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			ALIBABA_CLOUD_API_KEY: "test-alibaba-cloud-key",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "alibaba-cloud",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-alibaba-cloud-key");
		expect(resolved.source).toBe("gateway");
	});

	it("uses VOYAGE_API_KEY for voyage and voyageai", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const voyageResolved = resolveOpenAICompatKey({
			providerId: "voyage",
			byokMeta: [],
		} as any);
		const voyageAiResolved = resolveOpenAICompatKey({
			providerId: "voyageai",
			byokMeta: [],
		} as any);

		expect(voyageResolved.key).toBe("test-voyage-key");
		expect(voyageResolved.source).toBe("gateway");
		expect(voyageAiResolved.key).toBe("test-voyage-key");
		expect(voyageAiResolved.source).toBe("gateway");
	});

	it("uses ARCEE_API_KEY for arcee-ai", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			ARCEE_API_KEY: "test-arcee-key",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "arcee-ai",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-arcee-key");
		expect(resolved.source).toBe("gateway");
	});

	it("uses GMI_API_KEY for gmicloud", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			GMI_API_KEY: "test-gmi-key",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "gmicloud",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-gmi-key");
		expect(resolved.source).toBe("gateway");
	});

	it("uses AKASHML_API_KEY for akashml", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AKASHML_API_KEY: "test-akashml-key",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "akashml",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-akashml-key");
		expect(resolved.source).toBe("gateway");
	});

	it("uses IONROUTER_API_KEY for ionrouter", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			IONROUTER_API_KEY: "test-ionrouter-key",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "ionrouter",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-ionrouter-key");
		expect(resolved.source).toBe("gateway");
	});

	it("builds tensorix chat-completions endpoint with /v1 prefix", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			TENSORIX_API_KEY: "test-tensorix-key",
		} as any);

		expect(openAICompatUrl("tensorix", "/chat/completions")).toBe(
			"https://api.tensorix.ai/v1/chat/completions",
		);
	});

	it("uses CROFAI_API_KEY for crofai", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			CROFAI_API_KEY: "test-crof-key",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "crofai",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-crof-key");
		expect(resolved.source).toBe("gateway");
	});

	it("uses NEBIUS_API_KEY for Nebius providers", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			NEBIUS_API_KEY: "test-nebius-key",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "nebius-token-factory-eu-north-1",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-nebius-key");
		expect(resolved.source).toBe("gateway");
	});

	it("uses fallback BytePlus key env aliases", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			ARK_API_KEY: "test-ark-key",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "byteplus",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-ark-key");
		expect(resolved.source).toBe("gateway");
	});
});
