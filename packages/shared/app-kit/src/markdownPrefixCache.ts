/**
 * Runs a line-based Markdown transform (chips, math normalising) on a growing string, such as a streamed answer,
 * without redoing the finished part on every update. The text is cut at the last blank line outside code fences and
 * `$$` math; the transform's result for everything before that cut is kept and only the rest is transformed again.
 * The transform must treat a blank line outside fences and math as a clean break, as `chipMarkdown` and
 * `normalizeChatMarkdown` do.
 */
export function createMarkdownPrefixCache(transform: (markdown: string) => string) {
	let input = "", output = "";
	return (markdown: string): string => {
		if (!markdown.startsWith(input)) { input = ""; output = ""; }
		const rest = markdown.slice(input.length);
		const cut = lastCleanBreak(rest);
		if (cut > 0) {
			output += transform(rest.slice(0, cut));
			input += rest.slice(0, cut);
		}
		const tail = rest.slice(Math.max(cut, 0));
		return tail ? output + transform(tail) : output;
	};
}

/** Offset just after the last blank line that is outside fenced code and `$$` math, or -1. */
export function lastCleanBreak(markdown: string): number {
	let fence: string | undefined, math = false, offset = 0, best = -1, previousBlank = false;
	for (const line of markdown.split("\n")) {
		const end = offset + line.length + 1;
		const marker = /^ {0,3}(?:>[ \t]?)*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?(`{3,}|~{3,})/.exec(line)?.[1];
		if (fence) { if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined; }
		else if (marker) fence = marker;
		else if (((line.match(/\$\$/g)?.length ?? 0) % 2) === 1) math = !math;
		const blank = !line.trim();
		// The break sits after a blank line, and the next line must exist (the text after it is known).
		if (blank && !previousBlank && !fence && !math && end < markdown.length) best = end;
		previousBlank = blank;
		offset = end;
	}
	return best;
}
