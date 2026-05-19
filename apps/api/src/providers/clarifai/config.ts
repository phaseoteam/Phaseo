import type { OpenAICompatConfig } from "../openai-compatible/types";

export const CLARIFAI_OPENAI_COMPAT_CONFIGS = {
	clarifai: {
		providerId: "clarifai",
		baseUrl: "https://api.clarifai.com",
		pathPrefix: "/v2/ext/openai/v1",
		apiKeyEnv: "CLARIFAI_PAT",
		baseUrlEnv: "CLARIFAI_BASE_URL",
		supportsResponses: true,
	},
} satisfies Record<string, OpenAICompatConfig>;
