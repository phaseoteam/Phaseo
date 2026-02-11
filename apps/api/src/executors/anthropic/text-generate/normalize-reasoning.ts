import type { IRChatRequest, IRReasoning } from "@core/ir";

type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const REASONING_EFFORT_TO_PERCENT: Record<ReasoningEffort, number> = {
	none: 0.0,
	minimal: 0.15,
	low: 0.30,
	medium: 0.50,
	high: 0.75,
	xhigh: 0.90,
	max: 0.90,
};

function effortToTokens(effort: ReasoningEffort, maxReasoningTokens: number): number {
	const percent = REASONING_EFFORT_TO_PERCENT[effort] ?? 0.5;
	return Math.round(maxReasoningTokens * percent);
}

function normalizeAnthropicReasoning(
	reasoning: IRReasoning | undefined,
	maxReasoningTokens?: number | null,
): IRReasoning | undefined {
	if (!reasoning) return undefined;
	const normalized: IRReasoning = { ...reasoning };
	const maxTokens = typeof maxReasoningTokens === "number" ? maxReasoningTokens : undefined;

	if (normalized.enabled === false || normalized.effort === "none") {
		normalized.enabled = false;
		delete normalized.maxTokens;
		delete normalized.effort;
		return normalized;
	}

	if (normalized.maxTokens === undefined && normalized.effort && maxTokens) {
		normalized.maxTokens = effortToTokens(normalized.effort as ReasoningEffort, maxTokens);
	}

	if (normalized.maxTokens === undefined && normalized.effort && !maxTokens) {
		normalized.enabled = true;
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
