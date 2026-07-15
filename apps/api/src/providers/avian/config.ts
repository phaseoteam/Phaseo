import type { OpenAICompatConfig } from "../openai-compatible/types";

export const AVIAN_OPENAI_COMPAT_CONFIGS = {
	avian: {
		providerId: "avian",
		baseUrl: "https://api.avian.io",
		pathPrefix: "/v1",
		apiKeyEnv: "AVIAN_API_KEY",
		baseUrlEnv: "AVIAN_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
