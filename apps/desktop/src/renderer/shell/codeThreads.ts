import { activeOrder, sidebarSection, type SidebarSection } from "../../shared/threadLifecycle";
import type { Project } from "../../shared/workspace";
import type { TaskOverview } from "../../shared/workspaceOverview";

export type CodeSections = Record<SidebarSection, TaskOverview[]>;
const time = (value?: string) => value ? Date.parse(value) : 0;

/** Code chats in T3's sidebar order: pinned, active (newest start or return first), then snoozed (soonest wake) and settled (latest first). */
export function codeSections(tasks: TaskOverview[], projects: Project[], scope: string, now = Date.now()): CodeSections {
	const live = new Set(projects.filter(project => !project.worktree?.removedAt).map(project => project.id));
	const sections: CodeSections = { pinned: [], active: [], snoozed: [], settled: [] };
	for (const task of tasks) {
		if (!task.projectId || !live.has(task.projectId) || task.delegation?.parentTaskId || task.archived) continue;
		if (scope && task.projectId !== scope) continue;
		sections[sidebarSection(task, now)].push(task);
	}
	// T3: dragged pinned chats first in their order, then the rest newest first; in the active list, chats never dragged come first.
	const keyed = (a: TaskOverview, b: TaskOverview) => (a.orderKey ?? 0) - (b.orderKey ?? 0);
	sections.pinned.sort((a, b) => Number(a.orderKey === undefined) - Number(b.orderKey === undefined) || keyed(a, b) || b.createdAt.localeCompare(a.createdAt));
	sections.active.sort((a, b) => Number(b.orderKey === undefined) - Number(a.orderKey === undefined) || keyed(a, b) || activeOrder(b) - activeOrder(a) || b.createdAt.localeCompare(a.createdAt));
	sections.snoozed.sort((a, b) => time(a.snoozedUntil) - time(b.snoozedUntil));
	sections.settled.sort((a, b) => (time(b.settledAt) || time(b.updatedAt)) - (time(a.settledAt) || time(a.updatedAt)));
	return sections;
}

/** After parking the open chat, T3 opens the next one still in the list, else the one before it. */
export function nextAfterParking(sections: CodeSections, id: string) {
	const visible = [...sections.pinned, ...sections.active];
	const index = visible.findIndex(task => task.id === id);
	if (index < 0) return undefined;
	return visible[index + 1] ?? visible[index - 1];
}
