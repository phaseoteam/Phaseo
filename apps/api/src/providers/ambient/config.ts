import type { OpenAICompatConfig } from "../openai-compatible/types";

export const AMBIENT_OPENAI_COMPAT_CONFIGS = {
	ambient: {
		providerId: "ambient",
		apiKeyEnv: "AMBIENT_API_KEY",
		baseUrlEnv: "AMBIENT_BASE_URL",
		pathPrefix: "/v1",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
