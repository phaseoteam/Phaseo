// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ChatQuirk } from "./types";

const isZAI = (providerId?: string) => providerId === "z-ai" || providerId === "zai";

export const zaiChatQuirk: ChatQuirk = {
	id: "zai",
	matches: isZAI,
	onRequest: ({ ir, request }) => {
		if (ir.reasoning?.effort && ir.reasoning.effort !== "none") {
			request.thinking = {
				type: "enabled",
				clear_thinking: false,
			};
		}
	},
	onResponse: ({ choice }) => {
		const reasoning = choice?.message?.reasoning_content;
		if (typeof reasoning === "string" && reasoning.length > 0) {
			return { reasoning: [reasoning] };
		}
		return null;
	},
};

