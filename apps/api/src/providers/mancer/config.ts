import type { OpenAICompatConfig } from "../openai-compatible/types";

export const MANCER_OPENAI_COMPAT_CONFIGS = {
	mancer: {
		providerId: "mancer",
		baseUrl: "https://mancer.tech",
		pathPrefix: "/oai/v1",
		apiKeyEnv: "MANCER_API_KEY",
		baseUrlEnv: "MANCER_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
