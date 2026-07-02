import type { OpenAICompatConfig } from "../openai-compatible/types";

export const ARCEE_API_KEY_ENVS = ["ARCEE_AI_API_KEY", "ARCEE_API_KEY"] as const;

const common = {
	baseUrl: "https://api.arcee.ai",
	pathPrefix: "/api/v1",
	apiKeyEnv: "ARCEE_API_KEY",
	baseUrlEnv: "ARCEE_BASE_URL",
	supportsResponses: false,
} as const;

export const ARCEE_OPENAI_COMPAT_CONFIGS = {
	arcee: {
		providerId: "arcee",
		...common,
	},
	"arcee-ai": {
		providerId: "arcee-ai",
		...common,
	},
} satisfies Record<string, OpenAICompatConfig>;
