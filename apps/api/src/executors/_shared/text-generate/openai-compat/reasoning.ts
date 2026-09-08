// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { IRChatRequest } from "@core/ir";
import { normalizeProviderId } from "@/lib/config/providerAliases";

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
	if (providerId === "openai" || providerId === "openai-eu" || providerId === "ovhcloud") {
		return { mode: "effort", field: "reasoning" };
	}
	if (providerId === "morph") {
		// Morph's fast-model API documents reasoning: { effort: "low" | "medium" | "high" }.
		return { mode: "effort", field: "reasoning" };
	}
	// Xiaomi uses a special format: chat_template_kwargs.enable_thinking
	// This is handled entirely in the Xiaomi provider quirks (providers/xiaomi/quirks.ts)
	// Do not add a config here - the quirk has full control

	// Note: Google is no longer OpenAI-compatible - it uses native implementation
	// Thinking mode is handled in the Google executor via generationConfig.thinkingBudget

	if (providerId === "deepseek" || providerId === "wafer") {
		// DeepSeek uses thinking: {type: "enabled"} for thinking mode
		// https://api-docs.deepseek.com/guides/thinking_mode
		// Wafer's first-party model quick starts document the same shape.
		return { mode: "enabled", field: "thinking", format: "type" };
	}

	return null;
}

