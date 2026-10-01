import type { OpenAICompatConfig } from "../openai-compatible/types";

export const MODELSCOPE_OPENAI_COMPAT_CONFIGS = {
	modelscope: {
		providerId: "modelscope",
		baseUrl: "https://api-inference.modelscope.cn",
		pathPrefix: "/v1",
		apiKeyEnv: "MODELSCOPE_API_KEY",
		baseUrlEnv: "MODELSCOPE_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
