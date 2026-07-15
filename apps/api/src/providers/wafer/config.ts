import type { OpenAICompatConfig } from "../openai-compatible/types";

export const WAFER_OPENAI_COMPAT_CONFIGS = {
	wafer: {
		providerId: "wafer",
		baseUrl: "https://pass.wafer.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "WAFER_API_KEY",
		baseUrlEnv: "WAFER_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
