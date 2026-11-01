import { activeOrder, sidebarSection, type SidebarSection } from "../../shared/threadLifecycle";
import type { Project } from "../../shared/workspace";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { isProjectArchived, projectScopes } from "../../shared/projectShelf";

/** The Working section's setting (Settings → General), kept per window and off by default, as T3's beta is. */
export const workingSectionKey = "phaseo.desktop.sidebar.workingSection";
/** Settings → General: group the sidebar's active chats into project folders, off by default as T3's is. */
export const projectFoldersKey = "phaseo.desktop.sidebar.projectFolders";
/** The sidebar's project filter (a list of project ids, empty for all); it replaced a single id kept under codeProjectScope. */
export const projectScopeKey = "phaseo.desktop.codeProjectScopes";
export type CodeSections = Record<SidebarSection | "working", TaskOverview[]>;
const time = (value?: string) => value ? Date.parse(value) || 0 : 0;

/**
 * T3's Working section (beta): a chat busy with work that needs nothing from the person. It is running (or about to,
 * with a queued message), or it stopped with background work that will wake it: agents it started still working.
 * Approvals, questions, failures and stops stay in the list.
 */
export function isWorking(task: TaskOverview, background: ReadonlySet<string>) {
	if (task.approvalsCount || task.answersCount || task.steeringReviewCount) return false;
	if (task.status === "running") return true;
	if (!["idle", "completed"].includes(task.status)) return false;
	return (task.status === "idle" && Boolean(task.queueCount)) || background.has(task.id);
}

/** Chats with agents still working for them. */
export const withBackgroundWork = (tasks: readonly TaskOverview[]) => new Set(tasks.filter(child => child.delegation?.parentTaskId && !child.archived && (child.status === "running" || child.status === "waiting" || (child.status === "idle" && Boolean(child.queueCount)))).map(child => child.delegation!.parentTaskId!));

/** Working chats newest first by the last message the person sent: finishing and waking do not move a row (T3's sortWorkingThreadsBySend). */
export const workingOrder = (task: TaskOverview) => Math.max(time(task.createdAt), time(task.lastUserMessageAt));
/** With the Working section on, the list sorts by when each chat last came back to the person, so one leaving Working lands on top (T3's sortInboxThreadsByReturn). */
export const returnOrder = (task: TaskOverview, returnedAt?: number) => Math.max(time(task.createdAt), time(task.unsettledAt), time(task.lastUserMessageAt), time(task.lastCompletedAt), returnedAt ?? 0);

export type CodeSectionOptions = { working?: boolean; returnedAt?: (id: string) => number | undefined };

/**
 * Code chats in T3's sidebar order: pinned, active (newest start or return first), then Working when it is on,
 * snoozed (soonest wake) and settled (latest first).
 */
export function codeSections(tasks: TaskOverview[], projects: Project[], scope: string | readonly string[], now = Date.now(), options: CodeSectionOptions = {}): CodeSections {
	// Archived projects keep their chats, out of the sidebar until the project is unarchived.
	const live = new Set(projects.filter(project => !project.worktree?.removedAt && !isProjectArchived(project, projects)).map(project => project.id));
	const scopes = new Set(projectScopes(scope));
	const sections: CodeSections = { pinned: [], active: [], working: [], snoozed: [], settled: [] };
	const background = options.working ? withBackgroundWork(tasks) : new Set<string>();
	for (const task of tasks) {
		if (!task.projectId || !live.has(task.projectId) || task.delegation?.parentTaskId || task.archived) continue;
		if (scopes.size && !scopes.has(task.projectId)) continue;
		const section = sidebarSection(task, now);
		// Only the active list folds away: pins stay where the person put them, and snoozed and settled keep their shelves.
		sections[section === "active" && options.working && isWorking(task, background) ? "working" : section].push(task);
	}
	// T3: dragged pinned chats first in their order, then the rest newest first; in the active list, chats never dragged come first.
	const keyed = (a: TaskOverview, b: TaskOverview) => (a.orderKey ?? 0) - (b.orderKey ?? 0);
	sections.pinned.sort((a, b) => Number(a.orderKey === undefined) - Number(b.orderKey === undefined) || keyed(a, b) || b.createdAt.localeCompare(a.createdAt));
	// With the Working section on, the list is ordered by time, so dragged places are ignored (and kept).
	if (options.working) sections.active.sort((a, b) => returnOrder(b, options.returnedAt?.(b.id)) - returnOrder(a, options.returnedAt?.(a.id)) || a.id.localeCompare(b.id));
	else sections.active.sort((a, b) => Number(b.orderKey === undefined) - Number(a.orderKey === undefined) || keyed(a, b) || activeOrder(b) - activeOrder(a) || b.createdAt.localeCompare(a.createdAt));
	sections.working.sort((a, b) => workingOrder(b) - workingOrder(a) || a.id.localeCompare(b.id));
	sections.snoozed.sort((a, b) => time(a.snoozedUntil) - time(b.snoozedUntil));
	sections.settled.sort((a, b) => (time(b.settledAt) || time(b.updatedAt)) - (time(a.settledAt) || time(a.updatedAt)));
	return sections;
}

