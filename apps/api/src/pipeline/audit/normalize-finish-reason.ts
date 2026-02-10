// Purpose: Normalize finish_reason across providers for consistent analytics
// Why: Different providers use different finish_reason values for the same concept
// How: Map provider-specific values to normalized categories

export type NormalizedFinishReason =
	| "stop" // Natural completion
	| "length" // Max tokens reached
	| "tool_calls" // Tool/function call requested
	| "content_filter" // Content filtered
	| "error" // Error during generation
	| "timeout" // Request timeout
	| "cancel" // User/system cancellation
	| "recitation" // Blocked due to recitation (Gemini)
	| "safety" // Safety/moderation block
	| "other" // Unknown/other
	| null; // No finish reason provided

/**
 * Normalize finish_reason from provider-specific value to canonical value
 */
export function normalizeFinishReason(
	finishReason: string | null | undefined,
	provider: string,
): NormalizedFinishReason {
	if (!finishReason) return null;

	const lower = finishReason.toLowerCase();

	// OpenAI & OpenAI-compatible providers
	if (
		provider === "openai" ||
		provider === "azure" ||
		provider === "openai-compatible" ||
		provider === "together" ||
		provider === "fireworks" ||
		provider === "groq" ||
		provider === "deepseek" ||
		provider === "cerebras" ||
		provider === "qwen" ||
		provider === "alibaba"
	) {
		if (lower === "stop") return "stop";
		if (lower === "length") return "length";
		if (lower === "tool_calls" || lower === "function_call") return "tool_calls";
		if (lower === "content_filter") return "content_filter";
		if (lower === "stop_sequence") return "stop";
	}

	// Anthropic
	if (provider === "anthropic") {
		if (lower === "end_turn") return "stop";
		if (lower === "max_tokens") return "length";
		if (lower === "tool_use") return "tool_calls";
		if (lower === "stop_sequence") return "stop";
		if (lower === "pause_turn") return "stop";
		if (lower === "refusal") return "content_filter";
	}

	// Google (Gemini/Vertex)
	if (provider === "google" || provider === "google-ai-studio" || provider === "google-vertex") {
		if (lower === "stop") return "stop";
		if (lower === "max_tokens") return "length";
		if (lower === "safety") return "safety";
		if (lower === "recitation") return "recitation";
		if (lower === "other") return "other";
		if (lower === "finish_reason_unspecified") return null;
	}

	// Mistral
	if (provider === "mistral") {
		if (lower === "stop") return "stop";
		if (lower === "length") return "length";
		if (lower === "model_length") return "length";
		if (lower === "tool_calls") return "tool_calls";
		if (lower === "error") return "error";
	}

	// Cohere
	if (provider === "cohere") {
		if (lower === "complete") return "stop";
		if (lower === "max_tokens") return "length";
		if (lower === "error") return "error";
		if (lower === "error_toxic") return "content_filter";
	}

	// AI21
	if (provider === "ai21") {
		if (lower === "endoftext") return "stop";
		if (lower === "length") return "length";
	}

	// Minimax
	if (provider === "minimax" || provider === "minimax-lightning") {
		if (lower === "stop") return "stop";
		if (lower === "length") return "length";
		if (lower === "tool_calls") return "tool_calls";
	}

	// Moonshot
	if (provider === "moonshot-ai" || provider === "moonshot-ai-turbo") {
		if (lower === "stop") return "stop";
		if (lower === "length") return "length";
		if (lower === "tool_calls") return "tool_calls";
	}

	// Z.AI (Zhipu/GLM)
	if (provider === "z-ai" || provider === "zai") {
		if (lower === "stop") return "stop";
		if (lower === "length") return "length";
		if (lower === "tool_calls") return "tool_calls";
		if (lower === "sensitive") return "content_filter";
		if (lower === "network_error") return "error";
	}

	// Xiaomi
	if (provider === "xiaomi") {
		if (lower === "stop") return "stop";
		if (lower === "length") return "length";
		if (lower === "tool_calls") return "tool_calls";
	}

	// X.AI (Grok)
	if (provider === "x-ai" || provider === "xai") {
		if (lower === "stop") return "stop";
		if (lower === "length") return "length";
		if (lower === "tool_use") return "tool_calls";
	}

	// Common patterns across all providers
	if (lower === "end_turn") return "stop";
	if (lower === "max_tokens") return "length";
	if (lower === "stop_sequence") return "stop";
	if (lower === "tool_use") return "tool_calls";
	if (lower === "pause_turn") return "stop";
	if (lower === "refusal") return "content_filter";
	if (lower.includes("stop")) return "stop";
	if (lower.includes("length") || lower.includes("max_token")) return "length";
	if (lower.includes("tool") || lower.includes("function")) return "tool_calls";
	if (lower.includes("content") || lower.includes("filter")) return "content_filter";
	if (lower.includes("safety") || lower.includes("moderation")) return "safety";
	if (lower.includes("error")) return "error";
	if (lower.includes("timeout")) return "timeout";
	if (lower.includes("cancel")) return "cancel";

	// If we can't normalize, return "other"
	return "other";
}
