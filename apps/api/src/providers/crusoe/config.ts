import type { OpenAICompatConfig } from "../openai-compatible/types";

export const CRUSOE_OPENAI_COMPAT_CONFIGS = {
	crusoe: {
		providerId: "crusoe",
		baseUrl: "https://api.crusoe.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "CRUSOE_API_KEY",
		baseUrlEnv: "CRUSOE_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
