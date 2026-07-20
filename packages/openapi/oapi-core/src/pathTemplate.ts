/**
 * Splits an OpenAPI path into literal and `{parameter}` segments without a
 * backtracking regular expression. Unmatched braces remain literal text.
 */
export function splitPathTemplate(path: string): string[] {
	const segments: string[] = [];
	let cursor = 0;

	while (cursor < path.length) {
		const open = path.indexOf("{", cursor);
		if (open === -1) {
			segments.push(path.slice(cursor));
			break;
		}
		if (open > cursor) segments.push(path.slice(cursor, open));

		const close = path.indexOf("}", open + 1);
		if (close === -1) {
			segments.push(path.slice(open));
			break;
		}

		segments.push(path.slice(open, close + 1));
		cursor = close + 1;
	}

	return segments;
}
