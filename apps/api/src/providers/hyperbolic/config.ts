import type { OpenAICompatConfig } from "../openai-compatible/types";

export const HYPERBOLIC_OPENAI_COMPAT_CONFIGS = {
	hyperbolic: {
		providerId: "hyperbolic",
		baseUrl: "https://api.hyperbolic.xyz",
		pathPrefix: "/v1",
		apiKeyEnv: "HYPERBOLIC_API_KEY",
		baseUrlEnv: "HYPERBOLIC_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
