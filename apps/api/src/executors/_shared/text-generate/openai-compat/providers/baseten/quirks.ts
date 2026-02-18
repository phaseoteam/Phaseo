// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

function resolveReasoningEnabled(reasoning: any): boolean | undefined {
	if (!reasoning || typeof reasoning !== "object") return undefined;
	if (typeof reasoning.enabled === "boolean") return reasoning.enabled;
	if (typeof reasoning.effort === "string") {
		return reasoning.effort !== "none";
	}
	return undefined;
}

export const basetenQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		const enabled = resolveReasoningEnabled(ir.reasoning);
		if (typeof enabled !== "boolean") return;

		request.chat_template_args = {
			...(request.chat_template_args && typeof request.chat_template_args === "object"
				? request.chat_template_args
				: {}),
			enable_thinking: enabled,
		};
	},
};

