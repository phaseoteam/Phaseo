import type { TaskOverview } from "../../shared/workspaceOverview";

/** The agents a chat started, and the agents they started, that are waiting for an approval. */
export function waitingDescendants(tasks: TaskOverview[], parentId: string) {
	const found: TaskOverview[] = [], seen = new Set([parentId]);
	for (let frontier = [parentId]; frontier.length;) {
		const children = tasks.filter(task => task.delegation?.parentTaskId && frontier.includes(task.delegation.parentTaskId) && !seen.has(task.id) && !task.archived);
		for (const child of children) seen.add(child.id);
		found.push(...children.filter(child => child.approvalsCount));
		frontier = children.map(child => child.id);
	}
	return found;
}
