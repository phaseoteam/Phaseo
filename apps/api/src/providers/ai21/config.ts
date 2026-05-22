import type { OpenAICompatConfig } from "../openai-compatible/types";

export const AI21_OPENAI_COMPAT_CONFIGS = {
	ai21: {
		providerId: "ai21",
		baseUrl: "https://api.ai21.com",
		pathPrefix: "/studio/v1",
		apiKeyEnv: "AI21_API_KEY",
		baseUrlEnv: "AI21_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
