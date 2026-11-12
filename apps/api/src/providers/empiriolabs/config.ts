import type { OpenAICompatConfig } from "../openai-compatible/types";

export const EMPIRIOLABS_OPENAI_COMPAT_CONFIGS = {
	empiriolabs: {
		providerId: "empiriolabs",
		baseUrl: "https://api.empiriolabs.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "EMPIRIOLABS_API_KEY",
		baseUrlEnv: "EMPIRIOLABS_BASE_URL",
		supportsResponses: true,
	},
} satisfies Record<string, OpenAICompatConfig>;

// These models advertise Chat Completions only in the provider's Phaseo v1 feed.
const CHAT_ONLY_MODELS = new Set([
	"stepaudio-3-chat",
	"mimo-v2-6-pro", "mimo-v2.6-pro",
	"mimo-v2-6-flash", "mimo-v2.6-flash",
	"mimo-v2-6-pro-ultraspeed", "mimo-v2.6-pro-ultraspeed",
]);

export function empirioLabsModelSupportsResponses(model?: string | null): boolean {
	const name = model?.trim().toLowerCase().split("/").pop();
	return name ? !CHAT_ONLY_MODELS.has(name) : false;
}
