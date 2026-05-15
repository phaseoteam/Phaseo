import type { OpenAICompatConfig } from "../openai-compatible/types";

export const RELACE_OPENAI_COMPAT_CONFIGS = {
	relace: {
		providerId: "relace",
		baseUrl: "https://api.relace.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "RELACE_API_KEY",
		baseUrlEnv: "RELACE_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
