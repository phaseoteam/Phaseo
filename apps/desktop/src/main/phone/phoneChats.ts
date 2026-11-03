import type { AttentionKind, PhoneActivity, PhoneChat, PhoneChatDetail, PhoneEntry, PhoneMessage, PhoneProject, PhoneTurnChanges } from "@phaseo/phone-protocol";
import type { TurnFileChange } from "../../shared/gitDiff";
import { isFactoryWorktree } from "../../shared/factory/projects";
import { isProjectArchived } from "../../shared/projectShelf";
import { isSettled, isSnoozed, isUnread, sidebarSection } from "../../shared/threadLifecycle";
import type { AgentActivity, Message, Project, Task } from "../../shared/workspace";
import { overviewOrder, type TaskOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";

/** What a phone gets of long text: enough to read on a small screen, and frames well under the 1 MiB limit. */
const messageChars = 20_000, activityChars = 2_000, requestChars = 20_000;
const cut = (text: string, max: number) => text.length > max ? { text: `${text.slice(0, max)}…`, truncated: true as const } : { text };

/** The chats a phone lists: top-level and not archived (or only the archived ones). Agents' and side chats stay with their parent. */
export const phoneChats = (overview: WorkspaceOverview, archived = false) => overview.tasks.filter(task => task.archived === archived && !task.delegation).sort(overviewOrder);
/** Every top-level chat, archived ones too: what a phone may organise. */
export const topLevelChats = (overview: WorkspaceOverview) => overview.tasks.filter(task => !task.delegation);

/**
 * The projects a phone lists, pinned first as the window's pickers order them. Removed worktrees and Factory's
 * per-item worktrees are left out, as the window's new-chat picker leaves them out; archived ones are marked so the
 * phone can hide them. `repository` says whether a project's folder is a git checkout.
 */
export function phoneProjects(projects: readonly Project[], repository: (directory: string) => boolean): PhoneProject[] {
	const listed = projects.filter(project => !project.worktree?.removedAt && !isFactoryWorktree(project));
	return [...listed.filter(project => project.pinned), ...listed.filter(project => !project.pinned)].map(project => ({
		id: project.id, name: project.name, repository: repository(project.directory),
		...project.worktree ? { worktreeOf: project.worktree.sourceProjectId, branch: project.worktree.branch } : {},
		...project.pinned ? { pinned: true as const } : {}, ...isProjectArchived(project, projects) ? { archived: true as const } : {},
	}));
}

/** The effort a chat set: a field for Codex and Grok, a model option for the rest (see phoneHost's modelEfforts). */
export const effortOptionIds = ["effort", "reasoning", "thinking"];
export function taskEffort(task: Pick<Task, "reasoningEffort" | "modelOptions">) {
	if (task.reasoningEffort) return task.reasoningEffort;
	const option = effortOptionIds.map(id => task.modelOptions?.[id]).find(value => typeof value === "string");
	return typeof option === "string" ? option : undefined;
}

export function phoneChat(task: TaskOverview, projects: readonly Project[], now = Date.now()): PhoneChat {
	const own = task.projectId ? projects.find(value => value.id === task.projectId) : undefined;
	// A worktree's chats sit under the project it came from, as in the window's project folders, with its branch.
	const project = own?.worktree ? projects.find(value => value.id === own.worktree!.sourceProjectId) ?? own : own;
	// As the window's Inbox counts it: a settled or snoozed chat waits there quietly, unless it raises its hand.
	const needsYou = Boolean(task.attentionReason) && task.attentionReason !== "Task completed" && !["snoozed", "settled"].includes(sidebarSection(task, now));
	return {
		id: task.id, title: task.title, mode: task.mode, status: task.status, updatedAt: task.updatedAt, unread: isUnread(task), needsYou,
		...needsYou ? { attention: task.attentionReason } : {}, ...project ? { projectId: project.id, project: project.name } : {},
		...task.model ? { model: task.model } : {}, ...own?.worktree ? { branch: own.worktree.branch } : {}, ...isSettled(task) ? { settled: true as const } : {},
		...task.pinned ? { pinned: true as const } : {}, ...isSnoozed(task, now) ? { snoozedUntil: task.snoozedUntil } : {}, ...task.archived ? { archived: true as const } : {},
	};
}

/** A page of the list, newest first. The cursor is the last chat's position, so chats changing between pages don't repeat a page. */
export function chatListPage(overview: WorkspaceOverview, cursor: string | undefined, limit: number, archived = false) {
	const chats = phoneChats(overview, archived);
	let start = 0;
	if (cursor) {
		const split = cursor.lastIndexOf("|"), updatedAt = cursor.slice(0, split), id = cursor.slice(split + 1);
		const at = { updatedAt, id } as TaskOverview;
		start = chats.findIndex(task => overviewOrder(at, task) < 0);
		if (start < 0) start = chats.length;
	}
	const page = chats.slice(start, start + limit), last = page.at(-1);
	return { chats: page.map(task => phoneChat(task, overview.projects)), ...last && start + limit < chats.length ? { cursor: `${last.updatedAt}|${last.id}` } : {} };
}

/** A queued message longer than this reaches the phone cut, so the phone can't edit it without losing its end. */
export const queuedChars = 2_000;

export function phoneDetail(task: Task, overview: TaskOverview, projects: readonly Project[]): PhoneChatDetail {
	const effort = taskEffort(task);
	const pullRequests = (task.pullRequests ?? []).filter(link => link.source !== "stack-dismissed");
	return {
		...phoneChat(overview, projects), ...effort ? { reasoningEffort: effort } : {},
		harness: task.harness, ...task.accountId ? { accountId: task.accountId } : {}, ...task.permissionMode ? { permissionMode: task.permissionMode } : {},
		queue: (task.queue ?? []).map(message => { const text = cut(message.text, queuedChars); return { id: message.id, text: text.text, ...text.truncated ? { truncated: true as const } : {} }; }),
		...pullRequests.length ? { pullRequests: pullRequests.map(link => ({ repository: link.repository, number: link.number, url: link.url, ...link.snapshot ? { title: link.snapshot.title, state: link.snapshot.state } : {} })) } : {},
		approvals: (task.approvals ?? []).map(approval => ({ id: approval.id, title: approval.method, description: cut(approval.description, requestChars).text, ...approval.kind === "plan" ? { plan: true as const } : {} })),
		questions: (task.questions ?? []).map(request => ({ id: request.id, questions: request.questions.map(question => ({
			id: question.id, header: question.header, question: question.question, ...question.multiSelect ? { multiSelect: true as const } : {}, ...question.isOther ? { isOther: true as const } : {}, ...question.isSecret ? { isSecret: true as const } : {},
			...question.options?.length ? { options: question.options.map(option => ({ label: option.label, ...option.description ? { description: option.description } : {} })) } : {},
		})) })),
	};
}

const isMessage = (entry: Message | AgentActivity): entry is Message => "role" in entry;

export function phoneEntry(entry: Message | AgentActivity): PhoneEntry {
	if (isMessage(entry)) {
		const text = cut(entry.text, messageChars);
		const message: PhoneMessage = { kind: "message", id: entry.id, role: entry.role, text: text.text, createdAt: entry.createdAt,
			...entry.completedAt ? { completedAt: entry.completedAt } : {}, ...entry.delivery ? { delivery: entry.delivery } : {}, ...entry.notice ? { notice: entry.notice.summary } : {},
			...entry.attachments?.length ? { attachments: entry.attachments.map(attachment => ({ name: attachment.name, kind: attachment.kind })) } : {}, ...text.truncated ? { truncated: true as const } : {} };
		return message;
	}
	// A rendered page's text is its HTML, which a phone can't show safely; its title says what it was.
	const text = entry.htmlRender ? { text: "" } : cut(entry.text, activityChars);
	const activity: PhoneActivity = { kind: "activity", id: entry.id, type: entry.type, title: entry.title, text: text.text,
		...entry.status ? { status: entry.status } : {}, ...entry.summary ? { summary: cut(entry.summary, activityChars).text } : {},
		...entry.steps?.length ? { steps: entry.steps.map(step => ({ text: step.text, status: step.status })) } : {}, ...text.truncated ? { truncated: true as const } : {} };
	return activity;
}

/**
 * Messages and their turns' activities in reading order. Entries the timeline placed sort by that position; an activity
 * without one follows the user message its id starts with, and anything else keeps its order at the end.
 */
export function readingOrder(messages: readonly Message[], activities: readonly AgentActivity[]): PhoneEntry[] {
	const entries: (Message | AgentActivity)[] = [...messages, ...activities];
	if (entries.every(entry => entry.timelineOrder !== undefined)) return entries.sort((a, b) => a.timelineOrder! - b.timelineOrder!).map(phoneEntry);
	const after = new Map<string, AgentActivity[]>(), loose: AgentActivity[] = [], ids = new Set(messages.map(message => message.id));
	for (const activity of activities) {
		const owner = activity.id.slice(0, Math.max(0, activity.id.indexOf(":")));
		if (owner && ids.has(owner)) after.set(owner, [...after.get(owner) ?? [], activity]); else loose.push(activity);
	}
	return [...messages.flatMap(message => [message, ...after.get(message.id) ?? []]), ...loose].map(phoneEntry);
}

/** One turn's changed files in short: how many, and lines added and removed (-1 when every file was binary). */
export function turnSummary(changes: readonly TurnFileChange[]): PhoneTurnChanges {
	const text = changes.filter(change => change.additions >= 0);
	const sum = (key: "additions" | "deletions") => text.length || !changes.length ? text.reduce((total, change) => total + change[key], 0) : -1;
	return { files: changes.length, additions: sum("additions"), deletions: sum("deletions") };
}

/**
 * Each person's message that started a turn with saved snapshots gets that turn's changes, read once per snapshot pair
 * (entries are re-signed on every flush, and git is not asked each time). `changes` answers from what it has read and
 * starts reading what it hasn't; a turn that changed nothing gets no row.
 */
export function withTurnChanges(entries: PhoneEntry[], messages: readonly Message[], changes: (checkpoint: { before: string; after: string }) => PhoneTurnChanges | undefined) {
	const checkpoints = new Map(messages.flatMap(message => message.role === "user" && message.checkpoint?.after ? [[message.id, { before: message.checkpoint.before, after: message.checkpoint.after }] as const] : []));
	if (!checkpoints.size) return entries;
	return entries.map(entry => {
		const checkpoint = entry.kind === "message" ? checkpoints.get(entry.id) : undefined;
		const summary = checkpoint && changes(checkpoint);
		return summary?.files ? { ...entry, changes: summary } as PhoneMessage : entry;
	});
}

/**
 * Turn changes read from git, shared by every phone: each snapshot pair once (a few hundred kept), with the readers
 * that asked told when it lands, so their next batch carries it.
 */
export class TurnChangesCache {
	private readonly known = new Map<string, PhoneTurnChanges | null>();
	private readonly waiting = new Map<string, Set<() => void>>();
	constructor(private readonly read: (projectId: string, before: string, after: string) => Promise<readonly TurnFileChange[]>, private readonly max = 500) {}
	get(projectId: string, checkpoint: { before: string; after: string }, ready: () => void) {
		const key = `${projectId}:${checkpoint.before}:${checkpoint.after}`;
		const value = this.known.get(key);
		if (value !== undefined || this.known.has(key)) return value ?? undefined;
		const listeners = this.waiting.get(key);
		if (listeners) { listeners.add(ready); return undefined; }
		this.waiting.set(key, new Set([ready]));
		void this.read(projectId, checkpoint.before, checkpoint.after).then(turnSummary, () => null).then(summary => {
			// A failed read (a pruned snapshot, a removed project) is remembered as none, so it isn't asked again.
			if (this.known.size >= this.max) this.known.delete(this.known.keys().next().value!);
			this.known.set(key, summary);
			const done = this.waiting.get(key); this.waiting.delete(key);
			if (summary?.files) for (const listener of done ?? []) listener();
		});
		return undefined;
	}
}

/** Why a chat now wants the person, for a phone notification; nothing for a chat seen for the first time. */
export function attentionOf(before: TaskOverview | undefined, after: TaskOverview): { kind: AttentionKind; summary: string } | undefined {
	if (!before || after.archived || after.delegation) return undefined;
	if (after.approvalsCount > before.approvalsCount) return { kind: "approval", summary: `${after.title}: approval needed` };
	if (after.answersCount > before.answersCount) return { kind: "question", summary: `${after.title}: answer needed` };
	if (after.status !== before.status && after.status === "completed") return { kind: "done", summary: `${after.title}: finished` };
	if (after.status !== before.status && after.status === "failed") return { kind: "failed", summary: `${after.title}: failed` };
	return undefined;
}
