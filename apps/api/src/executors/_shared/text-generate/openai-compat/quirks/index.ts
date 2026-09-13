// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Provider Quirks Registry
// Maps provider IDs to their specific quirks

import type { ProviderQuirks } from "./types";
import { aionQuirks } from "../providers/aion-labs/quirks";
import { minimaxQuirks } from "../providers/minimax/quirks";
import { vertexOpenModelQuirks } from "../providers/google-vertex/quirks";
import { zaiQuirks } from "../providers/z-ai/quirks";
import { deepseekQuirks } from "../providers/deepseek/quirks";
import { xiaomiQuirks } from "../providers/xiaomi/quirks";
import { xAiQuirks } from "../providers/x-ai/quirks";
import { groqQuirks } from "../providers/groq/quirks";
import { mistralQuirks } from "../providers/mistral/quirks";
import { moonshotQuirks } from "../providers/moonshot-ai/quirks";
import { arceeQuirks } from "../providers/arcee/quirks";
import { cerebrasQuirks } from "../providers/cerebras/quirks";
import { fireworksQuirks } from "../providers/fireworks/quirks";
import { novitaQuirks } from "../providers/novitaai/quirks";
import { perplexityQuirks } from "../providers/perplexity/quirks";
import { openAIQuirks } from "../providers/openai/quirks";
import { basetenQuirks } from "../providers/baseten/quirks";
import { cohereQuirks } from "../providers/cohere/quirks";
import { togetherQuirks } from "../providers/together/quirks";
import { inceptionQuirks } from "../providers/inception/quirks";
import { crofAIQuirks } from "../providers/crofai/quirks";
import { veniceQuirks } from "../providers/venice/quirks";
import { sakanaQuirks } from "../providers/sakana/quirks";
import { waferQuirks } from "../providers/wafer/quirks";
import { ambientQuirks } from "../providers/ambient/quirks";
import { baiduQuirks } from "../providers/baidu/quirks";
import { chutesQuirks } from "../providers/chutes/quirks";
import { bytePlusQuirks } from "../providers/byteplus/quirks";
import { cloudflareQuirks } from "../providers/cloudflare/quirks";
import { deepInfraQuirks } from "../providers/deepinfra/quirks";
import { hyperbolicQuirks } from "../providers/hyperbolic/quirks";
import { infermaticQuirks } from "../providers/infermatic/quirks";
import { longCatQuirks } from "../providers/longcat/quirks";
import { friendliQuirks } from "../providers/friendli/quirks";
import { gmiCloudQuirks } from "../providers/gmicloud/quirks";
import { darkbloomQuirks } from "../providers/darkbloom/quirks";
import { featherlessQuirks } from "../providers/featherless/quirks";
import { inferenceNetQuirks } from "../providers/inference-net/quirks";
import { mancerQuirks } from "../providers/mancer/quirks";
import { maraQuirks } from "../providers/mara/quirks";
import { poolsideQuirks } from "../providers/poolside/quirks";
import { rekaQuirks } from "../providers/reka/quirks";
import { siliconFlowQuirks } from "../providers/siliconflow/quirks";
import { stepFunQuirks } from "../providers/stepfun/quirks";
import { sambaNovaQuirks } from "../providers/sambanova/quirks";
import { scalewayQuirks } from "../providers/scaleway/quirks";
import { weightsAndBiasesQuirks } from "../providers/weights-and-biases/quirks";
import { defaultQuirks } from "./default";

/**
 * Provider quirks registry
 * Add new providers here as they need custom handling
 */
const PROVIDER_QUIRKS: Record<string, ProviderQuirks> = {
	"google-vertex": vertexOpenModelQuirks,
	"google-vertex-eu": vertexOpenModelQuirks,
	"aion-labs": aionQuirks,
	aionlabs: aionQuirks,
	minimax: minimaxQuirks,
	"minimax-lightning": minimaxQuirks,
	"z-ai": zaiQuirks,
	zai: zaiQuirks,
	deepseek: deepseekQuirks,
	mistral: mistralQuirks,
	"mistral-eu": mistralQuirks,
	"moonshot-ai": moonshotQuirks,
	moonshotai: moonshotQuirks,
	"moonshot-ai-turbo": moonshotQuirks,
	"moonshotai-turbo": moonshotQuirks,
	xiaomi: xiaomiQuirks,
	"spacex-ai": xAiQuirks,
	"x-ai": xAiQuirks,
	xai: xAiQuirks,
	groq: groqQuirks,
	arcee: arceeQuirks,
	"arcee-ai": arceeQuirks,
	cerebras: cerebrasQuirks,
	fireworks: fireworksQuirks,
	novitaai: novitaQuirks,
	novita: novitaQuirks,
	"novita-ai": novitaQuirks,
	perplexity: perplexityQuirks,
	openai: openAIQuirks,
	baseten: basetenQuirks,
	cohere: cohereQuirks,
	crofai: crofAIQuirks,
	together: togetherQuirks,
	inception: inceptionQuirks,
	venice: veniceQuirks,
	"venice-e2ee": veniceQuirks,
	sakana: sakanaQuirks,
	wafer: waferQuirks,
	ambient: ambientQuirks,
	baidu: baiduQuirks,
	chutes: chutesQuirks,
	byteplus: bytePlusQuirks,
	cloudflare: cloudflareQuirks,
	deepinfra: deepInfraQuirks,
	hyperbolic: hyperbolicQuirks,
	infermatic: infermaticQuirks,
	longcat: longCatQuirks,
	friendli: friendliQuirks,
	gmicloud: gmiCloudQuirks,
	darkbloom: darkbloomQuirks,
	featherless: featherlessQuirks,
	"inference-net": inferenceNetQuirks,
	mancer: mancerQuirks,
	mara: maraQuirks,
	poolside: poolsideQuirks,
	reka: rekaQuirks,
	siliconflow: siliconFlowQuirks,
	stepfun: stepFunQuirks,
	sambanova: sambaNovaQuirks,
	scaleway: scalewayQuirks,
	"weights-and-biases": weightsAndBiasesQuirks,
	// Note: Google quirks removed - Google now uses native implementation, not OpenAI-compat
};

/**
 * Get quirks for a provider
 * Returns default quirks if provider has no custom quirks
 */
export function getProviderQuirks(providerId?: string | null): ProviderQuirks {
	if (!providerId) return defaultQuirks;
	return PROVIDER_QUIRKS[providerId] ?? defaultQuirks;
}

export type { ProviderQuirks } from "./types";
