import type { OpenAICompatConfig } from "../openai-compatible/types";

export const IONROUTER_OPENAI_COMPAT_CONFIGS = {
	ionrouter: {
		providerId: "ionrouter",
		baseUrl: "https://api.ionrouter.io",
		pathPrefix: "/v1",
		apiKeyEnv: "IONROUTER_API_KEY",
		baseUrlEnv: "IONROUTER_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
