// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";
import { applyJsonSchemaFallback } from "../../quirks/structured";

export const mistralQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		// Mistral compatibility endpoints are stricter than OpenAI's json_schema envelope.
		applyJsonSchemaFallback(request);
	},
};


