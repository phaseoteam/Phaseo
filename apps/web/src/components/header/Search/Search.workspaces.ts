import type { PaletteItem } from "./Search.types";

export type SearchWorkspace = {
	id: string;
	name: string;
};

type WorkspaceSearchResponse = {
	workspaces?: SearchWorkspace[];
};

export function createWorkspaceSearchItem(
	workspace: SearchWorkspace,
): PaletteItem {
	return {
		id: `workspace:${workspace.id}`,
		title: workspace.name,
		subtitle: "Workspace settings",
		href: "/settings/workspaces/settings",
		workspaceId: workspace.id,
		persistable: false,
		keywords: ["workspace", "team", workspace.name],
	};
}

export async function fetchWorkspaceSearchItems(
	path: string,
	options: { signal?: AbortSignal } = {},
): Promise<PaletteItem[]> {
	const response = await fetch(path, {
		method: "GET",
		credentials: "same-origin",
		cache: "no-store",
		headers: { Accept: "application/json" },
		signal: options.signal,
	});

	if (!response.ok) return [];

	const payload = (await response.json()) as WorkspaceSearchResponse;
	return (payload.workspaces ?? []).map(createWorkspaceSearchItem);
}
