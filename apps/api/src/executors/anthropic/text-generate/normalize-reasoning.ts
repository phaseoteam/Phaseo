import type { IRChatRequest, IRReasoning } from "@core/ir";

type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Maps IR effort levels to Anthropic's native effort levels.
 *
 * Anthropic supports 4 effort levels: low, medium, high, max.
 * IR has 7 levels: none, minimal, low, medium, high, xhigh, max.
 *
 * Mapping:
 *   none    → disabled (handled separately)
 *   minimal → low
 *   low     → low
 *   medium  → medium
 *   high    → high
 *   xhigh   → max    (cross-protocol: OpenAI's "xhigh" = Anthropic's "max")
 *   max     → max
 */
const IR_TO_ANTHROPIC_EFFORT: Record<string, "low" | "medium" | "high" | "max"> = {
	minimal: "low",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "max",
	max: "max",
};

const REASONING_EFFORT_TO_PERCENT: Record<string, number> = {
	none: 0.0,
	minimal: 0.15,
	low: 0.30,
	medium: 0.50,
	high: 0.75,
	xhigh: 0.90,
	max: 1.0,
};

function effortToTokens(effort: ReasoningEffort, maxReasoningTokens: number): number {
	const percent = REASONING_EFFORT_TO_PERCENT[effort] ?? 0.5;
	return Math.round(maxReasoningTokens * percent);
}

function normalizeAnthropicReasoning(
	reasoning: IRReasoning | undefined,
	maxReasoningTokens?: number | null,
	supportsAdaptive?: boolean,
): IRReasoning | undefined {
	if (!reasoning) return undefined;
	const normalized: IRReasoning = { ...reasoning };
	const maxTokens = typeof maxReasoningTokens === "number" ? maxReasoningTokens : undefined;

	// Disabled reasoning
	if (normalized.enabled === false || normalized.effort === "none") {
		normalized.enabled = false;
		delete normalized.maxTokens;
		delete normalized.effort;
		return normalized;
	}

	// Adaptive thinking path: preserve effort for models that support it (Opus 4.6+)
	// "max" and "xhigh" always take this path since "max" is exclusive to adaptive-capable models
	if (normalized.effort) {
		const isMaxTier = normalized.effort === "max" || normalized.effort === "xhigh";

		if (isMaxTier || supportsAdaptive) {
			// Map to Anthropic's effort levels and preserve for the executor
			const anthropicEffort = IR_TO_ANTHROPIC_EFFORT[normalized.effort];
			if (anthropicEffort) {
				normalized.effort = anthropicEffort;
				normalized.enabled = true;
				delete normalized.maxTokens;
				return normalized;
			}
		}
	}

	// Legacy budget-based path: convert effort to token budget
	if (normalized.maxTokens === undefined && normalized.effort && maxTokens) {
		normalized.maxTokens = effortToTokens(normalized.effort as ReasoningEffort, maxTokens);
	}

	if (normalized.maxTokens === undefined && normalized.effort && !maxTokens) {
		normalized.enabled = normalized.effort !== "none";
	}

	delete normalized.effort;
	return normalized;
}

export function withNormalizedReasoning(
	ir: IRChatRequest,
	capabilityParams?: Record<string, any> | null,
): IRChatRequest {
	const nextReasoning = normalizeAnthropicReasoning(
		ir.reasoning,
		capabilityParams?.reasoning?.maxReasoningTokens,
		capabilityParams?.reasoning?.supportsAdaptive ?? false,
	);
	if (nextReasoning === ir.reasoning) return ir;
	const next: IRChatRequest = { ...ir };
	if (nextReasoning) {
		next.reasoning = nextReasoning;
	} else {
		delete next.reasoning;
	}
	return next;
}
