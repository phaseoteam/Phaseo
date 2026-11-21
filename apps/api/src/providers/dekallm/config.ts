import type { OpenAICompatConfig } from "../openai-compatible/types";

// Deka LLM by Lintasarta Cloudeka (https://docs.cloudeka.ai/deka-llm/introduction):
// OpenAI-compatible, bearer auth, base https://dekallm.cloudeka.ai/v1. Hosted in Indonesia.
export const DEKALLM_OPENAI_COMPAT_CONFIGS = {
	dekallm: {
		providerId: "dekallm",
		baseUrl: "https://dekallm.cloudeka.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "DEKALLM_API_KEY",
		baseUrlEnv: "DEKALLM_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
