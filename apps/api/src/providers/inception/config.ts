import type { OpenAICompatConfig } from "../openai-compatible/types";

export const INCEPTION_OPENAI_COMPAT_CONFIGS = {
	inception: {
		providerId: "inception",
		baseUrl: "https://api.inceptionlabs.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "INCEPTION_API_KEY",
		baseUrlEnv: "INCEPTION_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
