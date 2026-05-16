import type { OpenAICompatConfig } from "../openai-compatible/types";

export const COHERE_OPENAI_COMPAT_CONFIGS = {
	cohere: {
		providerId: "cohere",
		baseUrl: "https://api.cohere.ai",
		pathPrefix: "/compatibility/v1",
		apiKeyEnv: "COHERE_API_KEY",
		baseUrlEnv: "COHERE_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
