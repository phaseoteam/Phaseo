// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Default Provider Quirks
// Standard OpenAI-compatible behavior

import type { ProviderQuirks } from "./types";

export const defaultQuirks: ProviderQuirks = {
	extractReasoning: ({ rawContent }) => {
		return {
			main: rawContent,
			reasoning: [],
		};
	},
};

