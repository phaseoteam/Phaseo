import type { OpenAICompatConfig } from "../openai-compatible/types";

// ScaleDown serves Summarize and Extract on OpenAI-compatible Chat Completions
// and Classify on its Jev-shaped Decisions endpoint, all under one API key.
export const SCALEDOWN_OPENAI_COMPAT_CONFIGS = {
	scaledown: {
		providerId: "scaledown",
		baseUrl: "https://api.scaledown.xyz",
		pathPrefix: "/v1",
		apiKeyEnv: "SCALEDOWN_API_KEY",
		baseUrlEnv: "SCALEDOWN_BASE_URL",
		apiKeyHeader: "x-api-key",
		apiKeyPrefix: "",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
