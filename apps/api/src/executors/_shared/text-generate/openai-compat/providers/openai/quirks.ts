// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

function normalizeOpenAIServiceTier(value: unknown): string | undefined {
	if (typeof value !== "string" || value.length === 0) return undefined;
	if (value === "standard") return "default";
	return value;
}

export const openAIQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		const normalizedTier = normalizeOpenAIServiceTier(request.service_tier);
		if (normalizedTier) {
			request.service_tier = normalizedTier;
		}
	},
};
