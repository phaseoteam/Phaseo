import type { OpenAICompatConfig } from "../openai-compatible/types";

export const INCEPTRON_OPENAI_COMPAT_CONFIGS = {
	inceptron: {
		providerId: "inceptron",
		baseUrl: "https://api.inceptron.io",
		pathPrefix: "/v1",
		apiKeyEnv: "INCEPTRON_API_KEY",
		baseUrlEnv: "INCEPTRON_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
