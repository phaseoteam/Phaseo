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

function supportsNovitaSeparateReasoning(model: unknown): boolean {
	const value = typeof model === "string" ? model.toLowerCase() : "";
	// Novita docs currently list separate_reasoning support for deepseek-r1-turbo.
	return value.includes("deepseek-r1");
}

export const novitaQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir, model }) => {
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

		if (request.enable_thinking == null) {
			request.enable_thinking = reasoningEnabled;
		}

		const modelName = model ?? request.model;
		if (
			reasoningEnabled &&
			request.separate_reasoning == null &&
			supportsNovitaSeparateReasoning(modelName)
		) {
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

