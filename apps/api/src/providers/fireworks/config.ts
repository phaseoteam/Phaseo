import type { OpenAICompatConfig } from "../openai-compatible/types";

export const FIREWORKS_OPENAI_COMPAT_CONFIGS = {
	fireworks: {
		providerId: "fireworks",
		baseUrl: "https://api.fireworks.ai",
		pathPrefix: "/inference/v1",
		apiKeyEnv: "FIREWORKS_API_KEY",
		baseUrlEnv: "FIREWORKS_BASE_URL",
		supportsResponses: true,
	},
} satisfies Record<string, OpenAICompatConfig>;
