// Purpose: Parameter configuration types and utilities.
// Why: Standardizes how provider parameter support is defined and validated.
// How: Simple key-based detection - if key exists in params, it's supported.

/**
 * Simplified parameter configuration
 * If a parameter key exists in the params JSONB, it's supported.
 * Values provide metadata for normalization (e.g., ranges, conversion factors).
 *
 * Example params JSONB:
 * {
 *   "temperature": {},  // Supported, no special config
 *   "tools": {},        // Supported
 *   "reasoning": {      // Supported, with conversion metadata
 *     "style": "effort",
 *     "maxReasoningTokens": 32768
 *   }
 * }
 */
export type ParameterConfig = Record<string, any>;

/**
 * Effort level to percentage mapping for reasoning conversion
 * Applied to provider's maxReasoningTokens
 */
export const REASONING_EFFORT_TO_PERCENT: Record<string, number> = {
	none: 0.0,
	minimal: 0.15,
	low: 0.30,
	medium: 0.50,
	high: 0.75,
	xhigh: 0.90,
};

/**
 * Calculate reasoning max_tokens from effort level
 */
export function effortToTokens(
	effort: string,
	maxReasoningTokens: number
): number {
	const percent = REASONING_EFFORT_TO_PERCENT[effort] ?? 0.5; // default to medium
	return Math.round(maxReasoningTokens * percent);
}

/**
 * Calculate reasoning effort from max_tokens (returns closest match)
 */
export function tokensToEffort(
	tokens: number,
	maxReasoningTokens: number
): string {
	if (tokens <= 0 || maxReasoningTokens <= 0) return "none";

	const percent = tokens / maxReasoningTokens;
	const efforts = Object.entries(REASONING_EFFORT_TO_PERCENT);

	let closest = "medium";
	let minDiff = Infinity;

	for (const [effort, effortPercent] of efforts) {
		const diff = Math.abs(percent - effortPercent);
		if (diff < minDiff) {
			minDiff = diff;
			closest = effort;
		}
	}

	return closest;
}

/**
 * Check if a parameter is supported by this provider
 * Simple rule: if the key exists in params, it's supported
 */
export function isParamSupported(
	params: ParameterConfig | undefined | null,
	paramName: string
): boolean {
	if (!params || typeof params !== "object") return false;
	if (Object.keys(params).length === 0) return true;
	return paramName in params;
}

/**
 * Get reasoning configuration for a provider
 */
export function getReasoningConfig(params: ParameterConfig | undefined | null): {
	supported: boolean;
	style?: "effort" | "tokens";
	maxReasoningTokens?: number;
} {
	if (!params || !params.reasoning) {
		return { supported: false };
	}

	const reasoning = params.reasoning;
	return {
		supported: true,
		style: reasoning.style || "tokens",
		maxReasoningTokens: reasoning.maxReasoningTokens,
	};
}

/**
 * Get response format configuration
 */
export function getResponseFormatConfig(params: ParameterConfig | undefined | null): {
	supported: boolean;
	types?: string[];
	structuredOutputs?: boolean;
} {
	if (params && typeof params === "object" && Object.keys(params).length === 0) {
		return { supported: true };
	}

	if (!params || !params.response_format) {
		return { supported: false };
	}

	const format = params.response_format;
	return {
		supported: true,
		types: format.types,
		structuredOutputs: format.structuredOutputs,
	};
}
