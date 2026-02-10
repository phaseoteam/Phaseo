// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Provider Quirks Registry
// Maps provider IDs to their specific quirks

import type { ProviderQuirks } from "./types";
import { aionQuirks } from "../providers/aion-labs/quirks";
import { minimaxQuirks } from "../providers/minimax/quirks";
import { zaiQuirks } from "../providers/z-ai/quirks";
import { deepseekQuirks } from "../providers/deepseek/quirks";
import { xiaomiQuirks } from "../providers/xiaomi/quirks";
import { xAiQuirks } from "../providers/x-ai/quirks";
import { mistralQuirks } from "../providers/mistral/quirks";
import { moonshotQuirks } from "../providers/moonshot-ai/quirks";
import { defaultQuirks } from "./default";

/**
 * Provider quirks registry
 * Add new providers here as they need custom handling
 */
const PROVIDER_QUIRKS: Record<string, ProviderQuirks> = {
	"aion-labs": aionQuirks,
	aionlabs: aionQuirks,
	minimax: minimaxQuirks,
	"minimax-lightning": minimaxQuirks,
	"z-ai": zaiQuirks,
	zai: zaiQuirks,
	deepseek: deepseekQuirks,
	mistral: mistralQuirks,
	"moonshot-ai": moonshotQuirks,
	"moonshot-ai-turbo": moonshotQuirks,
	xiaomi: xiaomiQuirks,
	"x-ai": xAiQuirks,
	xai: xAiQuirks,
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

