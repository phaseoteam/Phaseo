import { useSyncExternalStore } from "react";
import { MessageText } from "../components/MessageChips";

export type PendingSend = { id: string; taskId: string; text: string; delivered?: boolean };

// Messages shown in the chat from the moment Send is pressed until the app has stored them (or refused them).
let pending: PendingSend[] = [];
const listeners = new Set<() => void>();
const changed = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

const remove = (id: string) => { pending = pending.filter(value => value.id !== id); changed(); };

/**
 * Shows a message as sent while it is still on its way. The returned function settles it: a refused message goes
 * at once, a stored one stays until the chat's next copy (which has it) arrives, so it never blinks out in between.
 */
export function addPendingSend(taskId: string, text: string) {
	const id = crypto.randomUUID();
	pending = [...pending, { id, taskId, text }]; changed();
	return (delivered: boolean) => {
		if (!delivered) { remove(id); return; }
		pending = pending.map(value => value.id === id ? { ...value, delivered } : value); changed();
		// In case no newer copy of the chat ever arrives.
		setTimeout(() => remove(id), 5000);
	};
}

/** A newer copy of the chat arrived: messages it stored are in it now. */
export function dropDeliveredSends(taskId: string) {
	if (!pending.some(value => value.taskId === taskId && value.delivered)) return;
	pending = pending.filter(value => value.taskId !== taskId || !value.delivered); changed();
}

export const pendingSendsFor = (taskId: string, values = pending) => values.filter(value => value.taskId === taskId);

/** The chat's messages on their way, drawn like sent ones but quieter, so a slow send does not look like nothing happened. */
export function PendingSends({ taskId, projectId }: { taskId: string; projectId?: string }) {
	const all = useSyncExternalStore(subscribe, () => pending);
	return pendingSendsFor(taskId, all).map(value => <div key={value.id} role="status" aria-label="Sending your message" className="flex flex-col items-end gap-1">
		<div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap opacity-70"><MessageText text={value.text} projectId={projectId} /></div>
		<span className="text-[11px] text-muted-foreground">Sending…</span>
	</div>);
}
