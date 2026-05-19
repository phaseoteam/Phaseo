import type { OpenAICompatConfig } from "../openai-compatible/types";

export const MORPH_OPENAI_COMPAT_CONFIGS = {
	morph: {
		providerId: "morph",
		baseUrl: "https://api.morphllm.com",
		pathPrefix: "/v1",
		apiKeyEnv: "MORPH_API_KEY",
		baseUrlEnv: "MORPH_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
