// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

type ArceeReasoningEffort = "minimal" | "low" | "medium" | "high";

function mapReasoningEffortToArcee(value?: string): ArceeReasoningEffort | undefined {
	switch (value) {
		case "none":
			return "minimal";
		case "minimal":
			return "minimal";
		case "low":
			return "low";
		case "medium":
			return "medium";
		case "high":
		case "xhigh":
			return "high";
		default:
			return undefined;
	}
}

export const arceeQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		const effort = mapReasoningEffortToArcee(ir.reasoning?.effort);
		if (effort) {
			request.reasoning_effort = effort;
		} else if (ir.reasoning?.enabled === false) {
			// Arcee does not expose a strict "off" switch; approximate with minimal effort.
			request.reasoning_effort = "minimal";
		}

		// Avoid forwarding OpenAI-style reasoning object to Arcee.
		if ("reasoning" in request) {
			delete request.reasoning;
		}
	},
};
