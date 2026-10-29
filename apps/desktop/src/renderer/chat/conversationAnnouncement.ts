import type { Task, TaskStatus } from "../../shared/workspace";

/** What a screen reader hears about the open chat: its state, and the request waiting on the person, if any. */
export type AnnouncementSnapshot = { status: TaskStatus; approval?: string; input?: string };

export const snapshotOf = (task: Pick<Task, "status" | "approvals" | "questions" | "forms">): AnnouncementSnapshot => ({
	status: task.status,
	...(task.approvals?.[0] ? { approval: task.approvals[0].id } : {}),
	...(task.questions?.[0] ?? task.forms?.[0] ? { input: (task.questions?.[0] ?? task.forms?.[0])!.id } : {}),
});

const busy = (status: TaskStatus) => status === "running" || status === "waiting";
const endings: Partial<Record<TaskStatus, string>> = { completed: "Done", idle: "Done", failed: "Failed", interrupted: "Stopped", limited: "Usage limit reached" };

/**
 * T3's announcer: one short phrase when a turn starts, needs the person or ends, never the streamed text. The first
 * snapshot of a chat is a silent baseline, so opening or switching chats replays nothing.
 */
export function nextAnnouncement(previous: AnnouncementSnapshot | undefined, next: AnnouncementSnapshot): string | undefined {
	if (!previous) return;
	if (next.approval && next.approval !== previous.approval) return "Needs approval";
	if (next.input && next.input !== previous.input) return "Needs your input";
	if (busy(next.status) && !busy(previous.status)) return "Working";
	if (!busy(next.status) && busy(previous.status)) return endings[next.status];
}
