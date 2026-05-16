import type { OpenAICompatConfig } from "../openai-compatible/types";

export const INFLECTION_OPENAI_COMPAT_CONFIGS = {
	inflection: {
		providerId: "inflection",
		baseUrlEnv: "INFLECTION_BASE_URL",
		apiKeyEnv: "INFLECTION_API_KEY",
		pathPrefix: "/v1",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
