import type { QuitHoldState } from "../shared/desktop";

/** How long the quit shortcut must be held. */
export const quitHoldMs = 1000;

/** The parts of Electron's before-input-event input this reads. */
export type QuitHoldInput = { type: string; key: string; control: boolean; meta: boolean; alt: boolean; shift: boolean; isAutoRepeat: boolean };

/**
 * Settings → Chat → Quitting → "Hold the shortcut to quit": ⌘Q (Ctrl+Q on Windows and Linux) quits only once held for
 * quitHoldMs, so a stray press never closes Phaseo. Letting go of Q or the modifier first, or leaving the window, cancels.
 * In other modes it does nothing and ⌘Q works as the menu says.
 */
export class QuitHold {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private target: ((state: QuitHoldState) => void) | undefined;
	constructor(private readonly deps: { mac: boolean; enabled: () => boolean; quit: () => void; holdMs?: number }) {}

	/** Handles one key event from a window; true when the event is the shortcut and must not reach the page or the menu. */
	input(input: QuitHoldInput, notify: (state: QuitHoldState) => void) {
		const q = input.key.toLowerCase() === "q";
		if (input.type === "keyDown") {
			if (!q || !this.deps.enabled() || input.alt || input.shift || (this.deps.mac ? !input.meta || input.control : !input.control || input.meta)) return false;
			if (!this.timer && !input.isAutoRepeat) {
				const ms = this.deps.holdMs ?? quitHoldMs;
				this.target = notify;
				this.timer = setTimeout(() => { this.timer = undefined; this.target?.({ state: "quitting" }); this.target = undefined; this.deps.quit(); }, ms);
				notify({ state: "holding", ms });
			}
			return true;
		}
		if (input.type === "keyUp" && this.timer && (q || input.key === (this.deps.mac ? "Meta" : "Control"))) { this.cancel(); return q; }
		return false;
	}

	/** Stops a hold in progress, as when its window loses focus. */
	cancel() {
		if (!this.timer) return;
		clearTimeout(this.timer); this.timer = undefined;
		this.target?.({ state: "cancelled" }); this.target = undefined;
	}
}
