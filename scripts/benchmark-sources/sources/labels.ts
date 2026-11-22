/** Label clean-ups several research boards need before catalogue matching. */

/** Boards often drop the family name: "Opus 5.5", "Fable 5.2 (max)", "opus-4.8-max". */
export function withClaudeFamily(label: string): string {
	return /^(opus|sonnet|haiku|fable|mythos)\b/i.test(label.trim()) ? `Claude ${label.trim()}` : label.trim();
}

/** "(default)" names the provider's default effort, which the catalogue stores as no effort. */
export function withoutDefaultEffort(label: string): string {
	return label.replace(/\s*\((?:default|adaptive)\)\s*$/i, "").trim();
}

/** "Jun 9, 2026" → "2026-06-09". */
export function isoDate(text: string | undefined): string | undefined {
	const match = text?.match(/\b([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}),? (\d{4})\b/);
	const month = match ? "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(match[1]) / 3 + 1 : 0;
	return match && month >= 1 ? `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}` : undefined;
}

/**
 * Stricter variant for boards that also list non-Claude names starting with a tier word ("Opus Magnum"): only a tier
 * followed by a version number gets "Claude".
 */
export function withClaudePrefix(label: string): string {
	return /^(opus|sonnet|haiku|fable)[\s-]+\d/i.test(label.trim()) ? `Claude ${label.trim()}` : label;
}
