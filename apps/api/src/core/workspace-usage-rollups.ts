type WorkspaceUsageRollupSyncArgs = {
	requestRowId: string;
	requestCreatedAt: string;
	workspaceId: string;
	context: string;
};

export async function syncWorkspaceUsageRollupForRequest(
	args: WorkspaceUsageRollupSyncArgs,
): Promise<void> {
	// Rollup sync is intentionally disabled while usage analytics reads directly from
	// gateway_requests.
	void args;
}
