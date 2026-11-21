import type { OpenAICompatConfig } from "../openai-compatible/types";

// River (https://river.ai/api): OpenAI-compatible client with RIVER_API_KEY, host https://api.river.ai/v1.
// Dedicated deployments get their own base URL; set RIVER_BASE_URL to point at one.
export const RIVER_OPENAI_COMPAT_CONFIGS = {
	river: {
		providerId: "river",
		baseUrl: "https://api.river.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "RIVER_API_KEY",
		baseUrlEnv: "RIVER_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
