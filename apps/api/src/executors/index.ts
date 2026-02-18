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
import { isOpenAICompatProvider } from "@providers/openai-compatible/config";
import { supportsAdapterBackedCapability, type AdapterBackedCapability } from "@providers/capabilities";
import type { Endpoint } from "@core/types";

// Text generation executors (migrated providers only)
import { executor as openaiText } from "./openai/text-generate";
import { executor as openAICompatText } from "./openai-compat/text-generate";
import { executor as anthropicText } from "./anthropic/text-generate";
import { executor as azureText } from "./azure/text-generate";
import { executor as googleText } from "./google/text-generate";
import { executor as googleAiStudioText } from "./google-ai-studio/text-generate";
import { executor as xAiText } from "./x-ai/text-generate";
import { executor as deepseekText } from "./deepseek/text-generate";
import { executor as minimaxText } from "./minimax/text-generate";
import { executor as alibabaText } from "./alibaba/text-generate";
import { executor as qwenText } from "./qwen/text-generate";
import { executor as zAiText } from "./z-ai/text-generate";
import { executor as zaiText } from "./zai/text-generate";
import { executor as xiaomiText } from "./xiaomi/text-generate";
import { executor as mistralText } from "./mistral/text-generate";
import { executor as moonshotText } from "./moonshotai/text-generate";
import { executor as aionLabsText } from "./aion-labs/text-generate";
import { executor as amazonBedrockText } from "./amazon-bedrock/text-generate";
import { executor as googleVertexText } from "./google-vertex/text-generate";
import { executor as deepinfraText } from "./deepinfra/text-generate";
import { executor as togetherText } from "./together/text-generate";

// Embeddings executors (migrated providers only)
import { executor as openaiEmbeddings } from "./openai/embeddings";
import { executor as googleEmbeddings } from "./google/embeddings";
import { executor as googleAiStudioEmbeddings } from "./google-ai-studio/embeddings";

// Moderations executors (migrated providers only)
import { executor as openaiModerations } from "./openai/moderations";

import { executor as openaiVideo } from "./openai/video-generate";
import { nonTextAdapterExecutor } from "./_shared/non-text/adapter-bridge";
import { executor as blackForestLabsImage } from "./black-forest-labs/image-generate";

// Video generation executors
import { executor as googleVideo } from "./google/video-generate";
import { executor as alibabaVideo } from "./alibaba/video-generate";
import { executor as xAiVideo } from "./x-ai/video-generate";
import { executor as minimaxVideo } from "./minimax/video-generate";
import { executor as minimaxMusic } from "./minimax/music-generate";

type Capability =
	| "text.generate"
	| "embeddings"
	| "moderations"
	| "image.generate"
	| "image.edit"
	| "audio.speech"
	| "audio.transcription"
	| "audio.translations"
	| "video.generate"
	| "ocr"
	| "music.generate";
type ProviderCapabilityMap = Partial<Record<Capability, ProviderExecutor>>;

const ADAPTER_BACKED_ENDPOINTS: Record<AdapterBackedCapability, Endpoint> = {
	"image.generate": "images.generations",
	"image.edit": "images.edits",
	"audio.speech": "audio.speech",
	"audio.transcription": "audio.transcription",
	"audio.translations": "audio.translations",
	ocr: "ocr",
	"music.generate": "music.generate",
};

const CAPABILITY_ALIASES: Record<string, Capability> = {
	"text.embed": "embeddings",
	moderation: "moderations",
	"moderations.create": "moderations",
	"image.generations": "image.generate",
	"images.generate": "image.generate",
	"images.generations": "image.generate",
	"images.edits": "image.edit",
	"image.edits": "image.edit",
	"audio.generate": "audio.speech",
	"audio.transcribe": "audio.transcription",
	"audio.translation": "audio.translations",
	"audio.translate": "audio.translations",
	"video.generation": "video.generate",
	"video.generations": "video.generate",
};

const OPENAI_COMPAT_TEXT_EXECUTOR_BLOCKLIST = new Set<string>([
]);

