import type { OpenAICompatConfig } from "../openai-compatible/types";

export const IO_NET_OPENAI_COMPAT_CONFIGS = {
	"io-net": {
		providerId: "io-net",
		apiKeyEnv: "IO_NET_API_KEY",
		baseUrlEnv: "IO_NET_BASE_URL",
		pathPrefix: "/v1",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
