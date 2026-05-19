import type { OpenAICompatConfig } from "../openai-compatible/types";

export const OVHCLOUD_OPENAI_COMPAT_CONFIGS = {
	ovhcloud: {
		providerId: "ovhcloud",
		baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net",
		pathPrefix: "/v1",
		apiKeyEnv: "OVH_AI_ENDPOINTS_ACCESS_TOKEN",
		baseUrlEnv: "OVH_AI_ENDPOINTS_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
