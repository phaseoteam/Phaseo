// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";


function isReasoningEnabled(ir: any): boolean | null {
	if (!ir?.reasoning) return null;
	if (typeof ir.reasoning.enabled === "boolean") return ir.reasoning.enabled;
	if (typeof ir.reasoning.effort === "string") {
		return ir.reasoning.effort !== "none";
	}
	return null;
}


export const novitaQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		if (!request || typeof request !== "object") return;

		// Novita docs enumerate system/user/assistant roles for message authoring.
		// Normalize OpenAI developer role for compatibility.
		if (Array.isArray(request.messages)) {
			request.messages = request.messages.map((msg: any) =>
				msg?.role === "developer"
					? { ...msg, role: "system" }
					: msg,
			);
		}

		const reasoningEnabled = isReasoningEnabled(ir);
		if (reasoningEnabled === null) return;

		// enable_thinking and separate_reasoning are request fields for every model: hybrid
		// models switch on enable_thinking, models that always reason ignore it, and
		// separate_reasoning only affects reasoning models
		// (https://docs.novita.ai/api-reference/model-apis-llm-create-chat-completion).
		if (request.enable_thinking == null) {
			request.enable_thinking = reasoningEnabled;
		}
		if (reasoningEnabled && request.separate_reasoning == null) {
			request.separate_reasoning = true;
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
