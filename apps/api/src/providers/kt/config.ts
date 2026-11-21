import type { OpenAICompatConfig } from "../openai-compatible/types";

// KT Token Factory (tokenfactory.kt.com): API host https://api.tokenfactory.kt.com/v1, bearer auth.
// The OpenAI-style chat path is assumed until a key confirms it; KT_TOKEN_FACTORY_BASE_URL overrides the host.
export const KT_OPENAI_COMPAT_CONFIGS = {
	kt: {
		providerId: "kt",
		baseUrl: "https://api.tokenfactory.kt.com",
		pathPrefix: "/v1",
		apiKeyEnv: "KT_TOKEN_FACTORY_API_KEY",
		baseUrlEnv: "KT_TOKEN_FACTORY_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
