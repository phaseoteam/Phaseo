import { useSyncExternalStore } from "react";

/**
 * Which Markdown renderer messages use. Words (`@pierre/words`) is an experiment: set
 * `localStorage["phaseo:markdown-engine"] = "words"` (or run `phaseoMarkdownEngine("words")` in DevTools) to try it.
 */
export type MarkdownEngine = "react-markdown" | "words";

const storageKey = "phaseo:markdown-engine";
const listeners = new Set<() => void>();
const read = (): MarkdownEngine => { try { return localStorage.getItem(storageKey) === "words" ? "words" : "react-markdown"; } catch { return "react-markdown"; } };
let current: MarkdownEngine | undefined;

export function setMarkdownEngine(engine: MarkdownEngine) {
	current = engine;
	try { localStorage.setItem(storageKey, engine); } catch { /* Storage can be unavailable. */ }
	for (const listener of listeners) listener();
}

if (typeof window !== "undefined") (window as unknown as { phaseoMarkdownEngine?: typeof setMarkdownEngine }).phaseoMarkdownEngine = setMarkdownEngine;

export function useMarkdownEngine(): MarkdownEngine {
	return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => (current ??= read()), () => "react-markdown");
}
