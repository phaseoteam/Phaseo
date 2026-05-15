import type { OpenAICompatConfig } from "../openai-compatible/types";

export const GMI_CLOUD_API_KEY_ENVS = ["GMI_API_KEY", "GMI_CLOUD_API_KEY"] as const;

export const GMI_CLOUD_OPENAI_COMPAT_CONFIGS = {
	gmicloud: {
		providerId: "gmicloud",
		baseUrl: "https://api.gmi-serving.com",
		pathPrefix: "/v1",
		apiKeyEnv: "GMI_API_KEY",
		baseUrlEnv: "GMI_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
