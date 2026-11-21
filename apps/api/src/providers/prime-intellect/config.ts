import type { OpenAICompatConfig } from "../openai-compatible/types";

// https://docs.primeintellect.ai/inference/overview: OpenAI-compatible, bearer auth, base https://api.pinference.ai/api/v1.
// Team accounts bill a team balance only when X-Prime-Team-ID is sent; Phaseo uses a personal key.
export const PRIME_INTELLECT_OPENAI_COMPAT_CONFIGS = {
	"prime-intellect": {
		providerId: "prime-intellect",
		baseUrl: "https://api.pinference.ai",
		pathPrefix: "/api/v1",
		apiKeyEnv: "PRIME_INTELLECT_API_KEY",
		baseUrlEnv: "PRIME_INTELLECT_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
