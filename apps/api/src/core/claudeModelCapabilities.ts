export function normalizeClaudeModelId(model: string | null | undefined): string {
	return typeof model === "string" ? model.trim().toLowerCase() : "";
}

export function isClaudeOpus55(model: string | null | undefined): boolean {
	return /(?:^|[/.])claude-opus-5[.-]5$/.test(normalizeClaudeModelId(model));
}

/**
 * Models that reject a forced `tool_choice` (`any` or `tool`) with a 400 on every platform:
 * Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1. Returns the model name for messages, or null.
 * https://platform.claude.com/docs/en/build-with-claude/thinking (tool choice limitation)
 */
export function claudeModelWithoutForcedToolChoice(model: string | null | undefined): string | null {
	const normalized = normalizeClaudeModelId(model);
	const match = /claude-(opus|sonnet)-5[.-]5(?:$|[^0-9])/.exec(normalized) ?? /claude-(fable|mythos)-5[.-]1(?:$|[^0-9])/.exec(normalized);
	if (!match) return null;
	const family = match[1].charAt(0).toUpperCase() + match[1].slice(1);
	return `${family} ${family === "Opus" || family === "Sonnet" ? "5.5" : "5.1"}`;
}

export function usesClaudeAdaptiveThinkingControls(model: string | null | undefined): boolean {
	const normalized = normalizeClaudeModelId(model);
	if (!normalized) return false;
	return (
		normalized.includes("claude-haiku-5-5") ||
		normalized.includes("claude-haiku-5.5") ||
		normalized.includes("claude-sonnet-5") ||
		normalized.includes("claude-fable-5") ||
		normalized.includes("claude-mythos-5") ||
		normalized.includes("claude-opus-4-7") ||
		normalized.includes("claude-opus-4.7") ||
		normalized.includes("claude-opus-4-8") ||
		normalized.includes("claude-opus-4.8") ||
		normalized.includes("claude-opus-5")
	);
}

/**
 * Models that accept `role: "system"` entries inside `messages`
 * (https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages):
 * Fable 5 and 5.1, Mythos 5 and 5.1, Opus 5 and 5.5, Opus 4.8, Sonnet 5.5 and
 * Haiku 5.5. Sonnet 5 does not support them.
 */
export function supportsAnthropicMidConversationSystemMessages(model: string | null | undefined): boolean {
	const normalized = normalizeClaudeModelId(model);
	if (!normalized) return false;
	return (
		normalized.includes("claude-fable-5") ||
		normalized.includes("claude-mythos-5") ||
		normalized.includes("claude-opus-5") ||
		normalized.includes("claude-opus-4-8") ||
		normalized.includes("claude-opus-4.8") ||
		/claude-sonnet-5[.-]5(?:$|[^0-9])/.test(normalized) ||
		/claude-haiku-5[.-]5(?:$|[^0-9])/.test(normalized)
	);
}

type AnthropicTurn = { role?: unknown; content?: unknown } | null | undefined;

/**
 * Anthropic's placement rule for a run of consecutive `role: "system"`
 * messages that carry content: straight after a `user` turn (or an assistant
 * turn ending in a server tool result), and either last or followed by an
 * `assistant` turn. Anything else is a 400 from Claude.
 */
export function isAnthropicSystemMessagePlacementValid(previous: AnthropicTurn, next: AnthropicTurn): boolean {
	const followsTurn = previous?.role === "user" || (previous?.role === "assistant" && endsWithServerToolResult(previous.content));
	return followsTurn && (!next || next.role === "assistant");
}

function endsWithServerToolResult(content: unknown): boolean {
	if (!Array.isArray(content) || content.length === 0) return false;
	const type = (content[content.length - 1] as { type?: unknown } | null)?.type;
	// Server tool results are `<tool>_tool_result` blocks, such as `web_search_tool_result`.
	return typeof type === "string" && type.endsWith("_tool_result") && type !== "tool_result";
}

/**
 * Opus 4.6 and Sonnet 4.6 take adaptive thinking (manual `budget_tokens` is deprecated on
 * them) but, unlike the adaptive set above, keep thinking off when `thinking` is omitted
 * and accept sampling parameters while thinking is off.
 * https://platform.claude.com/docs/en/build-with-claude/thinking
 */
export function isClaude46(model: string | null | undefined): boolean {
	return /claude-(?:opus|sonnet)-4[.-]6(?:$|[^0-9])/.test(normalizeClaudeModelId(model));
}

/**
 * `output_config.effort` support for models outside the adaptive-thinking set, from
 * https://platform.claude.com/docs/en/build-with-claude/effort: Opus 4.6 and Sonnet 4.6
 * take every level but `xhigh`; Opus 4.5 takes `low` to `high`; Haiku 4.5, Sonnet 4.5 and
 * earlier models do not support effort. Returns the effort to send, or undefined.
 */
export function clampClaudeEffort(model: string | null | undefined, effort: string | undefined): string | undefined {
	if (!effort) return undefined;
	const normalized = normalizeClaudeModelId(model);
	if (usesClaudeAdaptiveThinkingControls(normalized)) return effort;
	if (/claude-(?:opus|sonnet)-4[.-]6(?:$|[^0-9])/.test(normalized)) return effort === "xhigh" ? "max" : effort;
	if (/claude-opus-4[.-]5(?:$|[^0-9])/.test(normalized)) return effort === "xhigh" || effort === "max" ? "high" : effort;
	return undefined;
}

/**
 * `inference_geo` is accepted on Claude 4.6 and later; Opus 4.5, Sonnet 4.5, Haiku 4.5 and
 * earlier models return 400 (https://platform.claude.com/docs/en/manage-claude/data-residency).
 */
export function supportsAnthropicInferenceGeo(model: string | null | undefined): boolean {
	const normalized = normalizeClaudeModelId(model);
	return usesClaudeAdaptiveThinkingControls(normalized) || /claude-(?:opus|sonnet)-4[.-]6(?:$|[^0-9])/.test(normalized);
}

/**
 * How an adaptive-thinking Claude model turns thinking off, from the per-model table at
 * https://platform.claude.com/docs/en/build-with-claude/thinking:
 * - `disabled`: Sonnet 5, Haiku 5.5, Opus 5, Opus 4.8 and Opus 4.7;
 * - `between_tools`: Sonnet 5.5, which rejects `disabled` (it turns off up-front thinking only);
 * - `null`: Opus 5.5, Fable and Mythos, which reject both, so thinking cannot be turned off.
 */
export function anthropicThinkingOffType(model: string | null | undefined): "disabled" | "between_tools" | null {
	const normalized = normalizeClaudeModelId(model);
	if (!normalized) return null;
	// Check the 5.5 releases first: their ids contain the 5-series ids.
	if (/claude-sonnet-5[.-]5(?:$|[^0-9])/.test(normalized)) return "between_tools";
	if (/claude-opus-5[.-]5(?:$|[^0-9])/.test(normalized)) return null;
	if (
		normalized.includes("claude-sonnet-5") ||
		normalized.includes("claude-opus-5") ||
		/claude-haiku-5[.-]5(?:$|[^0-9])/.test(normalized) ||
		/claude-opus-4[.-][78](?:$|[^0-9])/.test(normalized)
	) {
		return "disabled";
	}
	return null;
}
