// Purpose: Map Doubleword's documented service-tier and reasoning contract through shared IR.

import type { ProviderQuirks } from "../../quirks/types";

export const doublewordQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		// Doubleword uses the OpenAI Responses service_tier values: priority for
		// realtime and flex for asynchronous inference. Phaseo's standard tier is
		// the default realtime offer, so normalize it to Doubleword's priority tier.
		if (request.service_tier === "standard") request.service_tier = "priority";

		if (request.reasoning_effort != null || !ir.reasoning) return;
		const effort = ir.reasoning.effort
			?? (ir.reasoning.enabled === false ? "none" : ir.reasoning.enabled === true ? "medium" : undefined);
		if (effort !== undefined) {
			if ("input" in request) request.reasoning = { effort };
			else request.reasoning_effort = effort;
		}
	},
	extractReasoning: ({ choice, rawContent }) => {
		const reasoning = choice?.message?.reasoning_content ?? choice?.reasoning_content;
		return {
			main: rawContent,
			reasoning: typeof reasoning === "string" && reasoning.length > 0 ? [reasoning] : [],
		};
	},
};
