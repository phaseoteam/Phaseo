import type { OpenAICompatConfig } from "../openai-compatible/types";

export const FEATHERLESS_OPENAI_COMPAT_CONFIGS = {
	featherless: {
		providerId: "featherless",
		baseUrl: "https://api.featherless.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "FEATHERLESS_API_KEY",
		baseUrlEnv: "FEATHERLESS_BASE_URL",
		apiKeyHeader: "Authentication",
	},
} satisfies Record<string, OpenAICompatConfig>;
