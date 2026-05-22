import type { OpenAICompatConfig } from "../openai-compatible/types";

export const CHUTES_OPENAI_COMPAT_CONFIGS = {
	chutes: {
		providerId: "chutes",
		baseUrl: "https://llm.chutes.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "CHUTES_API_KEY",
		baseUrlEnv: "CHUTES_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
