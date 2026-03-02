// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

const NOVITA_ENABLE_THINKING_MODELS = new Set<string>([
	"zai-org/glm-4.5",
	"deepseek/deepseek-v3.1",
	"deepseek/deepseek-v3.1-terminus",
	"deepseek/deepseek-v3.2-exp",
]);

const NOVITA_SEPARATE_REASONING_MODELS = new Set<string>([
	"deepseek/deepseek-r1-turbo",
]);

function isReasoningEnabled(ir: any): boolean | null {
	if (!ir?.reasoning) return null;
	if (typeof ir.reasoning.enabled === "boolean") return ir.reasoning.enabled;
	if (typeof ir.reasoning.effort === "string") {
		return ir.reasoning.effort !== "none";
	}
	return null;
}

function normalizeNovitaModel(value: unknown): string {
	if (typeof value !== "string") return "";
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return "";
	// Gateway model IDs may include provider prefix (novitaai/<model-id>).
	if (trimmed.startsWith("novitaai/")) return trimmed.slice("novitaai/".length);
	if (trimmed.startsWith("novita-ai/")) return trimmed.slice("novita-ai/".length);
	return trimmed;
}

function modelInAllowlist(model: unknown, allowlist: Set<string>): boolean {
	const normalized = normalizeNovitaModel(model);
	return allowlist.has(normalized);
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
		const modelName = model ?? request.model;

		if (
			request.enable_thinking == null &&
			modelInAllowlist(modelName, NOVITA_ENABLE_THINKING_MODELS)
		) {
			request.enable_thinking = reasoningEnabled;
		}

		if (
			reasoningEnabled &&
			request.separate_reasoning == null &&
			modelInAllowlist(modelName, NOVITA_SEPARATE_REASONING_MODELS)
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

