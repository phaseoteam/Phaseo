/**
 * The highlighted row of the `/` or `@` menu. It stays on the row the person moved to while the list refreshes for the
 * same query (results arriving, a refetch), and goes back to the first row when the query changes or the row is gone.
 */
export function activeMenuKey(input: { keys: readonly string[]; highlighted?: string; query?: string; highlightedQuery?: string }) {
	if (!input.keys.length) return undefined;
	if (input.highlighted !== undefined && input.query === input.highlightedQuery && input.keys.includes(input.highlighted)) return input.highlighted;
	return input.keys[0];
}

/** The row one step up or down from the active one, wrapping at the ends. */
export function stepMenuKey(keys: readonly string[], active: string | undefined, direction: 1 | -1) {
	if (!keys.length) return undefined;
	const index = active === undefined ? -1 : keys.indexOf(active);
	return keys[(Math.max(index, direction === 1 ? -1 : 0) + direction + keys.length) % keys.length];
}
