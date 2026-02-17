// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

function toPerplexityReasoningEffort(value: string): "minimal" | "low" | "medium" | "high" | null {
	const normalized = value.toLowerCase();
	if (normalized === "xlow" || normalized === "minimal") return "minimal";
	if (normalized === "low") return "low";
	if (normalized === "medium") return "medium";
	if (normalized === "high" || normalized === "xhigh") return "high";
	if (normalized === "none") return null;
	return null;
}

export const perplexityQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		if (!request || typeof request !== "object") return;

		// Perplexity chat role enum does not include OpenAI's "developer" role.
		// Normalize to "system" before dispatch.
		if (Array.isArray(request.messages)) {
			request.messages = request.messages.map((msg: any) =>
				msg?.role === "developer"
					? { ...msg, role: "system" }
					: msg,
			);
		}

		// Perplexity uses top-level reasoning_effort for reasoning controls.
		if (request.reasoning_effort == null) {
			const effort = ir?.reasoning?.effort;
			if (typeof effort === "string") {
				const mapped = toPerplexityReasoningEffort(effort);
				if (mapped) request.reasoning_effort = mapped;
			} else if (ir?.reasoning?.enabled === true) {
				request.reasoning_effort = "medium";
			}
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
