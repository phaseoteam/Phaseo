import type { TaskOverview } from "../../shared/workspaceOverview";

export type LineageNode = { task: TaskOverview; children: LineageNode[] };

/**
 * The family a chat belongs to through forks, branches and handoffs (parentId): its oldest ancestor still here, and every
 * chat made from it, oldest first. Undefined when the chat has neither a parent nor a fork.
 */
export function chatLineage(tasks: readonly TaskOverview[], id: string): LineageNode | undefined {
	const byId = new Map(tasks.map(task => [task.id, task]));
	const children = new Map<string, TaskOverview[]>();
	for (const task of tasks) if (task.parentId && byId.has(task.parentId)) children.set(task.parentId, [...children.get(task.parentId) ?? [], task]);
	let root = byId.get(id);
	if (!root) return undefined;
	for (const seen = new Set([root.id]); root.parentId && byId.has(root.parentId) && !seen.has(root.parentId);) { root = byId.get(root.parentId)!; seen.add(root.id); }
	if (root.id === id && !children.has(id)) return undefined;
	const build = (task: TaskOverview, seen: Set<string>): LineageNode => ({ task, children: (children.get(task.id) ?? []).filter(child => !seen.has(child.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(child => build(child, new Set([...seen, child.id]))) });
	return build(root, new Set([root.id]));
}

export const lineageSize = (node: LineageNode): number => 1 + node.children.reduce((sum, child) => sum + lineageSize(child), 0);
