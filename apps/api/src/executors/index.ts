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
import { normalizeProviderId } from "@/lib/config/providerAliases";

// Text generation executors (migrated providers only)
import { executor as openaiText } from "./openai/text-generate";
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
import { executor as googleAiStudioVideo } from "./google/video-generate";
import { executor as deepinfraText } from "./deepinfra/text-generate";
import { executor as ioNetText } from "./io-net/text-generate";
import { executor as togetherText } from "./together/text-generate";
import { executor as crofaiText } from "./crofai/text-generate";
import { executor as canopyWaveText } from "./canopy-wave/text-generate";
import { executor as tensorixText } from "./tensorix/text-generate";
import { executor as basetenText } from "./baseten/text-generate";
import { executor as baiduText } from "./baidu/text-generate";
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
import { executor as cloudflareImage } from "./cloudflare/image-generate";
import { executor as cloudflareAudioTranscription } from "./cloudflare/audio-transcription";
import { executor as crusoeText } from "./crusoe/text-generate";
import { executor as featherlessText } from "./featherless/text-generate";
import { executor as friendliText } from "./friendli/text-generate";
import { executor as gmicloudText } from "./gmicloud/text-generate";
import { executor as gmicloudMusic } from "./gmicloud/music-generate";
import { executor as gmicloudAudioSpeech } from "./gmicloud/audio-speech";
import { executor as hyperbolicText } from "./hyperbolic/text-generate";
import { executor as inceptionText } from "./inception/text-generate";
import { executor as infermaticText } from "./infermatic/text-generate";
import { executor as inflectionText } from "./inflection/text-generate";
import { executor as ionrouterText } from "./ionrouter/text-generate";
import { executor as longcatText } from "./longcat/text-generate";
import { executor as mancerText } from "./mancer/text-generate";
import { executor as ambientText } from "./ambient/text-generate";
import { executor as avianText } from "./avian/text-generate";
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
import { executor as sailResearchText } from "./sail-research/text-generate";
import { executor as siliconflowText } from "./siliconflow/text-generate";
import { executor as stepfunText } from "./stepfun/text-generate";
import { executor as veniceText } from "./venice/text-generate";
import { executor as weightsAndBiasesText } from "./weights-and-biases/text-generate";
import { executor as metaText } from "./meta/text-generate";
import { executor as ovhcloudText } from "./ovhcloud/text-generate";
import { executor as ovhcloudModerations } from "./ovhcloud/moderations";
import { executor as sakanaText } from "./sakana/text-generate";
import { executor as scalewayText } from "./scaleway/text-generate";
import { executor as thinkingMachinesText } from "./thinking-machines/text-generate";
import { executor as darkbloomText } from "./darkbloom/text-generate";
import { executor as inferenceNetText } from "./inference-net/text-generate";
import { executor as maraText } from "./mara/text-generate";
import { executor as rekaText } from "./reka/text-generate";
import { executor as streamlakeText } from "./streamlake/text-generate";
import { executor as switchpointText } from "./switchpoint/text-generate";
import { executor as upstageText } from "./upstage/text-generate";
import { executor as waferText } from "./wafer/text-generate";
import { executor as tencentCloudText } from "./tencent-cloud/text-generate";

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
import { executor as falVideo } from "./fal/video-generate";
import { executor as ltxVideo } from "./ltx/video-generate";

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
	| "parse"
	| "music.generate";
type ProviderCapabilityMap = Partial<Record<Capability, ProviderExecutor>>;

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
	"audio/speech": "audio.speech",
	"audio.transcribe": "audio.transcription",
	"audio.translation": "audio.translations",
	"audio.translate": "audio.translations",
	"video.generation": "video.generate",
	"video.generations": "video.generate",
};

export function normalizeCapability(capability: string): Capability {
	return CAPABILITY_ALIASES[capability] ?? (capability as Capability);
}

