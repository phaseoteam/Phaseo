type WorkspaceOption = { id: string };

export function resolveDefaultWorkspaceId(
	storedWorkspaceId: string | null | undefined,
	workspaces: WorkspaceOption[],
) {
	if (
		storedWorkspaceId &&
		workspaces.some((workspace) => workspace.id === storedWorkspaceId)
	) {
		return storedWorkspaceId;
	}
	return workspaces[0]?.id ?? null;
}
