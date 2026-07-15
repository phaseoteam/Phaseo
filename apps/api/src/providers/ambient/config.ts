import type { OpenAICompatConfig } from "../openai-compatible/types";

export const AMBIENT_OPENAI_COMPAT_CONFIGS = {
	ambient: {
		providerId: "ambient",
		baseUrl: "https://api.ambient.xyz",
		pathPrefix: "/v1",
		apiKeyEnv: "AMBIENT_API_KEY",
		baseUrlEnv: "AMBIENT_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
