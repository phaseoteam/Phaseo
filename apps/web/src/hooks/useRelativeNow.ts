import { useSyncExternalStore } from "react";

// One clock for every relative time on the page ("3 minutes ago"). Each table
// used to run its own 60-second interval; now every reader shares one, and it
// only runs while something is reading it.
const TICK_MS = 30_000;

let nowMs: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (timer === null) {
		timer = setInterval(() => {
			nowMs = Date.now();
			for (const notify of listeners) notify();
		}, TICK_MS);
	}
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0 && timer !== null) {
			clearInterval(timer);
			timer = null;
			nowMs = null;
		}
	};
}

function getSnapshot() {
	if (nowMs === null) nowMs = Date.now();
	return nowMs;
}

// The server and the hydrating render have no clock, so relative text waits
// for the browser instead of mismatching.
function getServerSnapshot() {
	return null;
}

/** The current time in milliseconds, shared and refreshed every 30 seconds; null during SSR and hydration. */
export function useRelativeNow(): number | null {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
