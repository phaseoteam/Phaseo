import type { OpenAICompatConfig } from "../openai-compatible/types";

export const SOURCEFUL_OPENAI_COMPAT_CONFIGS = {
	sourceful: {
		providerId: "sourceful",
		baseUrl: "https://api.sourceful.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "SOURCEFUL_API_KEY",
		baseUrlEnv: "SOURCEFUL_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
