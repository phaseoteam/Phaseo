import type { OpenAICompatConfig } from "../openai-compatible/types";

export function deepInfraMediaUrl(baseUrl: string, path: string): string | undefined {
	if (!/^\/(?:audio|images|videos)(?:\/|$)/.test(path)) return undefined;
	// Media uses /v1, while chat and embeddings use /v1/openai.
	const root = baseUrl.replace(/\/+$/, "").replace(/\/v1(?:\/openai)?$/, "");
	return `${root}/v1${path}`;
}

export const DEEPINFRA_OPENAI_COMPAT_CONFIGS = {
	deepinfra: {
		providerId: "deepinfra",
		baseUrl: "https://api.deepinfra.com",
		pathPrefix: "/v1/openai",
		apiKeyEnv: "DEEPINFRA_API_KEY",
		baseUrlEnv: "DEEPINFRA_BASE_URL",
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
