export function keyDetailHref(key: { name: string; prefix: string; workspace_id: string }) {
	const query = new URLSearchParams({ workspaceId: key.workspace_id, prefix: key.prefix });
	return `/settings/keys/${encodeURIComponent(key.name)}?${query.toString()}`;
}
