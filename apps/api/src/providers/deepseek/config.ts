import type { OpenAICompatConfig } from "../openai-compatible/types";

export const DEEPSEEK_OPENAI_COMPAT_CONFIGS = {
	deepseek: {
		providerId: "deepseek",
		baseUrl: "https://api.deepseek.com",
		pathPrefix: "/v1",
		apiKeyEnv: "DEEPSEEK_API_KEY",
		baseUrlEnv: "DEEPSEEK_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
