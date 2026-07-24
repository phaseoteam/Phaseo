export function normalizeClaudeModelId(model: string | null | undefined): string {
	return typeof model === "string" ? model.trim().toLowerCase() : "";
}

export function usesClaudeAdaptiveThinkingControls(model: string | null | undefined): boolean {
	const normalized = normalizeClaudeModelId(model);
	if (!normalized) return false;
	return (
		normalized.includes("claude-sonnet-5") ||
		normalized.includes("claude-fable-5") ||
		normalized.includes("claude-mythos-5") ||
		normalized.includes("claude-opus-4-7") ||
		normalized.includes("claude-opus-4.7") ||
		normalized.includes("claude-opus-5")
	);
}

export function supportsAnthropicThinkingDisabled(model: string | null | undefined): boolean {
	const normalized = normalizeClaudeModelId(model);
	if (!normalized) return false;
	return normalized.includes("claude-sonnet-5");
}
