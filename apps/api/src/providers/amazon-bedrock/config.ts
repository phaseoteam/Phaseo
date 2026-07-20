import type { OpenAICompatConfig } from "../openai-compatible/types";

export const AMAZON_BEDROCK_OPENAI_COMPAT_CONFIGS = {
	"amazon-bedrock": {
		providerId: "amazon-bedrock",
		baseUrl: "https://bedrock-mantle.us-east-1.api.aws",
		baseUrlEnv: "AMAZON_BEDROCK_BASE_URL",
		apiKeyEnv: "AMAZON_BEDROCK_API_KEY",
		pathPrefix: "/v1",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
