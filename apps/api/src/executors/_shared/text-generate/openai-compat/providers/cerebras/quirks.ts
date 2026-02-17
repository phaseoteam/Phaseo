// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { ProviderQuirks } from "../../quirks/types";

type CerebrasReasoningEffort = "none" | "low" | "medium" | "high";
const CEREBRAS_UNSUPPORTED_FIELDS = [
	"prompt_cache_key",
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

function normalizeCerebrasServiceTier(value: unknown): string | undefined {
	if (typeof value !== "string" || value.length === 0) return undefined;
	if (value === "standard") return "default";
	return value;
}

function isObject(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBooleanOrNull(value: unknown): value is boolean | null {
	return typeof value === "boolean" || value === null;
}

function isNonNegativeInteger(value: unknown): value is number {
	return Number.isInteger(value) && Number(value) >= 0;
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

		if ("max_reasoning_tokens" in raw && request.max_reasoning_tokens == null) {
			if (isNonNegativeInteger(raw.max_reasoning_tokens)) {
				request.max_reasoning_tokens = raw.max_reasoning_tokens;
			}
		}

		if ("clear_thinking" in raw && request.clear_thinking == null) {
			request.clear_thinking = raw.clear_thinking;
		}
		if ("disable_reasoning" in raw && request.disable_reasoning == null) {
			request.disable_reasoning = raw.disable_reasoning;
		}

		if (typeof request.max_tokens === "number" && request.max_completion_tokens == null) {
			request.max_completion_tokens = request.max_tokens;
			delete request.max_tokens;
		}

		if (typeof ir.reasoning?.maxTokens === "number" && request.max_reasoning_tokens == null) {
			request.max_reasoning_tokens = ir.reasoning.maxTokens;
		}

		const effort = mapReasoningEffortToCerebras(ir.reasoning?.effort);
		if (effort) {
			request.reasoning_effort = effort;
		} else if (ir.reasoning?.enabled === false) {
			request.reasoning_effort = "none";
		} else if (ir.reasoning?.enabled === true) {
			request.reasoning_effort = "medium";
		}

		if (Array.isArray(request.messages)) {
			request.messages = request.messages.map((msg: any) =>
				msg?.role === "developer"
					? { ...msg, role: "system" }
					: msg,
			);
		}

		const normalizedTier = normalizeCerebrasServiceTier(request.service_tier);
		if (normalizedTier) {
			request.service_tier = normalizedTier;
		}

		for (const key of CEREBRAS_UNSUPPORTED_FIELDS) {
			delete request[key];
		}

		// Cerebras marks these OpenAI fields as unsupported.
		// Keep request construction deterministic to avoid upstream 400+retry loops.
		delete request.frequency_penalty;
		delete request.presence_penalty;
		delete request.logit_bias;

		if (isObject(request.response_format) && request.reasoning_effort && request.reasoning_effort !== "none") {
			// Cerebras docs: response_format is unsupported with reasoning models.
			// Drop it proactively when reasoning is enabled.
			delete request.response_format;
		}

		// Cerebras exposes these as model-specific Z.AI extensions.
		// Keep request routing resilient by silently dropping unsupported/invalid values.
		if (!isGlm || !isBooleanOrNull(request.clear_thinking)) {
			delete request.clear_thinking;
		}
		if (!isGlm || !isBooleanOrNull(request.disable_reasoning)) {
			delete request.disable_reasoning;
		}

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
