import type { OpenAICompatConfig } from "../openai-compatible/types";

export const BASETEN_OPENAI_COMPAT_CONFIGS = {
	baseten: {
		providerId: "baseten",
		baseUrl: "https://inference.baseten.co",
		pathPrefix: "/v1",
		apiKeyEnv: "BASETEN_API_KEY",
		baseUrlEnv: "BASETEN_BASE_URL",
		apiKeyPrefix: "Api-Key ",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
