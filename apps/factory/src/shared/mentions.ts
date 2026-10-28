/** The "@name" being typed just before the caret, if there is one. A "@" inside a word (an email) or code doesn't count. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
	const match = /(^|[^\w`@])@([\w-]{0,39})$/.exec(text.slice(0, caret));
	return match ? { start: caret - match[2]!.length - 1, query: match[2]! } : null;
}
