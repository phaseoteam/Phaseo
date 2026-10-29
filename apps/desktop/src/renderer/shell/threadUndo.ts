import { useSyncExternalStore } from "react";

/**
 * The last sidebar action that can be undone, shown for five seconds as in T3 Code. Repeats group: "Settled 2 chats".
 * A deletion waits for its notice: `commit` runs when the notice goes without Undo (it times out, is dismissed or a
 * different action replaces it), so until then the chat is only hidden.
 */
export type UndoVerb = "Settled" | "Snoozed" | "Unpinned" | "Archived" | "Deleted";
export type ThreadUndo = { verb: UndoVerb; count: number; undo: () => Promise<unknown>; commit?: () => Promise<unknown>; at: number };

let current: ThreadUndo | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
/** Ends the notice; without Undo, a pending deletion goes ahead. */
const finish = (undone: boolean) => { const action = current; current = undefined; if (timer) clearTimeout(timer); timer = undefined; emit(); if (!undone) void action?.commit?.(); };

export const undoLabel = (action: ThreadUndo) => action.count === 1 ? `${action.verb} chat` : `${action.verb} ${action.count} chats`;

export function offerUndo(verb: UndoVerb, undo: () => Promise<unknown>, commit?: () => Promise<unknown>) {
	const now = Date.now();
	if (current && current.verb === verb && now - current.at < 5_000) {
		const earlier = current;
		current = { verb, count: earlier.count + 1, undo: async () => { await earlier.undo(); await undo(); }, ...(earlier.commit || commit ? { commit: async () => { await earlier.commit?.(); await commit?.(); } } : {}), at: now };
	} else { if (current) finish(false); current = { verb, count: 1, undo, ...(commit ? { commit } : {}), at: now }; }
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => finish(false), 5_000);
	emit();
}

/** Runs and forgets the pending undo; false when there is nothing to undo. */
export function runUndo() {
	const action = current;
	if (!action) return false;
	finish(true);
	void action.undo();
	return true;
}

export const dismissUndo = () => finish(false);

export function useThreadUndo() {
	return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current);
}

/** Chats whose deletion waits on its undo notice; lists leave them out meanwhile. */
let hidden: ReadonlySet<string> = new Set();
const hiddenListeners = new Set<() => void>();
function setHidden(next: ReadonlySet<string>) { hidden = next; for (const listener of hiddenListeners) listener(); }
export const usePendingDeletes = () => useSyncExternalStore(listener => { hiddenListeners.add(listener); return () => { hiddenListeners.delete(listener); }; }, () => hidden);

/** Hides the chat at once and deletes it when the notice goes without Undo. */
export function deleteWithUndo(id: string, remove: () => Promise<unknown>) {
	setHidden(new Set([...hidden, id]));
	const show = () => setHidden(new Set([...hidden].filter(value => value !== id)));
	offerUndo("Deleted", async () => show(), async () => { try { await remove(); } finally { show(); } });
}
