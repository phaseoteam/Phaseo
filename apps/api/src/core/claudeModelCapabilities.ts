export function normalizeClaudeModelId(model: string | null | undefined): string {
	return typeof model === "string" ? model.trim().toLowerCase() : "";
}

export function isClaudeOpus55(model: string | null | undefined): boolean {
	return /(?:^|[/.])claude-opus-5[.-]5$/.test(normalizeClaudeModelId(model));
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

export function supportsAnthropicThinkingDisabled(model: string | null | undefined): boolean {
	const normalized = normalizeClaudeModelId(model);
	if (!normalized) return false;
	return (
		normalized.includes("claude-sonnet-5") ||
		normalized.includes("claude-haiku-5-5") ||
		normalized.includes("claude-haiku-5.5")
	);
}
