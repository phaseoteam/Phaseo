import type { OpenAICompatConfig } from "../openai-compatible/types";

export const STREAMLAKE_OPENAI_COMPAT_CONFIGS = {
	streamlake: {
		providerId: "streamlake",
		baseUrl: "https://vanchin.streamlake.ai/api/gateway/coding",
		pathPrefix: "/v1",
		apiKeyEnv: "STREAMLAKE_API_KEY",
		baseUrlEnv: "STREAMLAKE_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
