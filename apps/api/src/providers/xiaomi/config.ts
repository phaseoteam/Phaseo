import type { OpenAICompatConfig } from "../openai-compatible/types";

export const XIAOMI_OPENAI_COMPAT_CONFIGS = {
	xiaomi: {
		providerId: "xiaomi",
		pathPrefix: "/v1",
		baseUrl: "https://api.xiaomimimo.com",
		apiKeyEnv: "XIAOMI_MIMO_API_KEY",
		baseUrlEnv: "XIAOMI_MIMO_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
