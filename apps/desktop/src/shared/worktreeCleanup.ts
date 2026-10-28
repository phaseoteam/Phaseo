/** One worktree in a cleanup run: removed (or to remove, when planning) or kept, and why, in T3's words. */
export type WorktreeCleanupEntry = { projectId: string; name: string; branch: string; outcome: "remove" | "keep" | "removed"; reason: string };
export type WorktreeCleanupReport = { checkedAt: string; entries: WorktreeCleanupEntry[]; automatic?: boolean };
export type WorktreeCleanupRequest = { type: "plan" } | { type: "remove"; projectIds: string[] };

export function validateWorktreeCleanupRequest(value: unknown): WorktreeCleanupRequest {
	const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
	if (input.type === "plan") return { type: "plan" };
	if (input.type === "remove" && Array.isArray(input.projectIds) && input.projectIds.length <= 500 && input.projectIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 100)) return { type: "remove", projectIds: [...new Set(input.projectIds as string[])] };
	throw new Error("Invalid worktree cleanup request.");
}
