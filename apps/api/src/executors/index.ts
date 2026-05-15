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
import {
	getProviderCapabilityProfile,
	supportsAdapterBackedCapability,
	type AdapterBackedCapability,
} from "@providers/capabilities";
import type { Endpoint } from "@core/types";

// Text generation executors (migrated providers only)
import { executor as openaiText } from "./openai/text-generate";
import { executor as openAICompatText } from "./openai-compat/text-generate";
import { executor as anthropicText } from "./anthropic/text-generate";
import { executor as azureText } from "./azure/text-generate";
import { executor as googleAiStudioText } from "./google-ai-studio/text-generate";
import { executor as googleAudioSpeech } from "./google/audio-speech";
import { executor as googleMusic } from "./google/music-generate";
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
import { executor as googleVertexVideo } from "./google-vertex/video-generate";
import { executor as deepinfraText } from "./deepinfra/text-generate";
import { executor as togetherText } from "./together/text-generate";
import { executor as crofaiText } from "./crofai/text-generate";
import { executor as tensorixText } from "./tensorix/text-generate";
import { executor as basetenText } from "./baseten/text-generate";
import { executor as cerebrasText } from "./cerebras/text-generate";
import { executor as cohereText } from "./cohere/text-generate";
import { executor as fireworksText } from "./fireworks/text-generate";
import { executor as groqText } from "./groq/text-generate";
import { executor as novitaaiText } from "./novitaai/text-generate";
import { executor as perplexityText } from "./perplexity/text-generate";
import { executor as liquidAiText } from "./liquid-ai/text-generate";
import { executor as ai21Text } from "./ai21/text-generate";
import { executor as akashmlText } from "./akashml/text-generate";
import { executor as arceeText } from "./arcee/text-generate";
import { executor as alibabaCloudText } from "./alibaba-cloud/text-generate";
import { executor as atlasCloudText } from "./atlas-cloud/text-generate";
import { executor as byteplusText } from "./byteplus/text-generate";
import { executor as bytedanceSeedText } from "./bytedance-seed/text-generate";
import { executor as chutesText } from "./chutes/text-generate";
import { executor as clarifaiText } from "./clarifai/text-generate";
import { executor as cloudflareText } from "./cloudflare/text-generate";
import { executor as crusoeText } from "./crusoe/text-generate";
import { executor as featherlessText } from "./featherless/text-generate";
import { executor as friendliText } from "./friendli/text-generate";
import { executor as gmicloudText } from "./gmicloud/text-generate";
import { executor as hyperbolicText } from "./hyperbolic/text-generate";
import { executor as inceptionText } from "./inception/text-generate";
import { executor as infermaticText } from "./infermatic/text-generate";
import { executor as inflectionText } from "./inflection/text-generate";
import { executor as ionrouterText } from "./ionrouter/text-generate";
import { executor as longcatText } from "./longcat/text-generate";
import { executor as mancerText } from "./mancer/text-generate";
import { executor as morphText } from "./morph/text-generate";
import { executor as morpheusText } from "./morpheus/text-generate";
import { executor as nebiusTokenFactoryText } from "./nebius-token-factory/text-generate";
import { executor as nebiusTokenFactoryEuText } from "./nebius-token-factory-eu-north-1/text-generate";
import { executor as nebiusTokenFactoryUsText } from "./nebius-token-factory-us-central-1/text-generate";
import { executor as nvidiaText } from "./nvidia/text-generate";
import { executor as parasailText } from "./parasail/text-generate";
import { executor as phalaText } from "./phala/text-generate";
import { executor as poolsideText } from "./poolside/text-generate";
import { executor as relaceText } from "./relace/text-generate";
import { executor as sambanovaText } from "./sambanova/text-generate";
import { executor as siliconflowText } from "./siliconflow/text-generate";
import { executor as sourcefulText } from "./sourceful/text-generate";
import { executor as stepfunText } from "./stepfun/text-generate";
import { executor as veniceText } from "./venice/text-generate";
import { executor as voyageText } from "./voyage/text-generate";
import { executor as weightsAndBiasesText } from "./weights-and-biases/text-generate";

// Embeddings executors (migrated providers only)
import { executor as openaiEmbeddings } from "./openai/embeddings";
import { executor as googleAiStudioEmbeddings } from "./google-ai-studio/embeddings";

// Moderations executors (migrated providers only)
import { executor as openaiModerations } from "./openai/moderations";
import { executor as openaiRerank } from "./openai/rerank";

