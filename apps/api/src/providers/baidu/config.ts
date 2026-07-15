import type { OpenAICompatConfig } from "../openai-compatible/types";

export const BAIDU_OPENAI_COMPAT_CONFIGS = {
	baidu: {
		providerId: "baidu",
		baseUrl: "https://qianfan.baidubce.com",
		pathPrefix: "/v2",
		apiKeyEnv: "BAIDU_QIANFAN_API_KEY",
		baseUrlEnv: "BAIDU_QIANFAN_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
