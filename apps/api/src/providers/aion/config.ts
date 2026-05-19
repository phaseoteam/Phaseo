import type { OpenAICompatConfig } from "../openai-compatible/types";

const common = {
	baseUrl: "https://api.aionlabs.ai",
	pathPrefix: "/v1",
	apiKeyEnv: "AION_LABS_API_KEY",
	baseUrlEnv: "AION_LABS_BASE_URL",
} as const;

export const AION_OPENAI_COMPAT_CONFIGS = {
	aionlabs: {
		providerId: "aionlabs",
		...common,
	},
	"aion-labs": {
		providerId: "aion-labs",
		...common,
	},
} satisfies Record<string, OpenAICompatConfig>;
