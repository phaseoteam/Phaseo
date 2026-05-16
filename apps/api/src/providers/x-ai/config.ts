import type { OpenAICompatConfig } from "../openai-compatible/types";

const common = {
	baseUrl: "https://api.x.ai",
	pathPrefix: "/v1",
	apiKeyEnv: "X_AI_API_KEY",
	baseUrlEnv: "XAI_BASE_URL",
	supportsResponses: true,
} as const;

export const X_AI_OPENAI_COMPAT_CONFIGS = {
	"x-ai": {
		providerId: "x-ai",
		...common,
	},
	xai: {
		providerId: "xai",
		...common,
	},
} satisfies Record<string, OpenAICompatConfig>;
