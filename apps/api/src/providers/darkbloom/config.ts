import type { OpenAICompatConfig } from "../openai-compatible/types";

export const DARKBLOOM_OPENAI_COMPAT_CONFIGS = {
	darkbloom: {
		providerId: "darkbloom",
		baseUrl: "https://api.darkbloom.dev",
		pathPrefix: "/v1",
		apiKeyEnv: "DARKBLOOM_API_KEY",
		baseUrlEnv: "DARKBLOOM_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
