import type { OpenAICompatConfig } from "../openai-compatible/types";

export const SWITCHPOINT_OPENAI_COMPAT_CONFIGS = {
	switchpoint: {
		providerId: "switchpoint",
		baseUrl: "https://www.switchpoint.dev",
		pathPrefix: "/v1",
		apiKeyEnv: "SWITCHPOINT_API_KEY",
		baseUrlEnv: "SWITCHPOINT_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
