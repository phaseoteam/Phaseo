export function keyDetailHref(key: { name: string; prefix: string; workspace_id: string }) {
	const query = new URLSearchParams({ workspaceId: key.workspace_id, prefix: key.prefix });
	return `/settings/keys/${encodeURIComponent(key.name)}?${query.toString()}`;
}

export function matchesKeyRouteName(name: unknown, routeName: string) {
	if (typeof name !== "string") return false;
	if (name === routeName) return true;
	try {
		const encoded = encodeURIComponent(name);
		// Next may decode a segment while keeping path delimiters escaped.
		// Build that representation from the stored name so literal percent
		// characters are never mistaken for malformed route encoding.
		const escapedDelimiters = name.replace(/([/#?\\]|%(?:2f|23|3f|5c))/gi, (value) => encodeURIComponent(value));
		return routeName === encoded || routeName === decodeURI(encoded) || routeName === escapedDelimiters;
	} catch {
		return false;
	}
}
