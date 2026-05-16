import type { OpenAICompatConfig } from "../openai-compatible/types";

const common = {
	baseUrl: "https://api.novita.ai",
	pathPrefix: "/openai/v1",
	apiKeyEnv: "NOVITA_API_KEY",
	baseUrlEnv: "NOVITA_BASE_URL",
	supportsResponses: false,
} as const;

export const NOVITA_OPENAI_COMPAT_CONFIGS = {
	novitaai: {
		providerId: "novitaai",
		...common,
	},
	novita: {
		providerId: "novita",
		...common,
	},
} satisfies Record<string, OpenAICompatConfig>;
