import type { OpenAICompatConfig } from "../openai-compatible/types";

export const LIQUID_AI_OPENAI_COMPAT_CONFIGS = {
	liquid: {
		providerId: "liquid",
		baseUrl: "https://api.liquid.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "LIQUID_API_KEY",
		baseUrlEnv: "LIQUID_BASE_URL",
	},
	"liquid-ai": {
		providerId: "liquid-ai",
		baseUrl: "https://api.liquid.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "LIQUID_AI_API_KEY",
		baseUrlEnv: "LIQUID_AI_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
