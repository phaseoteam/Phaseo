import type { OpenAICompatConfig } from "../openai-compatible/types";

export const TOGETHER_OPENAI_COMPAT_CONFIGS = {
	together: {
		providerId: "together",
		baseUrl: "https://api.together.xyz",
		pathPrefix: "/v1",
		apiKeyEnv: "TOGETHER_API_KEY",
		baseUrlEnv: "TOGETHER_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
