import type { OpenAICompatConfig } from "../openai-compatible/types";

export const SAMBANOVA_OPENAI_COMPAT_CONFIGS = {
	sambanova: {
		providerId: "sambanova",
		apiKeyEnv: "SAMBANOVA_API_KEY",
		baseUrlEnv: "SAMBANOVA_BASE_URL",
		pathPrefix: "",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
