import type { OpenAICompatConfig } from "../openai-compatible/types";

export const SAKANA_OPENAI_COMPAT_CONFIGS = {
	sakana: {
		providerId: "sakana",
		baseUrl: "https://api.sakana.ai",
		pathPrefix: "/v1",
		apiKeyEnv: ["SAKANA_API_KEY", "FUGU_API_KEY"],
		baseUrlEnv: ["SAKANA_BASE_URL", "FUGU_BASE_URL"],
		supportsResponses: true,
	},
} satisfies Record<string, OpenAICompatConfig>;
