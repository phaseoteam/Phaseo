import type { OpenAICompatConfig } from "../openai-compatible/types";

// https://docs.primalabs.ai/inference/introduction: OpenAI-compatible, bearer auth, base https://api.primalabs.ai/v1.
export const PRIMALABS_OPENAI_COMPAT_CONFIGS = {
	primalabs: {
		providerId: "primalabs",
		baseUrl: "https://api.primalabs.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "PRIMALABS_API_KEY",
		baseUrlEnv: "PRIMALABS_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
