import type { OpenAICompatConfig } from "../openai-compatible/types";

const common = {
	baseUrl: "https://api.venice.ai",
	pathPrefix: "/api/v1",
	apiKeyEnv: "VENICE_API_KEY",
	baseUrlEnv: "VENICE_BASE_URL",
	supportsResponses: true,
} as const;

export const VENICE_OPENAI_COMPAT_CONFIGS = {
	venice: {
		providerId: "venice",
		...common,
	},
	"venice-e2ee": {
		providerId: "venice-e2ee",
		...common,
	},
} satisfies Record<string, OpenAICompatConfig>;
