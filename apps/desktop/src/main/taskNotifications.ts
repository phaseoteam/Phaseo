import { inboxReason, needsAttention } from "../shared/inbox";
import type { Workspace } from "../shared/workspace";
import type { WorkspacePreferences } from "../shared/preferences";

type Ports = { focused: () => boolean; supported: () => boolean; show: (title: string, body: string, click: () => void) => () => void; open: (taskId?: string) => void };
export class TaskNotifications {
	private previous?: Map<string, string>;
	private displayed: (() => void)[] = [];
	constructor(private readonly ports: Ports, private preferences: WorkspacePreferences) {}
	configure(preferences: WorkspacePreferences) { this.preferences = preferences; if (preferences.notifications === "off") this.dismiss(); }
	update(workspace: Workspace) {
		const current = new Map<string, string>(); const changes: { id: string; title: string; reason: string }[] = [];
		for (const task of workspace.tasks) {
			const reason = inboxReason(task); if (!reason) continue;
			const key = JSON.stringify([reason, task.messages.findLast(value => value.role === "user")?.id, task.approvals?.map(value => value.id), task.questions?.map(value => value.id), task.forms?.map(value => value.id), task.steering?.map(value => [value.id, value.status])]); current.set(task.id, key);
			if (this.previous && this.previous.get(task.id) !== key && (this.preferences.notifications === "all" || (this.preferences.notifications === "attention" && needsAttention(task)))) changes.push({ id: task.id, title: task.title, reason });
		}
		this.previous = current;
		if (!changes.length) return;
		try {
			if (this.ports.focused() || !this.ports.supported()) return;
			this.dismiss();
			if (changes.length > 3) this.displayed.push(this.ports.show("Phaseo", `${changes.length} tasks have updates`, () => this.ports.open()));
			else for (const change of changes) this.displayed.push(this.ports.show("Phaseo", this.preferences.notificationTitles ? `${change.title.slice(0, 120)} — ${change.reason}` : change.reason, () => this.ports.open(change.id)));
		} catch { /* Notification availability must never interrupt task execution. */ }
	}
	dismiss() { for (const close of this.displayed) { try { close(); } catch { /* Already dismissed by the operating system. */ } } this.displayed = []; }
}
