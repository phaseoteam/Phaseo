import type { OpenAICompatConfig } from "../openai-compatible/types";

export const POOLSIDE_OPENAI_COMPAT_CONFIGS = {
	poolside: {
		providerId: "poolside",
		baseUrl: "https://inference.poolside.ai",
		pathPrefix: "/openai/v1",
		apiKeyEnv: "POOLSIDE_API_KEY",
		baseUrlEnv: "POOLSIDE_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
