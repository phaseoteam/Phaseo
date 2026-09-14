import type { OpenAICompatConfig } from "../openai-compatible/types";

export const DOUBLEWORD_API_KEY_ENVS = [
	"DOUBLEWORD_API_KEY",
] as const;

export const DOUBLEWORD_OPENAI_COMPAT_CONFIGS = {
	doubleword: {
		providerId: "doubleword",
		baseUrl: "https://api.doubleword.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "DOUBLEWORD_API_KEY",
		baseUrlEnv: "DOUBLEWORD_BASE_URL",
		supportsResponses: true,
	},
} satisfies Record<string, OpenAICompatConfig>;
