import type { OpenAICompatConfig } from "../openai-compatible/types";

export const AKASHML_OPENAI_COMPAT_CONFIGS = {
	akashml: {
		providerId: "akashml",
		baseUrl: "https://api.akashml.com",
		pathPrefix: "/v1",
		apiKeyEnv: "AKASHML_API_KEY",
		baseUrlEnv: "AKASHML_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
