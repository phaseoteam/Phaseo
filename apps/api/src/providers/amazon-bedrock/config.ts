import type { OpenAICompatConfig } from "../openai-compatible/types";

export const AMAZON_BEDROCK_OPENAI_COMPAT_CONFIGS = {
	"amazon-bedrock": {
		providerId: "amazon-bedrock",
		baseUrlEnv: "AMAZON_BEDROCK_BASE_URL",
		apiKeyEnv: "AMAZON_BEDROCK_API_KEY",
		pathPrefix: "/v1",
		supportsResponses: false,
	},
	"amazon-bedrock-mantle": {
		providerId: "amazon-bedrock-mantle",
		baseUrlEnv: "AMAZON_BEDROCK_MANTLE_BASE_URL",
		baseUrl: "https://bedrock-mantle.us-east-1.api.aws",
		apiKeyEnv: "AMAZON_BEDROCK_MANTLE_API_KEY",
		pathPrefix: "/v1",
		supportsResponses: true,
	},
} satisfies Record<string, OpenAICompatConfig>;
