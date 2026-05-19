import type { OpenAICompatConfig } from "../openai-compatible/types";

export const CLOUDFLARE_OPENAI_COMPAT_CONFIGS = {
	cloudflare: {
		providerId: "cloudflare",
		baseUrlEnv: "CLOUDFLARE_AI_GATEWAY_BASE_URL",
		apiKeyEnv: "CLOUDFLARE_API_TOKEN",
		pathPrefix: "",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
