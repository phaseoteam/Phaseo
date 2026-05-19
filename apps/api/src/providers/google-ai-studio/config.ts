import type { OpenAICompatConfig } from "../openai-compatible/types";

export const GOOGLE_AI_STUDIO_OPENAI_COMPAT_CONFIGS = {
	"google-ai-studio": {
		providerId: "google-ai-studio",
		pathPrefix: "/v1",
		apiKeyEnv: "GOOGLE_AI_STUDIO_API_KEY",
		baseUrlEnv: "GOOGLE_AI_STUDIO_BASE_URL",
	},
} satisfies Record<string, OpenAICompatConfig>;
