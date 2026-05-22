import type { OpenAICompatConfig } from "../openai-compatible/types";

export const FRIENDLI_OPENAI_COMPAT_CONFIGS = {
	friendli: {
		providerId: "friendli",
		baseUrl: "https://api.friendli.ai",
		pathPrefix: "/serverless/v1",
		apiKeyEnv: "FRIENDLI_TOKEN",
		baseUrlEnv: "FRIENDLI_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
