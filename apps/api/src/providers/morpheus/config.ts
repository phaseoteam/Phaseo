import type { OpenAICompatConfig } from "../openai-compatible/types";

export const MORPHEUS_OPENAI_COMPAT_CONFIGS = {
	morpheus: {
		providerId: "morpheus",
		baseUrl: "https://api.mor.org",
		pathPrefix: "/api/v1",
		apiKeyEnv: "MORPHEUS_API_KEY",
		baseUrlEnv: "MORPHEUS_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
