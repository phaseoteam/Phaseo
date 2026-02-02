// Purpose: Reasoning parameter normalization and conversion.
// Why: Different providers use different reasoning representations (effort vs tokens).
// How: Converts between effort levels and token budgets based on provider capabilities.

import type { IRReasoning } from "@core/ir";
import type { ProviderCandidate } from "./types";
import { effortToTokens, tokensToEffort, getReasoningConfig } from "./paramConfig";

/**
 * Normalize reasoning parameters for a specific provider
 * Converts between effort and tokens based on what the provider supports
 */
export function normalizeReasoningForProvider(
	reasoning: IRReasoning | undefined,
	candidate: ProviderCandidate
): IRReasoning | undefined {
	if (!reasoning) return undefined;

	const reasoningConfig = getReasoningConfig(candidate.capabilityParams);

	// If provider doesn't support reasoning, return undefined
	if (!reasoningConfig.supported) {
		return undefined;
	}

	// Provider supports reasoning - normalize based on style
	const normalized: IRReasoning = { ...reasoning };
	const style = reasoningConfig.style || "tokens";
	const maxReasoningTokens = reasoningConfig.maxReasoningTokens;

	if (style === "effort") {
		// Provider uses effort levels
		if (reasoning.effort) {
			normalized.effort = reasoning.effort;
			delete normalized.maxTokens;
		} else if (reasoning.maxTokens && maxReasoningTokens) {
			// Convert tokens to effort
			const effort = tokensToEffort(reasoning.maxTokens, maxReasoningTokens);
			normalized.effort = effort as any;
			delete normalized.maxTokens;
		} else {
			// Default to medium
			normalized.effort = "medium";
			delete normalized.maxTokens;
		}
	} else if (style === "tokens") {
		// Provider uses token budget
		if (reasoning.maxTokens) {
			normalized.maxTokens = reasoning.maxTokens;
			delete normalized.effort;
		} else if (reasoning.effort && maxReasoningTokens) {
			// Convert effort to tokens
			const tokens = effortToTokens(reasoning.effort, maxReasoningTokens);
			normalized.maxTokens = tokens;
			delete normalized.effort;
		} else if (maxReasoningTokens) {
			// Default to medium effort (50%)
			normalized.maxTokens = effortToTokens("medium", maxReasoningTokens);
			delete normalized.effort;
		}
	}

	return normalized;
}

/**
 * Check if a provider can handle the requested reasoning parameters
 */
export function canProviderHandleReasoning(
	reasoning: IRReasoning | undefined,
	candidate: ProviderCandidate
): boolean {
	// No reasoning requested - any provider works
	if (!reasoning) return true;

	const reasoningConfig = getReasoningConfig(candidate.capabilityParams);

	// Provider doesn't support reasoning but user wants it
	if (!reasoningConfig.supported) {
		return false;
	}

	// Check if reasoning is explicitly disabled
	if (reasoning.enabled === false) {
		return true; // Any provider can handle disabled reasoning
	}

	// Provider supports reasoning - we can normalize it
	return true;
}

/**
 * Determine if reasoning is requested in the body
 */
export function isReasoningRequested(body: any): boolean {
	if (body.reasoning) {
		if (body.reasoning.enabled === false) return false;
		if (body.reasoning.effort && body.reasoning.effort !== "none") return true;
		if (body.reasoning.maxTokens && body.reasoning.maxTokens > 0) return true;
		if (body.reasoning.enabled === true) return true;
	}
	if (body.reasoning_effort && body.reasoning_effort !== "none") return true;
	if (body.include_reasoning === true) return true;
	return false;
}

/**
 * Extract reasoning configuration from request body
 */
export function extractReasoningFromBody(body: any): IRReasoning | undefined {
	// Check top-level reasoning field first
	if (body.reasoning && typeof body.reasoning === "object") {
		return body.reasoning as IRReasoning;
	}

	// Check alternative fields
	const reasoning: IRReasoning = {};

	if (body.reasoning_effort) {
		reasoning.effort = body.reasoning_effort as any;
	}

	if (body.include_reasoning === true) {
		reasoning.enabled = true;
	}

	if (body.verbosity !== undefined) {
		// MiniMax-style verbosity (convert to effort-like)
		// verbosity 0 = none, 1 = low, 2 = medium, 3 = high
		const verbosityMap: Record<number, any> = {
			0: "none",
			1: "low",
			2: "medium",
			3: "high",
		};
		reasoning.effort = verbosityMap[body.verbosity] ?? "medium";
	}

	if (Object.keys(reasoning).length === 0) return undefined;
	return reasoning;
}

/**
 * Model-specific reasoning support
 * Some OpenAI models only support specific reasoning configurations
 */
export const OPENAI_REASONING_MODELS: Record<string, {
	supportsEffort: boolean;
	maxReasoningTokens?: number;
	supportedEfforts?: string[];
}> = {
	"o1": {
		supportsEffort: true,
		maxReasoningTokens: 32768,
		supportedEfforts: ["low", "medium", "high"],
	},
	"o1-preview": {
		supportsEffort: true,
		maxReasoningTokens: 32768,
		supportedEfforts: ["low", "medium", "high"],
	},
	"o1-mini": {
		supportsEffort: true,
		maxReasoningTokens: 65536,
		supportedEfforts: ["low", "medium", "high"],
	},
	"o3-mini": {
		supportsEffort: true,
		maxReasoningTokens: 100000,
		supportedEfforts: ["low", "medium", "high"],
	},
	"chatgpt-4o-latest": {
		supportsEffort: false, // No reasoning support
	},
	"gpt-4o": {
		supportsEffort: false,
	},
	"gpt-4o-mini": {
		supportsEffort: false,
	},
};

/**
 * Get reasoning configuration for an OpenAI model (for reference/docs)
 * The database params will be the source of truth, but this is useful for documentation
 */
export function getOpenAIReasoningConfigReference(model: string): {
	supportsReasoning: boolean;
	style?: string;
	maxReasoningTokens?: number;
} | null {
	// Check exact match first
	if (model in OPENAI_REASONING_MODELS) {
		const config = OPENAI_REASONING_MODELS[model];
		if (config.supportsEffort) {
			return {
				supportsReasoning: true,
				style: "effort",
				maxReasoningTokens: config.maxReasoningTokens,
			};
		}
		return { supportsReasoning: false };
	}

	// Check prefix match (e.g., "o1-2024-12-17" matches "o1")
	for (const [prefix, config] of Object.entries(OPENAI_REASONING_MODELS)) {
		if (model.startsWith(prefix)) {
			if (config.supportsEffort) {
				return {
					supportsReasoning: true,
					style: "effort",
					maxReasoningTokens: config.maxReasoningTokens,
				};
			}
			return { supportsReasoning: false };
		}
	}

	return null;
}
