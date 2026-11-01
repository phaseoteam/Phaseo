import type { Message } from "../../shared/workspace";

/** Prompt history: Up in an empty message box recalls what the person sent, this chat first, then other chats. */
const storageKey = "phaseo.desktop.promptHistory", limit = 100;
export type HistoryPosition = { index: number; recalled: string };

/** Prompts the person typed in this chat, oldest first; Autopilot, agents and pull request updates are not theirs. */
export function chatPrompts(messages: readonly Message[]) {
	const prompts: string[] = [];
	for (const message of messages) {
		if (message.role !== "user" || message.notice || message.autopilot || message.delivery === "subagent" || message.sourceTaskId) continue;
		const text = message.text.trim();
		if (text && text !== prompts.at(-1)) prompts.push(text);
	}
	return prompts;
}

/** What Up steps through, oldest first: other chats' recent prompts, then this chat's. A prompt appears once, at its newest place. */
export function historyEntries(chat: readonly string[], recent: readonly string[]) {
	const own = new Set(chat);
	return [...recent.filter((text, index) => !own.has(text) && recent.indexOf(text) === index).reverse(), ...chat.filter((text, index) => chat.lastIndexOf(text) === index)];
}

/**
 * One step. Up works in an empty box or on a recalled prompt left as it was, so typing is never replaced; Down past the
 * newest returns to an empty box. Undefined when the key should move the caret instead.
 */
export function stepHistory(direction: "back" | "forward", entries: readonly string[], position: HistoryPosition | undefined, current: string): { position?: HistoryPosition; text: string } | undefined {
	const active = position && position.recalled === current && entries[position.index] === current ? position.index : -1;
	if (direction === "back") {
		if (active < 0 && current.trim()) return;
		const index = active < 0 ? entries.length - 1 : active - 1;
		return index >= 0 ? { position: { index, recalled: entries[index] }, text: entries[index] } : undefined;
	}
	if (active < 0) return;
	const index = active + 1;
	return index < entries.length ? { position: { index, recalled: entries[index] }, text: entries[index] } : { text: "" };
}

/** Prompts sent in any chat on this device, newest first. */
export function recentPrompts(): string[] {
	try { const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown; return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}
export function recordPrompt(text: string) {
	const value = text.trim();
	if (!value) return;
	try { localStorage.setItem(storageKey, JSON.stringify([value, ...recentPrompts().filter(item => item !== value)].slice(0, limit))); } catch { /* History is a convenience; a full store keeps the old list. */ }
}
