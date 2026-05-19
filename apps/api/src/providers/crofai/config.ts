// Purpose: CrofAI provider-local OpenAI-compatible configuration.
// Why: Keeps Crof-specific env and transport settings next to the provider instead of only in the giant shared registry.
// How: Exports the provider config fragment plus env alias lists consumed by the shared compat transport.

import type { OpenAICompatConfig } from "../openai-compatible/types";

export const CROFAI_API_KEY_ENVS = ["CROFAI_API_KEY", "CROF_AI_API_KEY"] as const;
export const CROFAI_BASE_URL_ENVS = ["CROFAI_BASE_URL", "CROF_AI_BASE_URL"] as const;

export const CROFAI_OPENAI_COMPAT_CONFIG = {
	providerId: "crofai",
	baseUrl: "https://crof.ai",
	pathPrefix: "/v1",
	apiKeyEnv: "CROFAI_API_KEY",
	baseUrlEnv: "CROFAI_BASE_URL",
	supportsResponses: false,
} as const satisfies OpenAICompatConfig;

export const CROFAI_OPENAI_COMPAT_CONFIGS = {
	crofai: CROFAI_OPENAI_COMPAT_CONFIG,
} satisfies Record<string, OpenAICompatConfig>;
