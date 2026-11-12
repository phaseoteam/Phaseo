import type { QuitConfirmation } from "../shared/chatPreferences";

/** Chats an agent is working in: running a turn or waiting on its own work, not archived ones. */
export function workingChats(tasks: readonly { status: string; archived?: boolean }[]) {
	return tasks.filter(task => !task.archived && (task.status === "running" || task.status === "waiting")).length;
}

/**
 * Settings → Chat → Quitting: asks before Phaseo quits, always or only while chats are working. With "hold", the quit
 * shortcut must be held (quitHold.ts) and other ways of quitting ask while chats are working. Every way out goes through
 * here: the Quit menu item and ⌘Q (before-quit), and closing the last window on Windows and Linux, which quits there.
 * `ask` answers whether to quit; once the person agrees, quitting proceeds without asking again.
 */
export class QuitGuard {
	private confirmed = false;
	private asking = false;
	constructor(private readonly deps: { mode: () => QuitConfirmation; working: () => number; ask: (working: number) => Promise<boolean>; quit: () => void }) {}
	/** True when quitting must wait for an answer: the caller prevents it, and the guard quits again if the answer is yes. */
	intercept() {
		if (this.confirmed) return false;
		const mode = this.deps.mode(), working = this.deps.working();
		if (mode === "direct" || ((mode === "working" || mode === "hold") && !working)) return false;
		if (this.asking) return true;
		this.asking = true;
		void this.deps.ask(working).then(quit => {
			this.asking = false;
			if (!quit) return;
			this.confirmed = true;
			this.deps.quit();
		}, () => { this.asking = false; });
		return true;
	}
	/** Quits without asking: the person held the quit shortcut, which is the answer. */
	quitNow() {
		this.confirmed = true;
		this.deps.quit();
	}
}
