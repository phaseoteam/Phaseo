import type { OpenAICompatConfig } from "../openai-compatible/types";

const common = {
	baseUrl: "https://api.z.ai",
	pathPrefix: "/api/paas/v4",
	apiKeyEnv: "ZAI_API_KEY",
	baseUrlEnv: "ZAI_BASE_URL",
} as const;

export const Z_AI_OPENAI_COMPAT_CONFIGS = {
	"z-ai": {
		providerId: "z-ai",
		...common,
	},
	zai: {
		providerId: "zai",
		...common,
	},
} satisfies Record<string, OpenAICompatConfig>;
