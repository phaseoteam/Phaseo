import type { OpenAICompatConfig } from "../openai-compatible/types";

const common = {
	baseUrl: "https://api.atlascloud.ai",
	pathPrefix: "/v1",
	apiKeyEnv: "ATLAS_CLOUD_API_KEY",
	baseUrlEnv: "ATLAS_CLOUD_BASE_URL",
} as const;

export const ATLAS_CLOUD_OPENAI_COMPAT_CONFIGS = {
	"atlas-cloud": {
		providerId: "atlas-cloud",
		...common,
	},
	atlascloud: {
		providerId: "atlascloud",
		...common,
	},
} satisfies Record<string, OpenAICompatConfig>;
