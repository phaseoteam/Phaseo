// Purpose: Shared type for provider-local OpenAI-compatible config fragments.
// Why: Lets provider config modules export typed entries without depending on the main registry file.
// How: Used by provider-local config.ts files and the merged registry.

export type OpenAICompatConfig = {
	providerId: string;
	baseUrl?: string;
	pathPrefix?: string;
	apiKeyEnv?: string;
	baseUrlEnv?: string;
	apiKeyHeader?: string;
	apiKeyPrefix?: string;
	supportsResponses?: boolean;
};
