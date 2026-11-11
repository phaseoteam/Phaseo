import type { OpenAICompatConfig } from "../openai-compatible/types";

// https://docs.particle.ai/ — OpenAI-compatible Chat Completions at
// https://api.particle.ai/v1. A US-only endpoint (https://us.api.particle.ai/v1)
// takes the same key and can be selected with PARTICLE_AI_BASE_URL.
export const PARTICLE_AI_OPENAI_COMPAT_CONFIGS = {
	"particle-ai": {
		providerId: "particle-ai",
		baseUrl: "https://api.particle.ai",
		pathPrefix: "/v1",
		apiKeyEnv: "PARTICLE_AI_API_KEY",
		baseUrlEnv: "PARTICLE_AI_BASE_URL",
		// Particle's Responses surface is WebSocket-only (wss://api.particle.ai/v1/responses).
		supportsResponses: false,
	},
} satisfies Record<string, OpenAICompatConfig>;
