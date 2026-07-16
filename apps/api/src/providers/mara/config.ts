import type { OpenAICompatConfig } from "../openai-compatible/types";

export const MARA_OPENAI_COMPAT_CONFIGS = {
	mara: {
		providerId: "mara",
		baseUrl: "https://api.cloud.mara.com",
		pathPrefix: "/v1",
		apiKeyEnv: "MARA_API_KEY",
		baseUrlEnv: "MARA_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
