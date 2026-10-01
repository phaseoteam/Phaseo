import type { OpenAICompatConfig } from "../openai-compatible/types";

export const OPENROUTER_OPENAI_COMPAT_CONFIGS = {
	openrouter: {
		providerId: "openrouter",
		baseUrl: "https://openrouter.ai/api/v1",
		apiKeyEnv: "OPENROUTER_API_KEY",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
