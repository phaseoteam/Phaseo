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

// Text generation executors
import { executor as openaiText } from "./openai/text-generate";
import { executor as anthropicText } from "./anthropic/text-generate";
import { executor as googleText } from "./google/text-generate";
import { executor as googleAiStudioText } from "./google-ai-studio/text-generate";
import { executor as deepseekText } from "./deepseek/text-generate";
import { executor as xiaomiText } from "./xiaomi/text-generate";
import { executor as minimaxText } from "./minimax/text-generate";
import { executor as zAiText } from "./z-ai/text-generate";
import { executor as zaiText } from "./zai/text-generate";
import { executor as alibabaText } from "./alibaba/text-generate";
import { executor as qwenText } from "./qwen/text-generate";
import { executor as moonshotaiText } from "./moonshotai/text-generate";
import { executor as xAiText } from "./x-ai/text-generate";
import { executor as groqText } from "./groq/text-generate";
import { executor as togetherText } from "./together/text-generate";
import { executor as fireworksText } from "./fireworks/text-generate";
import { executor as cerebrasText } from "./cerebras/text-generate";
import { executor as mistralText } from "./mistral/text-generate";
import { executor as perplexityText } from "./perplexity/text-generate";
import { executor as cohereText } from "./cohere/text-generate";
import { executor as deepinfraText } from "./deepinfra/text-generate";
import { executor as novitaaiText } from "./novitaai/text-generate";
import { executor as basetenText } from "./baseten/text-generate";
import { executor as liquidAiText } from "./liquid-ai/text-generate";
import { executor as aionLabsText } from "./aion-labs/text-generate";
import { executor as aionlabsText } from "./aionlabs/text-generate";
import { executor as azureText } from "./azure/text-generate";

// Image generation executors
import { executor as openaiImage } from "./openai/image-generate";
import { executor as falImage } from "./fal/image-generate";

// Audio generation executors
import { executor as openaiAudio } from "./openai/audio-generate";
import { executor as falAudio } from "./fal/audio-generate";

// Video generation executors
import { executor as googleVideo } from "./google/video-generate";
import { executor as falVideo } from "./fal/video-generate";

type Capability = "text.generate" | "image.generate" | "video.generate" | "audio.generate";
type ProviderCapabilityMap = Partial<Record<Capability, ProviderExecutor>>;

export const EXECUTORS_BY_PROVIDER: Record<string, ProviderCapabilityMap> = {
	openai: {
		"text.generate": openaiText,
		"image.generate": openaiImage,
		"audio.generate": openaiAudio,
	},
	anthropic: {
		"text.generate": anthropicText,
	},
	google: {
		"text.generate": googleText,
		"video.generate": googleVideo,
	},
	"google-ai-studio": {
		"text.generate": googleAiStudioText,
		"video.generate": googleVideo,
	},
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
	deepseek: { "text.generate": deepseekText },
	xiaomi: { "text.generate": xiaomiText },
	minimax: { "text.generate": minimaxText },
	"minimax-lightning": { "text.generate": minimaxText },
	"z-ai": { "text.generate": zAiText },
	zai: { "text.generate": zaiText },
	alibaba: { "text.generate": alibabaText },
	qwen: { "text.generate": qwenText },
	moonshotai: { "text.generate": moonshotaiText },
	"moonshot-ai": { "text.generate": moonshotaiText },
	"moonshot-ai-turbo": { "text.generate": moonshotaiText },
	"x-ai": { "text.generate": xAiText },
	groq: { "text.generate": groqText },
	together: { "text.generate": togetherText },
	fireworks: { "text.generate": fireworksText },
	cerebras: { "text.generate": cerebrasText },
	mistral: { "text.generate": mistralText },
	perplexity: { "text.generate": perplexityText },
	cohere: { "text.generate": cohereText },
	deepinfra: { "text.generate": deepinfraText },
	novitaai: { "text.generate": novitaaiText },
	baseten: { "text.generate": basetenText },
	"liquid-ai": { "text.generate": liquidAiText },
	"aion-labs": { "text.generate": aionLabsText },
	aionlabs: { "text.generate": aionlabsText },
	ai21: { "text.generate": openaiText },
	"arcee-ai": { "text.generate": openaiText },
	arcee: { "text.generate": openaiText },
	atlascloud: { "text.generate": openaiText },
	"atlas-cloud": { "text.generate": openaiText },
	azure: { "text.generate": azureText },
	"amazon-bedrock": { "text.generate": openaiText },
	clarifai: { "text.generate": openaiText },
	cloudflare: { "text.generate": openaiText },
	crusoe: { "text.generate": openaiText },
	featherless: { "text.generate": openaiText },
	friendli: { "text.generate": openaiText },
	gmicloud: { "text.generate": openaiText },
	"google-vertex": { "text.generate": openaiText },
	hyperbolic: { "text.generate": openaiText },
	inception: { "text.generate": openaiText },
	infermatic: { "text.generate": openaiText },
	inflection: { "text.generate": openaiText },
	mancer: { "text.generate": openaiText },
	morph: { "text.generate": openaiText },
	morpheus: { "text.generate": openaiText },
	"nebius-token-factory": { "text.generate": openaiText },
	parasail: { "text.generate": openaiText },
	phala: { "text.generate": openaiText },
	relace: { "text.generate": openaiText },
	sambanova: { "text.generate": openaiText },
	siliconflow: { "text.generate": openaiText },
	sourceful: { "text.generate": openaiText },
	"weights-and-biases": { "text.generate": openaiText },
	"bytedance-seed": { "text.generate": openaiText },
};

export function resolveProviderExecutor(providerId: string, capability: string): ProviderExecutor | null {
	const provider = EXECUTORS_BY_PROVIDER[providerId];
	if (provider) {
		return provider[capability as Capability] ?? null;
	}
	return null;
}

