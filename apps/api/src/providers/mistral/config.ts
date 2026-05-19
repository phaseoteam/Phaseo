import type { OpenAICompatConfig } from "../openai-compatible/types";

export const MISTRAL_OPENAI_COMPAT_CONFIGS = {
	mistral: {
		providerId: "mistral",
		baseUrl: "https://api.mistral.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "MISTRAL_AI_API_KEY",
		baseUrlEnv: "MISTRAL_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
