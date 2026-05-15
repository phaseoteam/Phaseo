import type { OpenAICompatConfig } from "../openai-compatible/types";

export const GROQ_OPENAI_COMPAT_CONFIGS = {
	groq: {
		providerId: "groq",
		baseUrl: "https://api.groq.com",
		pathPrefix: "/openai/v1",
		apiKeyEnv: "GROQ_API_KEY",
		baseUrlEnv: "GROQ_BASE_URL",
		supportsResponses: true,
	},
} satisfies Record<string, OpenAICompatConfig>;
