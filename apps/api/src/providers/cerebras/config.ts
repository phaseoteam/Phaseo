import type { OpenAICompatConfig } from "../openai-compatible/types";

export const CEREBRAS_OPENAI_COMPAT_CONFIGS = {
	cerebras: {
		providerId: "cerebras",
		baseUrl: "https://api.cerebras.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "CEREBRAS_API_KEY",
		baseUrlEnv: "CEREBRAS_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
