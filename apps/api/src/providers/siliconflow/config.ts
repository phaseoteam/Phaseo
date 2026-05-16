import type { OpenAICompatConfig } from "../openai-compatible/types";

export const SILICONFLOW_OPENAI_COMPAT_CONFIGS = {
	siliconflow: {
		providerId: "siliconflow",
		baseUrl: "https://api.siliconflow.com",
		pathPrefix: "/v1",
		apiKeyEnv: "SILICONFLOW_API_KEY",
		baseUrlEnv: "SILICONFLOW_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
