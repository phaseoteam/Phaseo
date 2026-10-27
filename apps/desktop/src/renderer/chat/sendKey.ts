import { useSyncExternalStore } from "react";

/** Which key sends a message (T3's send shortcut setting); the other inserts a new line. Kept on this device. */
export type SendKey = "enter" | "mod+enter";
const storageKey = "phaseo.desktop.sendKey";
const listeners = new Set<() => void>();
const read = (): SendKey => { try { return localStorage.getItem(storageKey) === "mod+enter" ? "mod+enter" : "enter"; } catch { return "enter"; } };
let value: SendKey | undefined;

export const useSendKey = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => value ??= read());
export function setSendKey(next: SendKey) {
	value = next;
	try { localStorage.setItem(storageKey, next); } catch { /* The choice lasts this session. */ }
	for (const listener of listeners) listener();
}

/** Whether this key press sends. Shift+Enter is always a new line; with Mod+Enter chosen, plain Enter is one too. */
export function isSendKey(event: Pick<KeyboardEvent, "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey" | "isComposing" | "repeat">, sendKey: SendKey, mac: boolean) {
	if (event.key !== "Enter" || event.shiftKey || event.altKey || event.isComposing || event.repeat) return false;
	return sendKey === "enter" || (mac ? event.metaKey : event.ctrlKey);
}
