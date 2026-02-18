// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";
import { normalizeTextProviderServiceTier } from "@providers/textProfiles";

export const openAIQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		const normalizedTier = normalizeTextProviderServiceTier(
			"openai",
			request.service_tier,
		);
		if (normalizedTier) {
			request.service_tier = normalizedTier;
		}
	},
};
