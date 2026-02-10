// Purpose: OpenAI-specific model quirks and parameter validation.
// Why: Some OpenAI models have specific reasoning effort restrictions.
// How: Validates reasoning efforts and returns errors for unsupported values.

/**
 * OpenAI model-specific reasoning effort support
 * These rules are model-specific and change over time as models evolve
 */
const OPENAI_REASONING_EFFORT_SUPPORT: Record<string, Set<string>> = {
	// GPT-5 baseline - supports minimal through high
	"gpt-5": new Set(["minimal", "low", "medium", "high"]),
	"gpt-5-pro": new Set(["minimal", "low", "medium", "high"]),
	"gpt-5-pro-preview": new Set(["minimal", "low", "medium", "high"]),

	// GPT-5.1 - adds none
	"gpt-5.1": new Set(["none", "minimal", "low", "medium", "high"]),

	// GPT-5.1 Codex Max - adds xhigh support
	"gpt-5.1-codex-max": new Set(["none", "minimal", "low", "medium", "high", "xhigh"]),

	// GPT-5.2+ - keeps none and xhigh support
	"gpt-5.2": new Set(["none", "minimal", "low", "medium", "high", "xhigh"]),
	"gpt-5.2-codex": new Set(["none", "minimal", "low", "medium", "high", "xhigh"]),
	"gpt-5.3": new Set(["none", "minimal", "low", "medium", "high", "xhigh"]),
	"gpt-5.3-codex": new Set(["none", "minimal", "low", "medium", "high", "xhigh"]),

	// Pre-GPT-5.1 models (o1, o3-mini) - don't support "none"
	"o1": new Set(["low", "medium", "high"]),
	"o1-preview": new Set(["low", "medium", "high"]),
	"o1-mini": new Set(["low", "medium", "high"]),
	"o3-mini": new Set(["low", "medium", "high"]),
};

function normalizeModelName(model: string): string {
	const value = (model || "").trim();
	if (!value) return "";
	const parts = value.split("/");
	return parts[parts.length - 1] || value;
}

/**
 * Get supported reasoning efforts for a model
 */
export function getSupportedEfforts(model: string): string[] {
	const normalized = normalizeModelName(model);

	// Check exact match
	if (normalized in OPENAI_REASONING_EFFORT_SUPPORT) {
		return Array.from(OPENAI_REASONING_EFFORT_SUPPORT[normalized]).sort();
	}

	// Check prefix match (e.g., "gpt-5.1-2024-12-17" matches "gpt-5.1")
	for (const [modelPrefix, efforts] of Object.entries(OPENAI_REASONING_EFFORT_SUPPORT)) {
		if (normalized.startsWith(modelPrefix + "-") || normalized.startsWith(modelPrefix + "_")) {
			return Array.from(efforts).sort();
		}
	}

	// Default for unknown models
	return ["low", "medium", "high"];
}

/**
 * Check if a model supports a specific reasoning effort
 */
function modelSupportsEffort(model: string, effort: string): boolean {
	const supported = getSupportedEfforts(model);
	return supported.includes(effort);
}

/**
 * Validate reasoning effort for OpenAI models
 * Returns error message if validation fails, null if valid
 */
export function validateOpenAIReasoningEffort(
	model: string,
	effort: string | undefined
): string | null {
	// No effort specified - valid
	if (!effort) return null;

	// Check if effort is supported
	if (modelSupportsEffort(model, effort)) {
		return null; // Valid
	}

	// Not supported - return error message
	const supported = getSupportedEfforts(model);
	return `Model "${model}" does not support reasoning effort "${effort}". Supported efforts: ${supported.join(", ")}`;
}
