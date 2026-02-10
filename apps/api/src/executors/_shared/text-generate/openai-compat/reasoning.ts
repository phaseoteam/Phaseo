// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { IRChatRequest } from "@core/ir";

/**
 * Configuration for provider-specific reasoning parameter mapping
 *
 * @property mode - How reasoning is configured: "effort" (OpenAI) or "enabled" (boolean-based)
 * @property field - The field name in the request (e.g., "reasoning", "thinking", "thinkingBudget")
 * @property format - How the value is formatted: "type", "enabled", or "tokens"
 * @property effortKey - Key for effort level (e.g., "effort" for OpenAI)
 * @property summaryKey - Key for summary configuration
 * @property maxTokensKey - Key for max tokens (e.g., "budget_tokens" for Anthropic, "tokens" for Google)
 */
type ReasoningConfig = {
	mode?: "effort" | "enabled";
	field?: string;
	format?: "type" | "enabled" | "tokens";
	effortKey?: string;
	summaryKey?: string;
	maxTokensKey?: string;
};

/**
 * Resolve provider-specific reasoning configuration
 *
 * Providers have different parameter formats for enabling reasoning/thinking:
 * - OpenAI: reasoning.effort (low/medium/high)
 * - Xiaomi: chat_template_kwargs.enable_thinking (handled via quirks)
 * - DeepSeek: thinking.type (enabled/disabled)
 *
 * Note: Google is no longer in this list as it uses native implementation
 */
function resolveReasoningConfig(providerId?: string): ReasoningConfig | null {
	if (providerId === "openai") {
		return { mode: "effort", field: "reasoning" };
	}
	// Xiaomi uses a special format: chat_template_kwargs.enable_thinking
	// This is handled entirely in the Xiaomi provider quirks (providers/xiaomi/quirks.ts)
	// Do not add a config here - the quirk has full control

	// Note: Google is no longer OpenAI-compatible - it uses native implementation
	// Thinking mode is handled in the Google executor via generationConfig.thinkingBudget

	if (providerId === "deepseek") {
		// DeepSeek uses thinking: {type: "enabled"} for thinking mode
		// https://api-docs.deepseek.com/guides/thinking_mode
		return { mode: "enabled", field: "thinking", format: "type" };
	}

	return null;
}

export function applyReasoningParams(args: {
	ir: IRChatRequest;
	request: any;
	providerId?: string;
}): void {
	const reasoning = args.ir.reasoning;
	if (!reasoning) return;

	const config = resolveReasoningConfig(args.providerId);
	if (!config) return;

	const hasAny =
		reasoning.enabled !== undefined ||
		reasoning.effort !== undefined ||
		reasoning.summary !== undefined ||
		reasoning.maxTokens !== undefined;
	if (!hasAny) return;

	const enabled =
		reasoning.enabled ??
		(typeof reasoning.effort === "string" ? reasoning.effort !== "none" : undefined);

	if (config.mode === "enabled") {
		const field = config.field ?? "thinking";
		if (args.request[field] == null) {
			const format = config.format ?? "type";
			const resolvedEnabled = enabled ?? true;

			// Handle different formats for enabling reasoning
			if (format === "tokens") {
				// Google Gemini format: thinkingBudget = number (direct token count)
				// Only set if maxTokens is provided
				if (typeof reasoning.maxTokens === "number" && resolvedEnabled) {
					args.request[field] = reasoning.maxTokens;
				}
			} else {
				// Object-based formats (Anthropic, DeepSeek, Z.AI)
				const entry: Record<string, any> = {};
				if (format === "enabled") {
					entry.enabled = resolvedEnabled;
				} else {
					entry.type = resolvedEnabled ? "enabled" : "disabled";
				}
				const maxKey = config.maxTokensKey;
				if (typeof reasoning.maxTokens === "number" && maxKey) {
					entry[maxKey] = reasoning.maxTokens;
				}
				args.request[field] = entry;
			}
		}
		return;
	}

	const field = config.field ?? "reasoning";
	if (args.request[field] == null || typeof args.request[field] !== "object") {
		args.request[field] = {};
	}
	const target = args.request[field] as Record<string, any>;
	const effortKey = config.effortKey ?? "effort";
	const summaryKey = config.summaryKey ?? "summary";
	const maxKey = config.maxTokensKey;
	const isOpenAI = String(args.providerId ?? "").toLowerCase() === "openai";

	if (typeof reasoning.effort === "string") {
		target[effortKey] = reasoning.effort;
	} else if (enabled === false) {
		target[effortKey] = "none";
	} else if (enabled === true) {
		target[effortKey] = "medium";
	}

	// OpenAI: default summary mode to "auto" only when caller did not provide one.
	if (reasoning.summary !== undefined) {
		target[summaryKey] = reasoning.summary;
	} else if (isOpenAI) {
		target[summaryKey] = "auto";
	}

	if (typeof reasoning.maxTokens === "number" && maxKey) {
		target[maxKey] = reasoning.maxTokens;
	}
}