import { executor as openaiVideo } from "./openai/video-generate";
import { nonTextAdapterExecutor } from "./_shared/non-text/adapter-bridge";
import { executor as blackForestLabsImage } from "./black-forest-labs/image-generate";

// Video generation executors
import { executor as alibabaVideo } from "./alibaba/video-generate";
import { executor as xAiVideo } from "./x-ai/video-generate";
import { executor as minimaxVideo } from "./minimax/video-generate";
import { executor as bytedanceSeedVideo } from "./bytedance-seed/video-generate";
import { executor as runwayVideo } from "./runway/video-generate";
import { executor as minimaxMusic } from "./minimax/music-generate";
import { executor as atlasCloudVideo } from "./atlascloud/video-generate";

type Capability =
	| "text.generate"
	| "embeddings"
	| "moderations"
	| "rerank"
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
	"video.generate": "video.generation",
	ocr: "ocr",
	"music.generate": "music.generate",
};

const CAPABILITY_ALIASES: Record<string, Capability> = {
	"text.embed": "embeddings",
	moderation: "moderations",
	"moderations.create": "moderations",
	"text.moderate": "moderations",
	"rerank.create": "rerank",
	"text.rerank": "rerank",
	reranking: "rerank",
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
const OPENAI_COMPAT_EMBEDDINGS_EXECUTOR_BLOCKLIST = new Set<string>([]);
const OPENAI_COMPAT_MODERATIONS_EXECUTOR_BLOCKLIST = new Set<string>([]);
const OPENAI_COMPAT_RERANK_EXECUTOR_BLOCKLIST = new Set<string>([]);

function supportsOpenAICompatEmbeddings(providerId: string): boolean {
	if (!isOpenAICompatProvider(providerId)) return false;
	if (OPENAI_COMPAT_EMBEDDINGS_EXECUTOR_BLOCKLIST.has(providerId)) return false;
	return !getProviderCapabilityProfile(providerId).textOnly;
}

function supportsOpenAICompatRerank(providerId: string): boolean {
	if (!isOpenAICompatProvider(providerId)) return false;
	if (OPENAI_COMPAT_RERANK_EXECUTOR_BLOCKLIST.has(providerId)) return false;
	return !getProviderCapabilityProfile(providerId).textOnly;
}

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
		rerank: openaiRerank,
		"video.generate": openaiVideo,
	},
	anthropic: {
		"text.generate": anthropicText,
	},
	"anthropic-us": {
		"text.generate": anthropicText,
	},
	ai21: {
		"text.generate": ai21Text,
	},
	akashml: {
		"text.generate": akashmlText,
	},
	arcee: {
		"text.generate": arceeText,
	},
	"arcee-ai": {
		"text.generate": arceeText,
	},
	azure: {
		"text.generate": azureText,
	},
	"alibaba-cloud": {
		"text.generate": alibabaCloudText,
		"video.generate": alibabaVideo,
	},
	"atlas-cloud": {
		"text.generate": atlasCloudText,
		"video.generate": atlasCloudVideo,
	},
	atlascloud: {
		"text.generate": atlasCloudText,
		"video.generate": atlasCloudVideo,
	},
	baseten: {
		"text.generate": basetenText,
	},
	"bytedance-seed": {
		"text.generate": bytedanceSeedText,
		"video.generate": bytedanceSeedVideo,
	},
	byteplus: {
		"text.generate": byteplusText,
		"video.generate": bytedanceSeedVideo,
	},
	cerebras: {
		"text.generate": cerebrasText,
	},
	chutes: {
		"text.generate": chutesText,
	},
	clarifai: {
		"text.generate": clarifaiText,
	},
	cloudflare: {
		"text.generate": cloudflareText,
	},
	cohere: {
		"text.generate": cohereText,
	},
	crofai: {
		"text.generate": crofaiText,
	},
	tensorix: {
		"text.generate": tensorixText,
	},
	crusoe: {
		"text.generate": crusoeText,
	},

	"google-ai-studio": {
		"text.generate": googleAiStudioText,
		embeddings: googleAiStudioEmbeddings,
		"audio.speech": googleAudioSpeech,
		"music.generate": googleMusic,
	},
	"x-ai": { "text.generate": xAiText, "video.generate": xAiVideo },
	xai: { "text.generate": xAiText, "video.generate": xAiVideo },
	featherless: { "text.generate": featherlessText },
	friendli: { "text.generate": friendliText },
	deepseek: { "text.generate": deepseekText },
	gmicloud: { "text.generate": gmicloudText },
	hyperbolic: { "text.generate": hyperbolicText },
	inception: { "text.generate": inceptionText },
	infermatic: { "text.generate": infermaticText },
	inflection: { "text.generate": inflectionText },
	ionrouter: { "text.generate": ionrouterText },
	longcat: { "text.generate": longcatText },
	mancer: { "text.generate": mancerText },
	minimax: { "text.generate": minimaxText, "video.generate": minimaxVideo, "music.generate": minimaxMusic },
	"minimax-lightning": { "text.generate": minimaxText, "video.generate": minimaxVideo, "music.generate": minimaxMusic },
	alibaba: { "text.generate": alibabaText, "video.generate": alibabaVideo },
	qwen: { "text.generate": qwenText, "video.generate": alibabaVideo },
	morph: { "text.generate": morphText },
	morpheus: { "text.generate": morpheusText },
	"nebius-token-factory": { "text.generate": nebiusTokenFactoryText },
	"nebius-token-factory-eu-north-1": { "text.generate": nebiusTokenFactoryEuText },
	"nebius-token-factory-us-central-1": { "text.generate": nebiusTokenFactoryUsText },
	nvidia: { "text.generate": nvidiaText },
	parasail: { "text.generate": parasailText },
	phala: { "text.generate": phalaText },
	poolside: { "text.generate": poolsideText },
	runway: { "video.generate": runwayVideo },
	runwayml: { "video.generate": runwayVideo },
	"z-ai": { "text.generate": zAiText },
	zai: { "text.generate": zaiText },
	xiaomi: { "text.generate": xiaomiText },
	mistral: { "text.generate": mistralText },
	"moonshot-ai": { "text.generate": moonshotText },
	moonshotai: { "text.generate": moonshotText },
	"moonshot-ai-turbo": { "text.generate": moonshotText },
	"moonshotai-turbo": { "text.generate": moonshotText },
	"aion-labs": { "text.generate": aionLabsText },
	aionlabs: { "text.generate": aionLabsText },
	"amazon-bedrock": { "text.generate": amazonBedrockText },
	"google-vertex": { "text.generate": googleVertexText, "video.generate": googleVertexVideo },
	deepinfra: { "text.generate": deepinfraText },
	fireworks: { "text.generate": fireworksText },
	groq: { "text.generate": groqText },
	liquid: { "text.generate": liquidAiText },
	"liquid-ai": { "text.generate": liquidAiText },
	novitaai: { "text.generate": novitaaiText },
	novita: { "text.generate": novitaaiText },
	perplexity: { "text.generate": perplexityText },
	relace: { "text.generate": relaceText },
	sambanova: { "text.generate": sambanovaText },
	siliconflow: { "text.generate": siliconflowText },
	sourceful: { "text.generate": sourcefulText },
	stepfun: { "text.generate": stepfunText },
	together: { "text.generate": togetherText },
	venice: { "text.generate": veniceText },
	"venice-e2ee": { "text.generate": veniceText },
	voyage: { "text.generate": voyageText },
	voyageai: { "text.generate": voyageText },
	"weights-and-biases": { "text.generate": weightsAndBiasesText },
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
	if (
		normalizedCapability === "embeddings" &&
		supportsOpenAICompatEmbeddings(providerId)
	) {
		return openaiEmbeddings;
	}
	if (
		normalizedCapability === "moderations" &&
		isOpenAICompatProvider(providerId) &&
		!OPENAI_COMPAT_MODERATIONS_EXECUTOR_BLOCKLIST.has(providerId)
	) {
		return openaiModerations;
	}
	if (
		normalizedCapability === "rerank" &&
		supportsOpenAICompatRerank(providerId)
	) {
		return openaiRerank;
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
	if (
		normalizedCapability === "embeddings" &&
		supportsOpenAICompatEmbeddings(providerId)
	) {
		return true;
	}
	if (
		normalizedCapability === "moderations" &&
		isOpenAICompatProvider(providerId) &&
		!OPENAI_COMPAT_MODERATIONS_EXECUTOR_BLOCKLIST.has(providerId)
	) {
		return true;
	}
	if (
		normalizedCapability === "rerank" &&
		supportsOpenAICompatRerank(providerId)
	) {
		return true;
	}
	const adapterEndpoint = resolveAdapterBackedEndpoint(normalizedCapability);
	return Boolean(
		adapterEndpoint &&
		providerSupportsAdapterCapability(providerId, normalizedCapability as AdapterBackedCapability),
	);
}


