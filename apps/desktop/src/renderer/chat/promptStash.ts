import { useSyncExternalStore } from "react";
import { parseMentions, mentionToken } from "../lib/mentions";

/** T3's prompt stash: drafts parked with Mod+S, kept on this device and brought back from the composer. */
export type StashedPrompt = { id: string; text: string; taskId?: string; createdAt: string };
const storageKey = "phaseo.desktop.promptStash", limit = 20;
const listeners = new Set<() => void>();

function read(): StashedPrompt[] {
	try { const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown; return Array.isArray(value) ? value.filter((item): item is StashedPrompt => Boolean(item) && typeof item.id === "string" && typeof item.text === "string" && typeof item.createdAt === "string") : []; } catch { return []; }
}
let items: StashedPrompt[] | undefined;
function update(next: StashedPrompt[]) {
	items = next.slice(0, limit);
	try { localStorage.setItem(storageKey, JSON.stringify(items)); } catch { /* The stash lasts this session. */ }
	for (const listener of listeners) listener();
}
const current = () => items ??= read();

export const useStash = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, current);
/** Parks a draft, newest first; the same text stashed again moves to the top. */
export function stashPrompt(text: string, taskId?: string) {
	if (!text.trim()) return;
	update([{ id: crypto.randomUUID(), text, ...(taskId ? { taskId } : {}), createdAt: new Date().toISOString() }, ...current().filter(item => item.text !== text)]);
}
/** Takes a stashed draft out (the newest without an id). */
export function takeStashed(id?: string) {
	const item = id ? current().find(value => value.id === id) : current()[0];
	if (item) update(current().filter(value => value !== item));
	return item;
}
export const clearStash = () => update([]);

/** A stashed draft for this chat. Attachments belong to the chat they were added in, so elsewhere their chips are left out. */
export function stashedDraft(item: StashedPrompt, taskId?: string) {
	if (!item.taskId || item.taskId === taskId) return { text: item.text, dropped: 0 };
	let dropped = 0;
	const text = parseMentions(item.text).map(segment => typeof segment === "string" ? segment : segment.kind === "attachment" || segment.kind === "image" ? (dropped++, "") : mentionToken(segment)).join("").replace(/[ \t]+\n/g, "\n").trim();
	return { text, dropped };
}
