import type { OpenAICompatConfig } from "../openai-compatible/types";

export const DEEPINFRA_OPENAI_COMPAT_CONFIGS = {
	deepinfra: {
		providerId: "deepinfra",
		baseUrl: "https://api.deepinfra.com",
		pathPrefix: "/v1/openai",
		apiKeyEnv: "DEEPINFRA_API_KEY",
		baseUrlEnv: "DEEPINFRA_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
