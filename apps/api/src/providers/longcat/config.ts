import type { OpenAICompatConfig } from "../openai-compatible/types";

export const LONGCAT_OPENAI_COMPAT_CONFIGS = {
	longcat: {
		providerId: "longcat",
		baseUrl: "https://api.longcat.chat",
		pathPrefix: "/openai/v1",
		apiKeyEnv: ["MEITUAN_API_KEY", "LONGCAT_API_KEY"],
		baseUrlEnv: ["MEITUAN_BASE_URL", "LONGCAT_BASE_URL"],
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
