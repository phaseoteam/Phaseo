import type { OpenAICompatConfig } from "../openai-compatible/types";

export const THINKING_MACHINES_OPENAI_COMPAT_CONFIGS = {
	"thinking-machines": {
		providerId: "thinking-machines",
		baseUrl: "https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1",
		pathPrefix: "",
		apiKeyEnv: "TINKER_API_KEY",
		baseUrlEnv: "TINKER_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
