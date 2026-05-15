import type { OpenAICompatConfig } from "../openai-compatible/types";

export const NVIDIA_OPENAI_COMPAT_CONFIGS = {
	nvidia: {
		providerId: "nvidia",
		baseUrl: "https://integrate.api.nvidia.com",
		pathPrefix: "/v1",
		apiKeyEnv: "NVIDIA_API_KEY",
		baseUrlEnv: "NVIDIA_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
