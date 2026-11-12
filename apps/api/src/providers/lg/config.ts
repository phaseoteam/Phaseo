import type { OpenAICompatConfig } from "../openai-compatible/types";

// https://docs.exaone.ai/en/docs/authentication: LG AI Research's EXAONE API Platform is
// OpenAI-compatible, bearer auth, base https://api.exaone.ai/v1. The key's Infisical name is
// LG_EXAONE_PLATFORM, which the /provider-keys sync copies to the Worker under the same name.
export const LG_OPENAI_COMPAT_CONFIGS = {
	lg: {
		providerId: "lg",
		baseUrl: "https://api.exaone.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "LG_EXAONE_PLATFORM",
		baseUrlEnv: "LG_EXAONE_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
