import type { OpenAICompatConfig } from "../openai-compatible/types";

const common = {
	baseUrl: "https://api.voyageai.com",
	pathPrefix: "/v1",
	apiKeyEnv: "VOYAGE_API_KEY",
	baseUrlEnv: "VOYAGE_BASE_URL",
	supportsResponses: false,
} as const;

export const VOYAGE_OPENAI_COMPAT_CONFIGS = {
	voyage: {
		providerId: "voyage",
		...common,
	},
	voyageai: {
		providerId: "voyageai",
		...common,
	},
} satisfies Record<string, OpenAICompatConfig>;
