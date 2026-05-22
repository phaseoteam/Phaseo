import type { OpenAICompatConfig } from "../openai-compatible/types";

const common = {
	baseUrl: "https://api.minimax.io",
	pathPrefix: "/v1",
	apiKeyEnv: "MINIMAX_API_KEY",
	baseUrlEnv: "MINIMAX_BASE_URL",
} as const;

export const MINIMAX_OPENAI_COMPAT_CONFIGS = {
	minimax: {
		providerId: "minimax",
		...common,
	},
	"minimax-lightning": {
		providerId: "minimax-lightning",
		...common,
	},
} satisfies Record<string, OpenAICompatConfig>;
