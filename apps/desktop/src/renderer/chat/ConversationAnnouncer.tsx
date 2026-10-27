import { useEffect, useRef } from "react";
import type { Task } from "../../shared/workspace";
import { nextAnnouncement, snapshotOf, type AnnouncementSnapshot } from "./conversationAnnouncement";

/**
 * The open chat's one polite live region, written straight to the DOM so speaking never re-renders. The conversation
 * itself is not live: a screen reader would read every streamed chunk. Cleared after seven seconds, as T3 does, so
 * NVDA does not repeat it when focus returns from a dialog.
 */
export function ConversationAnnouncer({ task }: { task: Task }) {
	const region = useRef<HTMLDivElement>(null);
	const memory = useRef<{ id: string; snapshot: AnnouncementSnapshot } | undefined>(undefined);
	const snapshot = snapshotOf(task), key = JSON.stringify(snapshot);
	useEffect(() => {
		const previous = memory.current?.id === task.id ? memory.current.snapshot : undefined;
		memory.current = { id: task.id, snapshot };
		const text = nextAnnouncement(previous, snapshot), element = region.current;
		if (!element) return;
		if (!previous) { element.textContent = ""; return; }
		if (!text) return;
		// A repeat counts as new only if the text changes.
		element.textContent = element.textContent === text ? `${text}\u00a0` : text;
		const timer = setTimeout(() => { element.textContent = ""; }, 7_000);
		return () => clearTimeout(timer);
	// key is the snapshot as text, so an unchanged state does not run this again.
	}, [task.id, key]);
	// No role="status": Orca maps it to a status bar in Chromium and drops its updates.
	return <div ref={region} aria-live="polite" className="sr-only" data-conversation-announcer="" />;
}
