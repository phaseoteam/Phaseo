// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";
import { applyJsonSchemaFallback } from "../../quirks/structured";

const isMoonshot = (providerId?: string) =>
	providerId === "moonshot-ai" || providerId === "moonshot-ai-turbo";

export const moonshotQuirks: ProviderQuirks = {
	transformRequest: ({ request }) => {
		// Moonshot compatibility validates schema payload shape differently.
		applyJsonSchemaFallback(request);
	},
};

export { isMoonshot };


