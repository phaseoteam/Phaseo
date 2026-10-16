// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Preserves Venice extensions and reasoning across Chat/Responses formats.

import type { ProviderQuirks } from "../../quirks/types";

export const veniceQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		const veniceParameters = (ir.vendor as any)?.venice;
		if (veniceParameters && typeof veniceParameters === "object" && !Array.isArray(veniceParameters)) {
			request.venice_parameters = { ...veniceParameters };
		}

		const isResponsesRequest = request.input_items != null || request.input != null;
		if (!isResponsesRequest) return;

		if (request.input == null && request.input_items != null) {
			request.input = request.input_items;
			delete request.input_items;
		}
	},
	extractReasoning: ({ choice, rawContent }) => {
		const reasoning = choice.message?.reasoning_content || choice.message?.reasoning;
		return {
			main: rawContent,
			reasoning: typeof reasoning === "string" && reasoning.length > 0 ? [reasoning] : [],
		};
	},
	transformStreamChunk: ({ chunk }) => {
		if (!Array.isArray(chunk?.choices)) return;
		for (const choice of chunk.choices) {
			const reasoning = choice?.delta?.reasoning_content || choice?.delta?.reasoning;
			if (typeof reasoning !== "string" || reasoning.length === 0) continue;
			choice.delta.reasoning_content ||= reasoning;
			choice.delta.reasoning_details ??= [{ type: "text", text: reasoning }];
		}
	},
};