export function applyReasoningParams(args: {
	ir: IRChatRequest;
	request: any;
	providerId?: string;
	providerModelSlug?: string | null;
}): void {
	const reasoning = args.ir.reasoning;
	if (!reasoning) return;
	if (args.providerId === "wafer") {
		const effort = typeof reasoning.effort === "string" ? reasoning.effort : undefined;
		if (effort && effort !== "none") {
			args.request.reasoning_effort = effort;
		} else if (reasoning.enabled !== undefined || effort === "none") {
			args.request.thinking = {
				type: reasoning.enabled === false || effort === "none" ? "disabled" : "enabled",
			};
		}
		return;
	}
	if (String(args.providerId ?? "").startsWith("nebius-token-factory")) {
		const effort = typeof reasoning.effort === "string"
			? reasoning.effort
			: reasoning.enabled === false
				? "none"
				: reasoning.enabled === true
					? "medium"
					: undefined;
		if (effort !== undefined) {
			if ("input" in args.request) args.request.reasoning = { effort };
			else args.request.reasoning_effort = effort;
		}
		return;
	}

	if (args.providerId === "mistral" || args.providerId === "mistral-eu") {
		const effort = typeof reasoning.effort === "string"
			? reasoning.effort
			: reasoning.enabled === false
				? "none"
				: reasoning.enabled === true
					? "medium"
					: undefined;
		if (effort !== undefined) args.request.reasoning_effort = effort;
		return;
	}
	if (args.providerId === "thinking-machines") {
		const effort = typeof reasoning.effort === "string"
			? reasoning.effort
			: reasoning.enabled === false ? "none" : reasoning.enabled === true ? "high" : undefined;
		if (effort !== undefined) args.request.reasoning_effort = effort;
		return;
	}
	if (args.providerId === "upstage") {
		const effort = typeof reasoning.effort === "string" ? reasoning.effort : undefined;
		if (effort && effort !== "none") args.request.reasoning_effort = effort;
		return;
	}

	if (args.providerId === "stepfun") {
		const effort = typeof reasoning.effort === "string"
			? reasoning.effort
			: reasoning.enabled === true
				? "medium"
				: undefined;
		if (effort !== undefined && effort !== "none") {
			if ("input" in args.request) args.request.reasoning = { effort };
			else args.request.reasoning_effort = effort;
		}
		return;
	}

	if (normalizeProviderId(args.providerId) === "meta") {
		const rawEffort =
			typeof reasoning.effort === "string"
				? reasoning.effort
				: reasoning.enabled === false
					? "minimal"
					: reasoning.enabled === true
						? "medium"
						: undefined;
		const effort = rawEffort === "none"
			? "minimal"
			: rawEffort === "max"
				? "xhigh"
				: rawEffort;
		if (effort !== undefined && args.request.reasoning_effort == null) {
			args.request.reasoning_effort = effort;
		}
		return;
	}
	if (args.providerId === "akashml") {
		const rawEffort = typeof reasoning.effort === "string" ? reasoning.effort : undefined;
		if (rawEffort) {
			const model = String(args.ir.model ?? "").toLowerCase();
			const isGptOss = model.includes("gpt-oss");
			const effort = isGptOss
				? rawEffort === "minimal" ? "low" : rawEffort === "xhigh" || rawEffort === "max" ? "high" : rawEffort
				: rawEffort;
			if (effort !== "none") args.request.reasoning_effort = effort;
		}
		return;
	}
	if (args.providerId === "nvidia" && String(args.ir.model ?? "").toLowerCase().includes("gpt-oss")) {
		const rawEffort = typeof reasoning.effort === "string" ? reasoning.effort : undefined;
		if (rawEffort && rawEffort !== "none") {
			args.request.reasoning_effort = rawEffort === "minimal"
				? "low"
				: rawEffort === "xhigh" || rawEffort === "max"
					? "high"
					: rawEffort;
		}
		return;
	}
	if (args.providerId === "nvidia" && String(args.ir.model ?? "").toLowerCase().includes("nemotron-3-nano-omni")) {
		if (typeof reasoning.maxTokens === "number") args.request.reasoning_budget = reasoning.maxTokens;
		return;
	}
	if (args.providerId === "cloudflare") {
		const effort = typeof reasoning.effort === "string"
			? reasoning.effort
			: reasoning.enabled === false
				? "none"
				: undefined;
		if (effort !== undefined) args.request.reasoning_effort = effort;
		return;
	}
	if (args.providerId === "friendli") {
		const effort = typeof reasoning.effort === "string" ? reasoning.effort : undefined;
		if (effort && effort !== "none") args.request.reasoning_effort = effort;
		if (typeof reasoning.maxTokens === "number") {
			args.request.reasoning_budget = reasoning.maxTokens;
		}
		return;
	}
	if (args.providerId === "alibaba-cloud") {
		const rawEffort = typeof reasoning.effort === "string" ? reasoning.effort : undefined;
		const effort = rawEffort === "minimal" || rawEffort === "low"
			? "low"
			: rawEffort === "medium"
				? "medium"
				: rawEffort === "high" || rawEffort === "xhigh" || rawEffort === "max"
					? "xhigh"
					: undefined;
		const disabled = reasoning.enabled === false || rawEffort === "none";

		if (disabled) {
			args.request.enable_thinking = false;
			return;
		}
		if (reasoning.enabled === true) args.request.enable_thinking = true;
		if ("input" in args.request) {
			if (effort !== undefined) args.request.reasoning = { effort };
			return;
		}
		if (typeof reasoning.maxTokens === "number") {
			args.request.thinking_budget = reasoning.maxTokens;
		} else if (effort !== undefined) {
			args.request.reasoning_effort = effort;
		}
		return;
	}

	const config = resolveReasoningConfig(args.providerId);
	if (!config) return;

	const hasAny =
		reasoning.enabled !== undefined ||
		reasoning.effort !== undefined ||
		reasoning.mode !== undefined ||
		reasoning.summary !== undefined ||
		reasoning.context !== undefined ||
		reasoning.maxTokens !== undefined;
	if (!hasAny) return;

	const enabled =
		reasoning.enabled ??
		(typeof reasoning.effort === "string" ? reasoning.effort !== "none" : undefined);

	if (config.mode === "enabled") {
		const field = config.field ?? "thinking";
		const deepseekModel = args.providerModelSlug ?? args.ir.model;
		if (
			args.providerId === "deepseek" &&
			(
				deepseekModel === "deepseek-v4-pro" ||
				deepseekModel === "deepseek-v4-flash" ||
				deepseekModel === "deepseek-v4.1-flash-expires-on-0910"
			) &&
			typeof reasoning.effort === "string" &&
			reasoning.effort !== "none" &&
			args.request.reasoning_effort == null
		) {
			args.request.reasoning_effort =
				reasoning.effort === "minimal"
					? "low"
					: reasoning.effort === "low" || reasoning.effort === "max"
						? reasoning.effort
					: "high";
		}
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
	const isOpenAI = ["openai", "openai-eu"].includes(String(args.providerId ?? "").toLowerCase());

	if (typeof reasoning.effort === "string") {
		target[effortKey] = reasoning.effort;
	} else if (enabled === false) {
		target[effortKey] = "none";
	} else if (enabled === true) {
		target[effortKey] = "medium";
	}

	if (typeof reasoning.mode === "string") {
		target.mode = reasoning.mode;
	}
	if (typeof reasoning.context === "string") {
		target.context = reasoning.context;
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
