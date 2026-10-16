import { useSyncExternalStore } from "react";

/** The last sidebar action that can be undone, shown for five seconds as in T3 Code. Repeats group: "Settled 2 chats". */
export type UndoVerb = "Settled" | "Snoozed" | "Unpinned" | "Archived";
export type ThreadUndo = { verb: UndoVerb; count: number; undo: () => Promise<unknown>; at: number };

let current: ThreadUndo | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
const clear = () => { current = undefined; if (timer) clearTimeout(timer); timer = undefined; emit(); };

export const undoLabel = (action: ThreadUndo) => action.count === 1 ? `${action.verb} chat` : `${action.verb} ${action.count} chats`;

export function offerUndo(verb: UndoVerb, undo: () => Promise<unknown>) {
	const now = Date.now();
	if (current && current.verb === verb && now - current.at < 5_000) {
		const earlier = current.undo;
		current = { verb, count: current.count + 1, undo: async () => { await earlier(); await undo(); }, at: now };
	} else current = { verb, count: 1, undo, at: now };
	if (timer) clearTimeout(timer);
	timer = setTimeout(clear, 5_000);
	emit();
}

/** Runs and forgets the pending undo; false when there is nothing to undo. */
export function runUndo() {
	const action = current;
	if (!action) return false;
	clear();
	void action.undo();
	return true;
}

export const dismissUndo = clear;

export function useThreadUndo() {
	return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current);
}
