import type { OpenAICompatConfig } from "../openai-compatible/types";

export const UPSTAGE_OPENAI_COMPAT_CONFIGS = {
	upstage: {
		providerId: "upstage",
		baseUrl: "https://api.upstage.ai",
		pathPrefix: "/v1/solar",
		apiKeyEnv: "UPSTAGE_API_KEY",
		baseUrlEnv: "UPSTAGE_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
