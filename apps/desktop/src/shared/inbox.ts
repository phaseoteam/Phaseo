import type { Task, TaskStatus } from "./workspace";
import type { TaskOverview } from "./workspaceOverview";
import { sidebarSection } from "./threadLifecycle";

export type TaskAttention = { archived: boolean; status: TaskStatus; approvalsCount: number; answersCount: number; steeringReviewCount: number; autopilot?: Task["autopilot"] };

export function inboxReason(task: Task): string | undefined {
	return inboxReasonFromCounts({ archived: task.archived, status: task.status, approvalsCount: task.approvals?.length ?? 0, answersCount: (task.forms?.length ?? 0) + (task.questions?.length ?? 0), autopilot: task.autopilot, steeringReviewCount: task.steering?.filter(value => value.status === "unconfirmed" || value.status === "rejected").length ?? 0 });
}

export function inboxReasonFromCounts(task: TaskAttention): string | undefined {
	if (task.archived) return;
	if (task.approvalsCount) return "Approval needed";
	if (task.answersCount) return "Answer needed";
	if (task.steeringReviewCount) return "Review pending instruction";
	// Autopilot hands a chat back when it needs the person, when it stopped making progress, or at its spend cap.
	if (task.autopilot?.handback?.reason === "cap" && task.status !== "running") return "Spend cap reached";
	if ((task.autopilot?.handback?.reason === "blocked" || task.autopilot?.handback?.reason === "stalled") && task.status === "completed") return "Autopilot needs you";
	if (task.status === "waiting") return "Waiting for you";
	if (task.status === "failed") return "Task failed";
	if (task.status === "interrupted") return "Task interrupted";
	if (task.status === "limited") return "Usage limit reached";
	if (task.status === "completed") return "Task completed";
}

export function needsAttention(task: Task) {
	const reason = inboxReason(task);
	return Boolean(reason) && reason !== "Task completed";
}

/** One decision Autopilot made in a chat, kept for the Inbox's log. */
export type AutopilotDecision = { id: number; taskId: string; at: string; title: string; text: string };

/**
 * The Inbox's lists: chats and agents waiting on the person, most recently changed first, and chats Autopilot is still
 * running. Settled and snoozed chats stay out, as in the sidebar; a snoozed chat that raises its hand comes back. An agent
 * in Autopilot follows its parent, so only the chats that set Autopilot are listed as running.
 */
export function inboxLists<T extends TaskOverview>(tasks: readonly T[], now = Date.now()) {
	const needsYou = tasks.filter(task => !task.archived && task.attentionReason && task.attentionReason !== "Task completed" && !["snoozed", "settled"].includes(sidebarSection(task, now)));
	// A chat Autopilot is running that already waits on the person (stopped, failed) is listed once, under Needs you.
	const waiting = new Set(needsYou);
	const inAutopilot = tasks.filter(task => !task.archived && task.autopilot && !task.autopilot.inherited && !task.autopilot.handback && !waiting.has(task));
	const newest = (a: T, b: T) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
	return { needsYou: needsYou.sort(newest), inAutopilot: inAutopilot.sort(newest) };
}
