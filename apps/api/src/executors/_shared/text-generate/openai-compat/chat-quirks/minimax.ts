// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ChatQuirk } from "./types";

export const minimaxChatQuirk: ChatQuirk = {
	id: "minimax",
	matches: (providerId) => providerId === "minimax",
	onResponse: ({ choice }) => {
		const reasoning = choice?.message?.reasoning_content;
		if (typeof reasoning === "string" && reasoning.length > 0) {
			return { reasoning: [reasoning] };
		}
		return null;
	},
};

