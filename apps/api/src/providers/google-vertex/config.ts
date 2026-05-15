import type { OpenAICompatConfig } from "../openai-compatible/types";

export const GOOGLE_VERTEX_OPENAI_COMPAT_CONFIGS = {
	"google-vertex": {
		providerId: "google-vertex",
		baseUrlEnv: "GOOGLE_VERTEX_BASE_URL",
		apiKeyEnv: "GOOGLE_VERTEX_API_KEY",
		pathPrefix: "",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
