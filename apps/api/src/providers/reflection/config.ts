import type { OpenAICompatConfig } from "../openai-compatible/types";

export const REFLECTION_REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export const REFLECTION_OPENAI_COMPAT_CONFIGS = {
	reflection: {
		providerId: "reflection",
		baseUrl: "https://api.reflection.ai",
		pathPrefix: "/openai/v1",
		apiKeyEnv: "REFLECTION_API_KEY",
		baseUrlEnv: "REFLECTION_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
