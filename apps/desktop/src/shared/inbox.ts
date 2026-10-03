import type { Task } from "./workspace";

export function inboxReason(task: Task): string | undefined {
	if (task.archived) return;
	if (task.approvals?.length) return "Approval needed";
	if (task.forms?.length || task.questions?.length) return "Answer needed";
	if (task.steering?.some(value => value.status === "unconfirmed" || value.status === "rejected")) return "Review pending instruction";
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
