import type { OpenAICompatConfig } from "../openai-compatible/types";

export const DECART_OPENAI_COMPAT_CONFIGS = {
	decart: {
		providerId: "decart",
		apiKeyEnv: "DECART_API_KEY",
		baseUrlEnv: "DECART_BASE_URL",
		pathPrefix: "/v1",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
