import type { OpenAICompatConfig } from "../openai-compatible/types";

export const ALIBABA_CLOUD_API_KEY_ENVS = ["ALIBABA_CLOUD_API_KEY"] as const;

const common = {
	baseUrl: "https://dashscope-intl.aliyuncs.com",
	pathPrefix: "/compatible-mode/v1",
	apiKeyEnv: "ALIBABA_CLOUD_API_KEY",
	baseUrlEnv: "ALIBABA_BASE_URL",
	supportsResponses: true,
} as const;

export const ALIBABA_OPENAI_COMPAT_CONFIGS = {
	"alibaba-cloud": {
		providerId: "alibaba-cloud",
		...common,
	},
	alibaba: {
		providerId: "alibaba",
		...common,
	},
	qwen: {
		providerId: "qwen",
		...common,
	},
} satisfies Record<string, OpenAICompatConfig>;