export const EXECUTORS_BY_PROVIDER: Record<string, ProviderCapabilityMap> = {
	openai: {
		"text.generate": openaiText,
		embeddings: openaiEmbeddings,
		moderations: openaiModerations,
		"image.generate": nonTextAdapterExecutor,
		"image.edit": nonTextAdapterExecutor,
		"audio.speech": nonTextAdapterExecutor,
		"audio.transcription": nonTextAdapterExecutor,
		"audio.translations": nonTextAdapterExecutor,
		"video.generate": openaiVideo,
	},
	"openai-eu": {
		"text.generate": openaiText,
		embeddings: openaiEmbeddings,
		moderations: openaiModerations,
		"image.generate": nonTextAdapterExecutor,
		"image.edit": nonTextAdapterExecutor,
		"audio.speech": nonTextAdapterExecutor,
		"audio.transcription": nonTextAdapterExecutor,
		"audio.translations": nonTextAdapterExecutor,
	},
	anthropic: {
		"text.generate": anthropicText,
	},
	"anthropic-us": {
		"text.generate": anthropicText,
	},
	"anthropic-aws": {
		"text.generate": anthropicText,
	},
	"anthropic-aws-us": {
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
	baidu: {
		"text.generate": baiduText,
	},
	darkbloom: {
		"text.generate": darkbloomText,
	},
	"inference-net": {
		"text.generate": inferenceNetText,
	},
	mara: {
		"text.generate": maraText,
	},
	reka: {
		"text.generate": rekaText,
	},
	streamlake: {
		"text.generate": streamlakeText,
	},
	switchpoint: {
		"text.generate": switchpointText,
	},
	upstage: {
		"text.generate": upstageText,
		embeddings: openaiEmbeddings,
	},
	wafer: {
		"text.generate": waferText,
	},
	"tencent-cloud": { "text.generate": tencentCloudText },
	"alibaba-cloud": {
		"text.generate": alibabaCloudText,
		embeddings: openaiEmbeddings,
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
		"image.generate": nonTextAdapterExecutor,
		"image.edit": nonTextAdapterExecutor,
	},
	byteplus: {
		"text.generate": byteplusText,
		"video.generate": bytedanceSeedVideo,
		"image.generate": nonTextAdapterExecutor,
		"image.edit": nonTextAdapterExecutor,
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
		embeddings: openaiEmbeddings,
		"image.generate": cloudflareImage,
		"audio.transcription": cloudflareAudioTranscription,
	},
	cohere: {
		"text.generate": cohereText,
		embeddings: openaiEmbeddings,
		rerank: openaiRerank,
		"audio.transcription": nonTextAdapterExecutor,
		parse: nonTextAdapterExecutor,
	},
	crofai: {
		"text.generate": crofaiText,
	},
	"canopy-wave": {
		"text.generate": canopyWaveText,
	},
	tensorix: {
		"text.generate": tensorixText,
		embeddings: openaiEmbeddings,
	},
	tensorx: { "text.generate": tensorixText, embeddings: openaiEmbeddings },
	crusoe: {
		"text.generate": crusoeText,
	},

	"google-ai-studio": {
		"text.generate": googleAiStudioText,
		embeddings: googleAiStudioEmbeddings,
		"audio.speech": googleAudioSpeech,
		"image.generate": nonTextAdapterExecutor,
		"music.generate": googleMusic,
		"video.generate": googleAiStudioVideo,
	},
	"spacex-ai": { "text.generate": xAiText, "video.generate": xAiVideo, "image.generate": nonTextAdapterExecutor, "image.edit": nonTextAdapterExecutor, "audio.speech": nonTextAdapterExecutor, "audio.transcription": nonTextAdapterExecutor },
	"x-ai": { "text.generate": xAiText, "video.generate": xAiVideo, "image.generate": nonTextAdapterExecutor, "image.edit": nonTextAdapterExecutor, "audio.speech": nonTextAdapterExecutor, "audio.transcription": nonTextAdapterExecutor },
	xai: { "text.generate": xAiText, "video.generate": xAiVideo, "image.generate": nonTextAdapterExecutor, "image.edit": nonTextAdapterExecutor, "audio.speech": nonTextAdapterExecutor, "audio.transcription": nonTextAdapterExecutor },
	featherless: { "text.generate": featherlessText },
	friendli: { "text.generate": friendliText },
	deepseek: { "text.generate": deepseekText },
	gmicloud: {
		"text.generate": gmicloudText,
		"music.generate": gmicloudMusic,
		"audio.speech": gmicloudAudioSpeech,
	},
	hyperbolic: { "text.generate": hyperbolicText },
	inception: { "text.generate": inceptionText },
	infermatic: { "text.generate": infermaticText },
	inflection: { "text.generate": inflectionText },
	ionrouter: { "text.generate": ionrouterText },
	"ionrouter-kimi": { "text.generate": ionrouterText },
	"ionrouter-minimax": { "text.generate": ionrouterText },
	longcat: { "text.generate": longcatText },
	mancer: { "text.generate": mancerText },
	ambient: { "text.generate": ambientText },
	avian: { "text.generate": avianText },
	minimax: { "text.generate": minimaxText, "video.generate": minimaxVideo, "music.generate": minimaxMusic, "image.generate": nonTextAdapterExecutor, "image.edit": nonTextAdapterExecutor, "audio.speech": nonTextAdapterExecutor },
	"minimax-lightning": { "text.generate": minimaxText },
	alibaba: { "text.generate": alibabaText, embeddings: openaiEmbeddings, "video.generate": alibabaVideo },
	qwen: { "text.generate": qwenText, embeddings: openaiEmbeddings, "video.generate": alibabaVideo },
	morph: { "text.generate": morphText },
	morpheus: { "text.generate": morpheusText, embeddings: openaiEmbeddings, "audio.speech": nonTextAdapterExecutor },
	"nebius-token-factory": { "text.generate": nebiusTokenFactoryText, embeddings: openaiEmbeddings, rerank: openaiRerank },
	"nebius-token-factory-eu-north-1": { "text.generate": nebiusTokenFactoryEuText, embeddings: openaiEmbeddings },
	"nebius-token-factory-us-central-1": { "text.generate": nebiusTokenFactoryUsText },
	nvidia: { "text.generate": nvidiaText },
	parasail: { "text.generate": parasailText },
	phala: { "text.generate": phalaText, embeddings: openaiEmbeddings },
	poolside: { "text.generate": poolsideText },
	runway: { "video.generate": runwayVideo },
	runwayml: { "video.generate": runwayVideo },
	fal: { "video.generate": falVideo },
	ltx: { "video.generate": ltxVideo },
	"z-ai": { "text.generate": zAiText },
	zai: { "text.generate": zaiText },
	xiaomi: { "text.generate": xiaomiText, "audio.speech": nonTextAdapterExecutor, "audio.transcription": nonTextAdapterExecutor },
	mistral: { "text.generate": mistralText, embeddings: openaiEmbeddings, moderations: openaiModerations, "audio.speech": nonTextAdapterExecutor, ocr: nonTextAdapterExecutor, "audio.transcription": nonTextAdapterExecutor },
	"mistral-eu": { "text.generate": mistralText, embeddings: openaiEmbeddings },
	"moonshot-ai": { "text.generate": moonshotText },
	moonshotai: { "text.generate": moonshotText },
	"moonshot-ai-turbo": { "text.generate": moonshotText },
	"moonshotai-turbo": { "text.generate": moonshotText },
	"aion-labs": { "text.generate": aionLabsText },
	aionlabs: { "text.generate": aionLabsText },
	"amazon-bedrock": { "text.generate": amazonBedrockText },
	"google-vertex": { "text.generate": googleVertexText, "video.generate": googleVertexVideo },
	"google-vertex-eu": { "text.generate": googleVertexText },
	deepinfra: { "text.generate": deepinfraText },
	"io-net": { "text.generate": ioNetText },
	fireworks: { "text.generate": fireworksText, embeddings: openaiEmbeddings, rerank: openaiRerank, "image.generate": nonTextAdapterExecutor },
	groq: {
		"text.generate": groqText,
		"audio.transcription": nonTextAdapterExecutor,
		"audio.translations": nonTextAdapterExecutor,
	},
	liquid: { "text.generate": liquidAiText },
	"liquid-ai": { "text.generate": liquidAiText },
	novitaai: { "text.generate": novitaaiText, embeddings: openaiEmbeddings, rerank: openaiRerank },
	novita: { "text.generate": novitaaiText, embeddings: openaiEmbeddings, rerank: openaiRerank },
	perplexity: { "text.generate": perplexityText, embeddings: openaiEmbeddings },
	relace: { "text.generate": relaceText },
	sambanova: { "text.generate": sambanovaText },
	"sail-research": { "text.generate": sailResearchText },
	siliconflow: { "text.generate": siliconflowText },
	stepfun: { "text.generate": stepfunText },
	together: {
		"text.generate": togetherText,
		embeddings: openaiEmbeddings,
		"image.generate": nonTextAdapterExecutor,
		"audio.speech": nonTextAdapterExecutor,
		"audio.transcription": nonTextAdapterExecutor,
		"audio.translations": nonTextAdapterExecutor,
	},
	venice: { "text.generate": veniceText },
	"venice-e2ee": { "text.generate": veniceText },
	voyage: { embeddings: openaiEmbeddings, rerank: openaiRerank },
	voyageai: { embeddings: openaiEmbeddings, rerank: openaiRerank },
	"weights-and-biases": { "text.generate": weightsAndBiasesText },
	meta: {
		"text.generate": metaText,
		"image.generate": nonTextAdapterExecutor,
		"image.edit": nonTextAdapterExecutor,
		"audio.transcription": nonTextAdapterExecutor,
	},
	ovhcloud: {
		"text.generate": ovhcloudText,
		embeddings: openaiEmbeddings,
		moderations: ovhcloudModerations,
		"audio.transcription": nonTextAdapterExecutor,
	},
	sakana: { "text.generate": sakanaText },
	scaleway: { "text.generate": scalewayText, embeddings: openaiEmbeddings, rerank: openaiRerank, "audio.transcription": nonTextAdapterExecutor },
	"thinking-machines": { "text.generate": thinkingMachinesText },
	"black-forest-labs": { "image.generate": blackForestLabsImage, "image.edit": blackForestLabsImage },
	elevenlabs: { "audio.speech": nonTextAdapterExecutor, "audio.transcription": nonTextAdapterExecutor, "music.generate": nonTextAdapterExecutor },
};

export function resolveProviderExecutor(providerId: string, capability: string): ProviderExecutor | null {
	const normalizedCapability = normalizeCapability(capability);
	const provider = EXECUTORS_BY_PROVIDER[normalizeProviderId(providerId)];
	if (provider) {
		const executor = provider[normalizedCapability];
		if (executor) return executor;
	}
	return null;
}

export function isProviderCapabilityEnabled(providerId: string, capability: string): boolean {
	const normalizedCapability = normalizeCapability(capability);
	const provider = EXECUTORS_BY_PROVIDER[normalizeProviderId(providerId)];
	if (provider?.[normalizedCapability]) return true;
	return false;
}
