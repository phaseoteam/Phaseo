// Purpose: Executor resolver for provider/capability combinations.
// Why: Centralizes executor lookup for the execute stage.
// How: Uses a provider->capability map to select executors.

/**
 * Provider Executor Resolver
 *
 * Executors are organized by provider first:
 *   executors/{provider_id}/{capability}/index.ts
 *
 * This keeps per-provider logic grouped together while still allowing
 * a simple capability-based lookup at runtime.
 */

import type { ProviderExecutor } from "./types";

// Text generation executors (migrated providers only)
import { executor as openaiText } from "./openai/text-generate";
import { executor as anthropicText } from "./anthropic/text-generate";
import { executor as googleText } from "./google/text-generate";
import { executor as googleAiStudioText } from "./google-ai-studio/text-generate";
import { executor as xAiText } from "./x-ai/text-generate";
import { executor as deepseekText } from "./deepseek/text-generate";
import { executor as minimaxText } from "./minimax/text-generate";
import { executor as qwenText } from "./qwen/text-generate";
import { executor as zAiText } from "./z-ai/text-generate";
import { executor as zaiText } from "./zai/text-generate";
import { executor as mistralText } from "./mistral/text-generate";
import { executor as moonshotText } from "./moonshotai/text-generate";
import { executor as aionLabsText } from "./aion-labs/text-generate";

// Embeddings executors (migrated providers only)
import { executor as openaiEmbeddings } from "./openai/embeddings";
import { executor as googleEmbeddings } from "./google/embeddings";
import { executor as googleAiStudioEmbeddings } from "./google-ai-studio/embeddings";

// Moderations executors (migrated providers only)
import { executor as openaiModerations } from "./openai/moderations";

// Image generation executors
import { executor as openaiImage } from "./openai/image-generate";
import { executor as falImage } from "./fal/image-generate";

// Audio generation executors
import { executor as openaiAudio } from "./openai/audio-generate";
import { executor as falAudio } from "./fal/audio-generate";

// Video generation executors
import { executor as googleVideo } from "./google/video-generate";
import { executor as falVideo } from "./fal/video-generate";

type Capability =
	| "text.generate"
	| "embeddings"
	| "moderations"
	| "image.generate"
	| "video.generate"
	| "audio.generate";
type ProviderCapabilityMap = Partial<Record<Capability, ProviderExecutor>>;

const CAPABILITY_ALIASES: Record<string, Capability> = {
	"text.embed": "embeddings",
	moderation: "moderations",
	"moderations.create": "moderations",
};

export function normalizeCapability(capability: string): Capability {
	return CAPABILITY_ALIASES[capability] ?? (capability as Capability);
}

export const EXECUTORS_BY_PROVIDER: Record<string, ProviderCapabilityMap> = {
	openai: {
		"text.generate": openaiText,
		embeddings: openaiEmbeddings,
		moderations: openaiModerations,
		"image.generate": openaiImage,
		"audio.generate": openaiAudio,
	},
	anthropic: {
		"text.generate": anthropicText,
	},
	google: {
		"text.generate": googleText,
		embeddings: googleEmbeddings,
		"video.generate": googleVideo,
	},
	"google-ai-studio": {
		"text.generate": googleAiStudioText,
		embeddings: googleAiStudioEmbeddings,
		"video.generate": googleVideo,
	},
	"x-ai": { "text.generate": xAiText },
	deepseek: { "text.generate": deepseekText },
	minimax: { "text.generate": minimaxText },
	"minimax-lightning": { "text.generate": minimaxText },
	qwen: { "text.generate": qwenText },
	"z-ai": { "text.generate": zAiText },
	zai: { "text.generate": zaiText },
	mistral: { "text.generate": mistralText },
	moonshotai: { "text.generate": moonshotText },
	"moonshot-ai": { "text.generate": moonshotText },
	"moonshot-ai-turbo": { "text.generate": moonshotText },
	"aion-labs": { "text.generate": aionLabsText },
	aionlabs: { "text.generate": aionLabsText },
	fal: {
		"image.generate": falImage,
		"audio.generate": falAudio,
		"video.generate": falVideo,
	},
	"fal-ai": {
		"image.generate": falImage,
		"audio.generate": falAudio,
		"video.generate": falVideo,
	},
};

export function resolveProviderExecutor(providerId: string, capability: string): ProviderExecutor | null {
	const provider = EXECUTORS_BY_PROVIDER[providerId];
	if (provider) {
		return provider[normalizeCapability(capability)] ?? null;
	}
	return null;
}

export function isProviderCapabilityEnabled(providerId: string, capability: string): boolean {
	const provider = EXECUTORS_BY_PROVIDER[providerId];
	return Boolean(provider?.[normalizeCapability(capability)]);
}

