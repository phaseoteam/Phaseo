import type { OpenAICompatConfig } from "../openai-compatible/types";

export const BYTEPLUS_API_KEY_ENVS = ["BYTEPLUS_API_KEY", "BYTEDANCE_SEED_API_KEY", "ARK_API_KEY"] as const;
export const BYTEPLUS_BASE_URL_ENVS = ["BYTEPLUS_BASE_URL", "BYTEDANCE_SEED_BASE_URL"] as const;

export const BYTEPLUS_OPENAI_COMPAT_CONFIGS = {
	"bytedance-seed": {
		providerId: "bytedance-seed",
		baseUrl: "https://ark.ap-southeast.bytepluses.com",
		baseUrlEnv: "BYTEDANCE_SEED_BASE_URL",
		apiKeyEnv: "BYTEDANCE_SEED_API_KEY",
		pathPrefix: "/api/v3",
		supportsResponses: false,
	},
	byteplus: {
		providerId: "byteplus",
		baseUrl: "https://ark.ap-southeast.bytepluses.com",
		baseUrlEnv: "BYTEPLUS_BASE_URL",
		apiKeyEnv: "BYTEPLUS_API_KEY",
		pathPrefix: "/api/v3",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