export function normalizeCapability(capability: string): Capability {
	return CAPABILITY_ALIASES[capability] ?? (capability as Capability);
}

function resolveAdapterBackedEndpoint(capability: Capability): Endpoint | null {
	return ADAPTER_BACKED_ENDPOINTS[capability as AdapterBackedCapability] ?? null;
}

function providerSupportsAdapterCapability(providerId: string, capability: AdapterBackedCapability): boolean {
	return supportsAdapterBackedCapability(providerId, capability);
}

export const EXECUTORS_BY_PROVIDER: Record<string, ProviderCapabilityMap> = {
	openai: {
		"text.generate": openaiText,
		embeddings: openaiEmbeddings,
		moderations: openaiModerations,
		"video.generate": openaiVideo,
	},
	anthropic: {
		"text.generate": anthropicText,
	},
	azure: {
		"text.generate": azureText,
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
	"x-ai": { "text.generate": xAiText, "video.generate": xAiVideo },
	xai: { "text.generate": xAiText, "video.generate": xAiVideo },
	deepseek: { "text.generate": deepseekText },
	minimax: { "text.generate": minimaxText, "video.generate": minimaxVideo, "music.generate": minimaxMusic },
	"minimax-lightning": { "text.generate": minimaxText, "video.generate": minimaxVideo, "music.generate": minimaxMusic },
	alibaba: { "text.generate": alibabaText, "video.generate": alibabaVideo },
	qwen: { "text.generate": qwenText, "video.generate": alibabaVideo },
	"z-ai": { "text.generate": zAiText },
	zai: { "text.generate": zaiText },
	xiaomi: { "text.generate": xiaomiText },
	mistral: { "text.generate": mistralText },
	"moonshot-ai": { "text.generate": moonshotText },
	"moonshot-ai-turbo": { "text.generate": moonshotText },
	"aion-labs": { "text.generate": aionLabsText },
	aionlabs: { "text.generate": aionLabsText },
	"amazon-bedrock": { "text.generate": amazonBedrockText },
	"google-vertex": { "text.generate": googleVertexText },
	deepinfra: { "text.generate": deepinfraText },
	together: { "text.generate": togetherText },
	"black-forest-labs": { "image.generate": blackForestLabsImage, "image.edit": blackForestLabsImage },
};

export function resolveProviderExecutor(providerId: string, capability: string): ProviderExecutor | null {
	const normalizedCapability = normalizeCapability(capability);
	const provider = EXECUTORS_BY_PROVIDER[providerId];
	if (provider) {
		const executor = provider[normalizedCapability];
		if (executor) return executor;
	}
	if (
		normalizedCapability === "text.generate" &&
		isOpenAICompatProvider(providerId) &&
		!OPENAI_COMPAT_TEXT_EXECUTOR_BLOCKLIST.has(providerId)
	) {
		return openAICompatText;
	}
	const adapterEndpoint = resolveAdapterBackedEndpoint(normalizedCapability);
	if (
		adapterEndpoint &&
		providerSupportsAdapterCapability(providerId, normalizedCapability as AdapterBackedCapability)
	) {
		return nonTextAdapterExecutor;
	}
	return null;
}

export function isProviderCapabilityEnabled(providerId: string, capability: string): boolean {
	const normalizedCapability = normalizeCapability(capability);
	const provider = EXECUTORS_BY_PROVIDER[providerId];
	if (provider?.[normalizedCapability]) return true;
	if (
		normalizedCapability === "text.generate" &&
		isOpenAICompatProvider(providerId) &&
		!OPENAI_COMPAT_TEXT_EXECUTOR_BLOCKLIST.has(providerId)
	) {
		return true;
	}
	const adapterEndpoint = resolveAdapterBackedEndpoint(normalizedCapability);
	return Boolean(
		adapterEndpoint &&
		providerSupportsAdapterCapability(providerId, normalizedCapability as AdapterBackedCapability),
	);
}

