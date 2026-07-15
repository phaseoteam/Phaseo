import type { OpenAICompatConfig } from "../openai-compatible/types";

export const STREAMLAKE_OPENAI_COMPAT_CONFIGS = {
	streamlake: {
		// StreamLake uses the OpenAI model field for an account-specific ep-... endpoint ID.
		providerId: "streamlake",
		baseUrl: "https://vanchin.streamlake.ai",
		pathPrefix: "/api/gateway/v1/endpoints",
		apiKeyEnv: "STREAMLAKE_API_KEY",
		baseUrlEnv: "STREAMLAKE_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
