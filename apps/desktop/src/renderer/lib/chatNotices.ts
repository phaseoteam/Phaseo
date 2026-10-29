import { isUnread } from "../../shared/threadLifecycle";
import type { TaskOverview } from "../../shared/workspaceOverview";
import type { ToastType } from "../components/ui/toast";

export type ChatNotice = { id: string; chat: string; title: string; type: ToastType };

/** What each inbox reason says in a toast; reasons left out (a chat you stopped) say nothing. */
const notices: Record<string, { title: string; type: ToastType }> = {
	"Approval needed": { title: "Needs approval", type: "info" },
	"Answer needed": { title: "Needs your input", type: "info" },
	"Waiting for you": { title: "Needs your input", type: "info" },
	"Review pending instruction": { title: "Needs your input", type: "info" },
	"Autopilot needs you": { title: "Autopilot needs you", type: "info" },
	"Spend cap reached": { title: "Spend cap reached", type: "warning" },
	"Usage limit reached": { title: "Usage limit reached", type: "warning" },
	"Task failed": { title: "Failed", type: "warning" },
	"Task completed": { title: "Finished", type: "success" },
};

const listed = (task: TaskOverview) => !task.archived && !task.delegation?.parentTaskId;

/**
 * In-app toasts, after T3's notification coordinator: a chat other than the open one finished or needs the person.
 * `previous` is what each chat's attention was; undefined on the first overview, which is a silent baseline.
 */
export function chatNotices(previous: ReadonlyMap<string, string> | undefined, tasks: readonly TaskOverview[], openId?: string) {
	const next = new Map<string, string>(), found: ChatNotice[] = [];
	for (const task of tasks) {
		const reason = task.attentionReason;
		if (!reason || !listed(task)) continue;
		const key = JSON.stringify([reason, task.attentionKey, task.lastCompletedAt ?? null]);
		next.set(task.id, key);
		const notice = notices[reason];
		if (previous && previous.get(task.id) !== key && task.id !== openId && notice) found.push({ id: task.id, chat: task.title, ...notice });
	}
	return { next, notices: found };
}

/** The dock and taskbar count: chats with a finished turn not seen yet or a request waiting on the person. */
export const badgeCount = (tasks: readonly TaskOverview[]) => tasks.filter(task => listed(task) && (isUnread(task) || Boolean(task.approvalsCount) || Boolean(task.answersCount) || task.status === "waiting")).length;