/** The project menu's label: all projects, the one project, or how many are picked. */
export function scopeLabel(scoped: readonly Pick<Project, "name">[]) { return !scoped.length ? "All projects" : scoped.length === 1 ? scoped[0].name : `${scoped.length} projects`; }

export type CodeFolder = { project: Project; tasks: TaskOverview[] };
/**
 * T3's project folders: the active chats grouped by project (a worktree's chats under the project it came from), the
 * folder holding your latest message first. Projects with no active chats have no folder. Chats keep the list's order.
 */
export function codeFolders(tasks: readonly TaskOverview[], projects: readonly Project[]): CodeFolder[] {
	const byId = new Map(projects.map(project => [project.id, project]));
	const folders = new Map<string, CodeFolder & { latest: number }>();
	for (const task of tasks) {
		const own = task.projectId ? byId.get(task.projectId) : undefined, project = own?.worktree ? byId.get(own.worktree.sourceProjectId) ?? own : own;
		if (!project) continue;
		const folder = folders.get(project.id) ?? { project, tasks: [], latest: 0 };
		folder.tasks.push(task); folder.latest = Math.max(folder.latest, workingOrder(task));
		folders.set(project.id, folder);
	}
	return [...folders.values()].sort((a, b) => b.latest - a.latest || a.project.name.localeCompare(b.project.name)).map(({ project, tasks }) => ({ project, tasks }));
}

/**
 * T3's createInboxReturnTracker: remembers when this window saw each chat leave Working, a return nothing stamps
 * (an approval asked mid-turn, background work ending). The first observation only takes a baseline; null resets.
 */
export function createReturnTracker(clock = () => Date.now()) {
	let lastWorking: Set<string> | undefined;
	const returns = new Map<string, number>();
	return {
		observe(tasks: readonly TaskOverview[] | null) {
			if (!tasks) { lastWorking = undefined; returns.clear(); return; }
			const background = withBackgroundWork(tasks);
			const present = new Set(tasks.map(task => task.id)), working = new Set(tasks.filter(task => isWorking(task, background)).map(task => task.id));
			for (const id of returns.keys()) if (!present.has(id)) returns.delete(id);
			const at = clock();
			for (const id of lastWorking ?? []) if (present.has(id) && !working.has(id)) returns.set(id, at);
			lastWorking = working;
		},
		returnedAt: (id: string) => returns.get(id),
	};
}

/** After parking the open chat, T3 opens the next one still in the list, else the one before it. */
export function nextAfterParking(sections: Pick<CodeSections, "pinned" | "active">, id: string) {
	const visible = [...sections.pinned, ...sections.active];
	const index = visible.findIndex(task => task.id === id);
	if (index < 0) return undefined;
	return visible[index + 1] ?? visible[index - 1];
}
