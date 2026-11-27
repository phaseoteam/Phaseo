import type { OpenAICompatConfig } from "../openai-compatible/types";

// Tenstorrent Cloud (console.tenstorrent.com): OpenAI-compatible chat completions, bearer sk-tt-... keys,
// base https://console.tenstorrent.com/v1. Public model feed: /v1/openrouter/models.
export const TENSTORRENT_OPENAI_COMPAT_CONFIGS = {
	tenstorrent: {
		providerId: "tenstorrent",
		baseUrl: "https://console.tenstorrent.com",
		pathPrefix: "/v1",
		apiKeyEnv: "TENSTORRENT_API_KEY",
		baseUrlEnv: "TENSTORRENT_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
