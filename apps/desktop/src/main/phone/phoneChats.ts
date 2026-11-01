import type { AttentionKind, PhoneActivity, PhoneChat, PhoneChatDetail, PhoneEntry, PhoneMessage } from "@phaseo/phone-protocol";
import { isUnread } from "../../shared/threadLifecycle";
import type { AgentActivity, Message, Project, Task } from "../../shared/workspace";
import { overviewOrder, type TaskOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";

/** What a phone gets of long text: enough to read on a small screen, and frames well under the 1 MiB limit. */
const messageChars = 20_000, activityChars = 2_000, requestChars = 20_000;
const cut = (text: string, max: number) => text.length > max ? { text: `${text.slice(0, max)}…`, truncated: true as const } : { text };

/** The chats a phone lists: top-level and not archived. Agents' and side chats stay with their parent. */
export const phoneChats = (overview: WorkspaceOverview) => overview.tasks.filter(task => !task.archived && !task.delegation).sort(overviewOrder);

export function phoneChat(task: TaskOverview, projects: readonly Project[]): PhoneChat {
	const project = task.projectId ? projects.find(value => value.id === task.projectId) : undefined;
	const needsYou = Boolean(task.attentionReason) && task.attentionReason !== "Task completed";
	return {
		id: task.id, title: task.title, mode: task.mode, status: task.status, updatedAt: task.updatedAt, unread: isUnread(task), needsYou,
		...needsYou ? { attention: task.attentionReason } : {}, ...project ? { projectId: project.id, project: project.name } : {},
	};
}

/** A page of the list, newest first. The cursor is the last chat's position, so chats changing between pages don't repeat a page. */
export function chatListPage(overview: WorkspaceOverview, cursor: string | undefined, limit: number) {
	const chats = phoneChats(overview);
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

export function phoneDetail(task: Task, overview: TaskOverview, projects: readonly Project[]): PhoneChatDetail {
	return {
		...phoneChat(overview, projects),
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

/** Why a chat now wants the person, for a phone notification; nothing for a chat seen for the first time. */
export function attentionOf(before: TaskOverview | undefined, after: TaskOverview): { kind: AttentionKind; summary: string } | undefined {
	if (!before || after.archived || after.delegation) return undefined;
	if (after.approvalsCount > before.approvalsCount) return { kind: "approval", summary: `${after.title}: approval needed` };
	if (after.answersCount > before.answersCount) return { kind: "question", summary: `${after.title}: answer needed` };
	if (after.status !== before.status && after.status === "completed") return { kind: "done", summary: `${after.title}: finished` };
	if (after.status !== before.status && after.status === "failed") return { kind: "failed", summary: `${after.title}: failed` };
	return undefined;
}
