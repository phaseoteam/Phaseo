import type { OpenAICompatConfig } from "../openai-compatible/types";

export const INFERMATIC_OPENAI_COMPAT_CONFIGS = {
	infermatic: {
		providerId: "infermatic",
		baseUrl: "https://api.totalgpt.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "INFERMATIC_API_KEY",
		baseUrlEnv: "INFERMATIC_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
