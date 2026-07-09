import type { OpenAICompatConfig } from "../openai-compatible/types";

export const META_OPENAI_COMPAT_CONFIGS = {
	meta: {
		providerId: "meta",
		baseUrl: "https://api.llama.com/compat",
		pathPrefix: "/v1",
		apiKeyEnv: "META_MODEL_API_KEY",
		baseUrlEnv: "META_MODEL_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
