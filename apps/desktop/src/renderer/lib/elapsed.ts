import { useSyncExternalStore } from "react";

// One timer for every live duration on screen, running only while something shows one.
const listeners = new Set<() => void>();
let now = Date.now(), timer: ReturnType<typeof setInterval> | undefined;
function subscribe(listener: () => void) {
	listeners.add(listener);
	if (!timer) { now = Date.now(); timer = setInterval(() => { now = Date.now(); for (const value of listeners) value(); }, 1000); }
	return () => { listeners.delete(listener); if (!listeners.size && timer) { clearInterval(timer); timer = undefined; } };
}
const idle = () => () => undefined;

/** The current time, updated each second while `live`; otherwise the time of the last tick. */
export function useNow(live = true) {
	return useSyncExternalStore(live ? subscribe : idle, () => live ? now : 0) || Date.now();
}

/** "12s", "4m 05s", "1h 02m": a duration that is still counting. */
export function elapsedLabel(ms: number) {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
	return `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}m`;
}
