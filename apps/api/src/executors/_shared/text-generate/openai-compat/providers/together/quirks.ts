// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

function mapReasoningEffortToTogether(value?: string): "low" | "medium" | "high" | undefined {
	if (typeof value !== "string") return undefined;
	switch (value.toLowerCase()) {
		case "xlow":
		case "minimal":
		case "low":
			return "low";
		case "medium":
			return "medium";
		case "high":
		case "xhigh":
			return "high";
		case "none":
		default:
			return undefined;
	}
}

export const togetherQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		if (!request || typeof request !== "object") return;

		// Together compatibility chat schema does not include OpenAI's developer role.
		if (Array.isArray(request.messages)) {
			request.messages = request.messages.map((msg: any) =>
				msg?.role === "developer"
					? { ...msg, role: "system" }
					: msg,
			);
		}

		// Map OpenAI-style tool choice object to Together's string form when possible.
		const toolChoice = request.tool_choice;
		if (toolChoice && typeof toolChoice === "object" && !Array.isArray(toolChoice)) {
			if (toolChoice.type === "function" && typeof toolChoice.function?.name === "string") {
				request.tool_choice = toolChoice.function.name;
			} else if (
				toolChoice.type === "auto" ||
				toolChoice.type === "none" ||
				toolChoice.type === "required"
			) {
				request.tool_choice = toolChoice.type;
			}
		}

		// Together reasoning control uses top-level reasoning_effort.
		// Supported values are low|medium|high; "none" is omitted.
		if (request.reasoning_effort == null) {
			const mappedEffort = mapReasoningEffortToTogether(ir?.reasoning?.effort);
			if (mappedEffort) {
				request.reasoning_effort = mappedEffort;
			} else if (ir?.reasoning?.enabled === true) {
				request.reasoning_effort = "low";
			}
		}

		if ("reasoning" in request) {
			delete request.reasoning;
		}
	},
};

