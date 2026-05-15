import type { OpenAICompatConfig } from "../openai-compatible/types";

export const TENSORIX_API_KEY_ENVS = ["TENSORIX_API_KEY"] as const;
export const TENSORIX_BASE_URL_ENVS = ["TENSORIX_BASE_URL"] as const;

export const TENSORIX_OPENAI_COMPAT_CONFIG = {
	providerId: "tensorix",
	baseUrl: "https://api.tensorix.ai",
	pathPrefix: "/v1",
	apiKeyEnv: "TENSORIX_API_KEY",
	baseUrlEnv: "TENSORIX_BASE_URL",
	supportsResponses: false,
} as const satisfies OpenAICompatConfig;

export const TENSORIX_OPENAI_COMPAT_CONFIGS = {
	tensorix: TENSORIX_OPENAI_COMPAT_CONFIG,
} satisfies Record<string, OpenAICompatConfig>;
