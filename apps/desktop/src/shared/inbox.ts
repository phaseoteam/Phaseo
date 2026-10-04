import type { Task, TaskStatus } from "./workspace";

export type TaskAttention = { archived: boolean; status: TaskStatus; approvalsCount: number; answersCount: number; steeringReviewCount: number };

export function inboxReason(task: Task): string | undefined {
	return inboxReasonFromCounts({ archived: task.archived, status: task.status, approvalsCount: task.approvals?.length ?? 0, answersCount: (task.forms?.length ?? 0) + (task.questions?.length ?? 0), steeringReviewCount: task.steering?.filter(value => value.status === "unconfirmed" || value.status === "rejected").length ?? 0 });
}

export function inboxReasonFromCounts(task: TaskAttention): string | undefined {
	if (task.archived) return;
	if (task.approvalsCount) return "Approval needed";
	if (task.answersCount) return "Answer needed";
	if (task.steeringReviewCount) return "Review pending instruction";
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
