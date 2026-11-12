// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";
import { normalizeTextProviderServiceTier } from "@providers/textProfiles";

type CerebrasReasoningEffort = "none" | "low" | "medium" | "high";
const CEREBRAS_UNSUPPORTED_FIELDS = [
	"safety_identifier",
] as const;

function mapReasoningEffortToCerebras(value?: string): CerebrasReasoningEffort | undefined {
	switch (value) {
		case "none":
			return "none";
		case "minimal":
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

function isObject(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBooleanOrNull(value: unknown): value is boolean | null {
	return typeof value === "boolean" || value === null;
}

function normalizeCerebrasReasoningEffort(value: unknown): CerebrasReasoningEffort | undefined {
	if (typeof value !== "string") return undefined;
	switch (value) {
		case "none":
		case "low":
		case "medium":
		case "high":
			return value;
		default:
			return undefined;
	}
}

function isZaiGlmModel(value: unknown): boolean {
	if (typeof value !== "string") return false;
	return value.toLowerCase().includes("glm-4.7");
}

export const cerebrasQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => {
		const raw = isObject(ir.rawRequest) ? ir.rawRequest : {};
		const model = typeof request.model === "string" ? request.model : (typeof ir.model === "string" ? ir.model : "");
		const isGlm = isZaiGlmModel(model);

		if ("prediction" in raw && request.prediction == null && isObject(raw.prediction)) {
			request.prediction = raw.prediction;
		}

		if ("reasoning_effort" in raw && request.reasoning_effort == null) {
			const normalizedRawEffort = normalizeCerebrasReasoningEffort(raw.reasoning_effort);
			if (normalizedRawEffort) {
				request.reasoning_effort = normalizedRawEffort;
			}
		}

		if ("clear_thinking" in raw && request.clear_thinking == null) {
			request.clear_thinking = raw.clear_thinking;
		}
		if (["parsed", "raw", "hidden"].includes(raw.reasoning_format)) {
			request.reasoning_format = raw.reasoning_format;
		}

		if (typeof request.max_tokens === "number" && request.max_completion_tokens == null) {
			request.max_completion_tokens = request.max_tokens;
			delete request.max_tokens;
		}

		const effort = mapReasoningEffortToCerebras(ir.reasoning?.effort);
		if (effort) {
			request.reasoning_effort = effort;
		} else if (ir.reasoning?.enabled === false) {
			request.reasoning_effort = "none";
		} else if (ir.reasoning?.enabled === true) {
			request.reasoning_effort = "medium";
		}
		// gpt-oss takes low, medium or high only; its reasoning cannot be turned off
		// (https://inference-docs.cerebras.ai/api-reference/chat-completions).
		if (model.toLowerCase().includes("gpt-oss") && request.reasoning_effort === "none") {
			delete request.reasoning_effort;
		}

		if (Array.isArray(request.messages)) {
			request.messages = request.messages.map((msg: any) =>
				msg?.role === "developer"
					? { ...msg, role: "system" }
					: msg,
			);
		}

		const normalizedTier = normalizeTextProviderServiceTier(
			"cerebras",
			request.service_tier,
		);
		if (normalizedTier) {
			request.service_tier = normalizedTier;
		}

		for (const key of CEREBRAS_UNSUPPORTED_FIELDS) {
			delete request[key];
		}

		// Cerebras exposes these as model-specific Z.AI extensions.
		// Keep request routing resilient by silently dropping unsupported/invalid values.
		if (!isGlm || !isBooleanOrNull(request.clear_thinking)) {
			delete request.clear_thinking;
		}
		// disable_reasoning was removed with the v2 default; reasoning_effort="none" replaces it.
		delete request.disable_reasoning;

		if ("reasoning" in request) {
			delete request.reasoning;
		}
	},

	extractReasoning: ({ choice, rawContent }) => {
		const reasoningRaw = choice?.message?.reasoning_content ?? choice?.message?.reasoning;
		const reasoning = typeof reasoningRaw === "string" && reasoningRaw.length > 0
			? [reasoningRaw]
			: [];
		return { main: rawContent, reasoning };
	},

	transformStreamChunk: ({ chunk }) => {
		if (!chunk || !Array.isArray(chunk.choices)) return;
		for (const choice of chunk.choices) {
			if (typeof choice?.delta?.reasoning === "string" && !choice.delta.reasoning_content) {
				choice.delta.reasoning_content = choice.delta.reasoning;
			}
			if (typeof choice?.message?.reasoning === "string" && !choice.message.reasoning_content) {
				choice.message.reasoning_content = choice.message.reasoning;
			}
		}
	},
};
