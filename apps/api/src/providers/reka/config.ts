import type { OpenAICompatConfig } from "../openai-compatible/types";

export const REKA_OPENAI_COMPAT_CONFIGS = {
	reka: {
		providerId: "reka",
		baseUrl: "https://api.reka.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "REKA_API_KEY",
		baseUrlEnv: "REKA_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
