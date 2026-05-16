import type { OpenAICompatConfig } from "../openai-compatible/types";

export const STEPFUN_OPENAI_COMPAT_CONFIGS = {
	stepfun: {
		providerId: "stepfun",
		baseUrl: "https://api.stepfun.com",
		pathPrefix: "/v1",
		apiKeyEnv: "STEPFUN_API_KEY",
		baseUrlEnv: "STEPFUN_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
