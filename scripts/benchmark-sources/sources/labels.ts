/**
 * Some boards name Claude models by tier alone ("Opus-5.5", "Fable 5.2 (xhigh)"). The catalogue names carry "Claude", so
 * those labels get it back. Anything else is returned unchanged.
 */
export function withClaudePrefix(label: string): string {
	return /^(opus|sonnet|haiku|fable)[\s-]+\d/i.test(label.trim()) ? `Claude ${label.trim()}` : label;
}
