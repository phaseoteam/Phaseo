import type { OpenAICompatConfig } from "../openai-compatible/types";

export const INFERENCE_NET_OPENAI_COMPAT_CONFIGS = {
	"inference-net": {
		providerId: "inference-net",
		baseUrl: "https://api.inference.net",
		pathPrefix: "/v1",
		apiKeyEnv: "INFERENCE_NET_API_KEY",
		baseUrlEnv: "INFERENCE_NET_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
