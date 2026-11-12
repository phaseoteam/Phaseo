/**
 * Search matches with `history_lower`, JavaScript's `toLowerCase`, which SQLite calls once per row: across a year of
 * chats that is most of a search. `textPrefilter` gives a cheap SQLite condition that every row whose `history_lower`
 * text contains the needle also meets, so the exact check only runs on the rows that pass it.
 *
 * SQLite's LIKE folds ASCII case natively. The condition is a superset of the exact match because:
 * - the needle is printable ASCII without `"` or `\`, the only printable characters JSON escapes, so the needle reads
 *   the same in a row's stored JSON as in its text;
 * - `toLowerCase` turns only two non-ASCII letters into ASCII: KELVIN SIGN into `k` and LATIN CAPITAL I WITH DOT ABOVE
 *   into `i` plus a combining dot, so `i` and `k` in the needle match any one character;
 * - a row stored compressed (a blob) always passes.
 * Any other needle (accents, other scripts, quotes, control characters) gets no pattern and the full scan.
 */
export function likePattern(needle: string): string | undefined {
	const lower = needle.toLowerCase();
	if (!lower || !/^[\x20-\x7e]+$/.test(lower) || /["\\]/.test(lower)) return undefined;
	return `%${lower.replace(/[%_]/g, character => `\\${character}`).replace(/[ik]/g, "_")}%`;
}

/** The SQL condition on `column` (a row's raw JSON) with its pattern bound to `$name`, or TRUE when there is none. */
export function textPrefilter(column: string, name: string, needle: string): { sql: string; params: Record<string, string> } {
	const pattern = likePattern(needle);
	return pattern ? { sql: `(typeof(${column}) = 'blob' OR ${column} LIKE $${name} ESCAPE '\\')`, params: { [name]: pattern } } : { sql: "1", params: {} };
}
