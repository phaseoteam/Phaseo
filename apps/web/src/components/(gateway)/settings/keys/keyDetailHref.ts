export function keyDetailHref(key: { name: string; prefix: string; workspace_id: string }) {
	const query = new URLSearchParams({ workspaceId: key.workspace_id, prefix: key.prefix });
	return `/settings/keys/${encodeURIComponent(key.name)}?${query.toString()}`;
}

export function matchesKeyRouteName(name: unknown, routeName: string) {
	if (typeof name !== "string") return false;
	if (name === routeName) return true;
	try {
		return name === decodeURIComponent(routeName);
	} catch {
		return false;
	}
}
