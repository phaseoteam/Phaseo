import type { OpenAICompatConfig } from "../openai-compatible/types";

export const SCALEWAY_OPENAI_COMPAT_CONFIGS = {
	scaleway: {
		providerId: "scaleway",
		baseUrl: "https://api.scaleway.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "SCW_SECRET_KEY",
		baseUrlEnv: "SCALEWAY_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
