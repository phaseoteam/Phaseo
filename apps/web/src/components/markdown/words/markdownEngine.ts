import { useSyncExternalStore } from "react";

/**
 * Which Markdown renderer chat uses. Words (`@pierre/words`) is an experiment behind this switch:
 * `?md=words` or `?md=streamdown` in the URL sets it for this browser, and it stays until changed.
 */
export type MarkdownEngine = "streamdown" | "words";

const storageKey = "phaseo:markdown-engine";
const listeners = new Set<() => void>();

function read(): MarkdownEngine {
	if (typeof window === "undefined") return "streamdown";
	try {
		const fromUrl = new URLSearchParams(window.location.search).get("md");
		if (fromUrl === "words" || fromUrl === "streamdown") {
			window.localStorage.setItem(storageKey, fromUrl);
			return fromUrl;
		}
		return window.localStorage.getItem(storageKey) === "words" ? "words" : "streamdown";
	} catch {
		return "streamdown";
	}
}

let current: MarkdownEngine | undefined;
const snapshot = () => (current ??= read());

export function setMarkdownEngine(engine: MarkdownEngine) {
	current = engine;
	try { window.localStorage.setItem(storageKey, engine); } catch { /* Private windows can refuse storage. */ }
	for (const listener of listeners) listener();
}

export function useMarkdownEngine(): MarkdownEngine {
	return useSyncExternalStore(
		(listener) => { listeners.add(listener); return () => listeners.delete(listener); },
		snapshot,
		() => "streamdown",
	);
}
