import type { OpenAICompatConfig } from "../openai-compatible/types";

export const NEBIUS_TOKEN_FACTORY_API_KEY_ENVS = ["NEBIUS_API_KEY", "NEBIUS_TOKEN_FACTORY_API_KEY"] as const;
export const NEBIUS_EU_NORTH_1_BASE_URL_ENVS = ["NEBIUS_EU_NORTH_1_BASE_URL", "NEBIUS_BASE_URL"] as const;
export const NEBIUS_US_CENTRAL_1_BASE_URL_ENVS = ["NEBIUS_US_CENTRAL_1_BASE_URL", "NEBIUS_BASE_URL"] as const;

export const NEBIUS_TOKEN_FACTORY_OPENAI_COMPAT_CONFIGS = {
	"nebius-token-factory": {
		providerId: "nebius-token-factory",
		baseUrl: "https://api.tokenfactory.nebius.com",
		pathPrefix: "/v1",
		apiKeyEnv: "NEBIUS_API_KEY",
		baseUrlEnv: "NEBIUS_BASE_URL",
		supportsResponses: false,
	},
	"nebius-token-factory-fast": {
		providerId: "nebius-token-factory-fast",
		baseUrl: "https://api.tokenfactory.nebius.com",
		pathPrefix: "/v1",
		apiKeyEnv: "NEBIUS_API_KEY",
		baseUrlEnv: "NEBIUS_BASE_URL",
		supportsResponses: false,
	},
	"nebius-token-factory-eu-north-1": {
		providerId: "nebius-token-factory-eu-north-1",
		baseUrl: "https://api.tokenfactory.nebius.com",
		pathPrefix: "/v1",
		apiKeyEnv: "NEBIUS_API_KEY",
		baseUrlEnv: "NEBIUS_EU_NORTH_1_BASE_URL",
		supportsResponses: false,
	},
	"nebius-token-factory-us-central-1": {
		providerId: "nebius-token-factory-us-central-1",
		baseUrl: "https://api.tokenfactory.nebius.com",
		pathPrefix: "/v1",
		apiKeyEnv: "NEBIUS_API_KEY",
		baseUrlEnv: "NEBIUS_US_CENTRAL_1_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
