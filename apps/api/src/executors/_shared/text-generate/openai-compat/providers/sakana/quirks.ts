// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

type SakanaReasoningEffort = "high" | "xhigh";

function mapReasoningEffortToSakana(value?: string): SakanaReasoningEffort | undefined {
	switch (value) {
		case "high":
			return "high";
		case "xhigh":
		case "max":
			return "xhigh";
		default:
			return undefined;
	}
}

export const sakanaQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		const effort = mapReasoningEffortToSakana(ir.reasoning?.effort);
		if (request.reasoning_effort == null) {
			if (effort) {
				request.reasoning_effort = effort;
			} else if (ir.reasoning?.enabled === true) {
				request.reasoning_effort = "high";
			}
		}

		if ("reasoning" in request) {
			delete request.reasoning;
		}
	},
};
