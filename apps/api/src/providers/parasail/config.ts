import type { OpenAICompatConfig } from "../openai-compatible/types";

export const PARASAIL_OPENAI_COMPAT_CONFIGS = {
	parasail: {
		providerId: "parasail",
		baseUrl: "https://api.parasail.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "PARASAIL_API_KEY",
		baseUrlEnv: "PARASAIL_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
