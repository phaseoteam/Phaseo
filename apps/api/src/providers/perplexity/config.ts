import type { OpenAICompatConfig } from "../openai-compatible/types";

export const PERPLEXITY_OPENAI_COMPAT_CONFIGS = {
	perplexity: {
		providerId: "perplexity",
		baseUrl: "https://api.perplexity.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "PERPLEXITY_API_KEY",
		baseUrlEnv: "PERPLEXITY_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
