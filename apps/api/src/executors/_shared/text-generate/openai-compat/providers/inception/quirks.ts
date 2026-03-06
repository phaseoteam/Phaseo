// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

function resolveReasoningEffort(reasoning: any): string | undefined {
	if (!reasoning || typeof reasoning !== "object") return undefined;
	if (typeof reasoning.effort === "string" && reasoning.effort.length > 0) {
		return reasoning.effort;
	}
	if (reasoning.enabled === false) return "none";
	if (reasoning.enabled === true) return "medium";
	return undefined;
}

export const inceptionQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		if (!request || typeof request !== "object") return;

		const effort = resolveReasoningEffort(ir?.reasoning);
		if (request.reasoning_effort == null && typeof effort === "string") {
			request.reasoning_effort = effort;
		}

		if (request.reasoning_summary == null && typeof ir?.reasoning?.summary === "string") {
			request.reasoning_summary = ir.reasoning.summary;
		}

		const inceptionVendor = (ir?.vendor as any)?.inception;
		if (inceptionVendor && typeof inceptionVendor === "object") {
			if (
				request.reasoning_summary_wait == null &&
				(
					typeof inceptionVendor.reasoning_summary_wait === "boolean" ||
					typeof inceptionVendor.reasoning_summary_wait === "number"
				)
			) {
				request.reasoning_summary_wait = inceptionVendor.reasoning_summary_wait;
			}
			if (request.diffusing == null && typeof inceptionVendor.diffusing === "boolean") {
				request.diffusing = inceptionVendor.diffusing;
			}
		}

		if ("reasoning" in request) {
			delete request.reasoning;
		}
	},

	extractReasoning: ({ choice, rawContent }) => {
		const reasoningContent = choice?.message?.reasoning_content;
		return {
			main: rawContent,
			reasoning:
				typeof reasoningContent === "string" && reasoningContent.length > 0
					? [reasoningContent]
					: [],
		};
	},
};
