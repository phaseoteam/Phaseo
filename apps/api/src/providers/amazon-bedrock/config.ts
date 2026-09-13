import type { OpenAICompatConfig } from "../openai-compatible/types";

export const AMAZON_BEDROCK_OPENAI_COMPAT_CONFIGS = {
	"amazon-bedrock": {
		providerId: "amazon-bedrock",
		baseUrl: "https://bedrock-mantle.us-west-2.api.aws",
		baseUrlEnv: "AMAZON_BEDROCK_MANTLE_BASE_URL",
		apiKeyEnv: "AMAZON_BEDROCK_API_KEY",
		pathPrefix: "/v1",
		supportsResponses: true,
	},
} satisfies Record<string, OpenAICompatConfig>;
