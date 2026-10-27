import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { ChevronDown, ChevronUp, LoaderCircle, X } from "lucide-react";
import { segmentMatches, type ConversationFindResult } from "../../shared/conversationSearch";
import { cn } from "../lib/utils";

/** The message find is on: folds and work logs around it open while it is. */
export const FindTargetContext = createContext<string | undefined>(undefined);
export const useFindTarget = (ids: string | readonly string[]) => { const target = useContext(FindTargetContext); return Boolean(target) && (typeof ids === "string" ? ids === target : ids.includes(target!)); };

/** A find asked for from elsewhere (a message search in the palette), picked up when that chat's conversation shows. */
type FindRequest = { taskId: string; query: string; messageId?: string };
let pending: FindRequest | undefined;
const listeners = new Set<() => void>();
export function requestFind(request: FindRequest) { pending = request; for (const listener of listeners) listener(); }
export function usePendingFind(taskId: string) {
	const request = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => pending);
	return request?.taskId === taskId ? request : undefined;
}
export const clearPendingFind = () => { pending = undefined; };

/** Text a find skips: action labels, hidden headings, a fold's own button. */
const ignored = ".message-code-actions, [data-find-ignore], .sr-only, .message-table-copy";

/** The ranges where `query` occurs in an element's visible text. */
export function textRanges(root: Element, query: string): Range[] {
	const nodes: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest(ignored) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
	for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
	return segmentMatches(nodes.map(node => node.data), query).map(match => { const range = document.createRange(); range.setStart(nodes[match.start.segment], match.start.offset); range.setEnd(nodes[match.end.segment], match.end.offset); return range; });
}

/** A message's text: the part people select, so timestamps and buttons beside it are left out. */
function messageRoot(host: HTMLElement, id: string) {
	const element = host.querySelector(`[data-conversation-id="message:${CSS.escape(id)}"]`);
	return element ? element.matches("[data-selectable]") ? element : element.querySelector("[data-selectable]") ?? element : undefined;
}

type Highlights = { set: (name: string, value: unknown) => void; delete: (name: string) => void };
const registry = () => (globalThis.CSS as unknown as { highlights?: Highlights } | undefined)?.highlights;
const clearHighlights = () => { registry()?.delete("chat-find"); registry()?.delete("chat-find-current"); };

/**
 * Mod+F: a find bar over the conversation, after T3's. The main process searches the whole chat, so matches on pages
 * not loaded yet count too; stepping to one loads its page (`jump`) and opens what folds it (FindTargetContext).
 * Matches are drawn with the CSS Custom Highlight API, so the messages' DOM is never changed.
 */
export function ChatFindBar({ taskId, revision, host, page, loaded, target, onTarget, jump, onScrolled, initial, focusSignal, onClose }: {
	taskId: string; revision: number; host: RefObject<HTMLDivElement | null>; page: unknown; loaded: (id: string) => boolean; target?: string;
	onTarget: (id: string | undefined) => void; jump: (id: string, turnId?: string) => void; onScrolled: () => void;
	initial?: { query: string; messageId?: string }; focusSignal: number; onClose: () => void;
}) {
	const input = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState(initial?.query ?? "");
	const [result, setResult] = useState<{ query: string; value: ConversationFindResult }>();
	const [index, setIndex] = useState(0);
	const [busy, setBusy] = useState(false);
	const wanted = useRef(initial?.messageId), searched = useRef<string | undefined>(undefined);
	const scrollPending = useRef(true);
	useEffect(() => { input.current?.focus(); input.current?.select(); }, [focusSignal]);
	// Searches as the person types, and again as the chat grows while the bar is open.
	useEffect(() => {
		const text = query.trim(), api = window.phaseoDesktop?.workspace;
		if (!text || !api) { setResult(undefined); searched.current = undefined; return; }
		let active = true;
		const timer = setTimeout(() => {
			setBusy(true);
			void api.conversationFind({ taskId, query: text }).then(value => {
				if (!active) return;
				// A new query starts at the requested message or the first match; a refresh keeps the place.
				if (searched.current !== text) {
					const at = wanted.current ? value.hits.findIndex(hit => hit.id === wanted.current) : -1;
					setIndex(at > 0 ? value.hits.slice(0, at).reduce((sum, hit) => sum + hit.count, 0) : 0);
					searched.current = text; wanted.current = undefined; scrollPending.current = true;
				}
				setResult({ query: text, value });
			}, () => { if (active) setResult(undefined); }).finally(() => { if (active) setBusy(false); });
		}, searched.current === text ? 400 : 150);
		return () => { active = false; clearTimeout(timer); };
	}, [query, taskId, revision]);
	const total = result?.value.total ?? 0, current = Math.min(index, Math.max(0, total - 1));
	// The global index as a message and an occurrence within it.
	let hit = result?.value.hits[0], occurrence = current;
	for (const candidate of result?.value.hits ?? []) { if (occurrence < candidate.count) { hit = candidate; break; } occurrence -= candidate.count; }
	// loaded and jump read the latest page; only a new target needs them.
	useEffect(() => { onTarget(hit?.id); if (hit && !loaded(hit.id)) jump(hit.id, hit.turnId); }, [hit?.id]);
	useEffect(() => () => { onTarget(undefined); clearHighlights(); }, []);
	// Draws every loaded match, marks the current one and scrolls to it when the place changed.
	useEffect(() => {
		const element = host.current, text = result?.query;
		if (!element || !text) { clearHighlights(); return; }
		const draw = (scroll: boolean) => {
			const ranges = (result?.value.hits ?? []).flatMap(value => { const root = messageRoot(element, value.id); return root ? textRanges(root, text).map(range => ({ id: value.id, range })) : []; });
			const mine = ranges.filter(value => value.id === hit?.id), chosen = mine[Math.min(occurrence, mine.length - 1)]?.range;
			const Highlight = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
			if (Highlight) { registry()?.set("chat-find", new Highlight(...ranges.map(value => value.range))); if (chosen) registry()?.set("chat-find-current", new Highlight(chosen)); else registry()?.delete("chat-find-current"); }
			if (!scroll || !hit) return;
			const box = element.getBoundingClientRect(), fallback = messageRoot(element, hit.id) ?? (hit.turnId ? messageRoot(element, hit.turnId) : undefined);
			const rect = chosen?.getBoundingClientRect() ?? fallback?.getBoundingClientRect();
			if (!rect) return;
			scrollPending.current = false;
			if (rect.top < box.top + 48 || rect.bottom > box.bottom - 48) { element.scrollTop += rect.top - box.top - box.height / 3; onScrolled(); }
		};
		const frame = requestAnimationFrame(() => draw(scrollPending.current));
		// Highlighting code and streaming replace text nodes; matches are drawn again on the new ones.
		let timer: ReturnType<typeof setTimeout> | undefined;
		const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => draw(scrollPending.current), 120); });
		observer.observe(element, { childList: true, subtree: true, characterData: true });
		return () => { cancelAnimationFrame(frame); clearTimeout(timer); observer.disconnect(); };
	// hit and occurrence follow from result and current.
	}, [result, current, target, page]);
	const step = (by: number) => { if (!total) return; scrollPending.current = true; setIndex((current + by + total) % total); };
	const label = !query.trim() ? "" : busy && !result ? "Searching…" : total ? `${current + 1} of ${total.toLocaleString()}${result?.value.truncated ? "+" : ""}` : "No results";
	return <div role="search" aria-label="Find in chat" className="absolute top-2 right-4 z-20 flex items-center gap-1 rounded-md border border-border bg-popover py-1 pr-1 pl-2.5 shadow-md">
		<input ref={input} value={query} aria-label="Find in chat" placeholder="Find in chat" spellCheck={false} onChange={event => setQuery(event.target.value)}
			onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); step(event.shiftKey ? -1 : 1); } else if (event.key === "Escape") { event.preventDefault(); onClose(); } }}
			className="h-7 w-52 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
		<span aria-live="polite" className={cn("min-w-16 text-right text-[11.5px] tabular-nums text-muted-foreground", label === "No results" && "text-destructive/80")}>{busy && result ? <LoaderCircle aria-label="Searching" className="ml-auto size-3 animate-spin" /> : label}</span>
		<FindButton label="Previous match" disabled={!total} onClick={() => step(-1)}><ChevronUp /></FindButton>
		<FindButton label="Next match" disabled={!total} onClick={() => step(1)}><ChevronDown /></FindButton>
		<FindButton label="Close find" onClick={onClose}><X /></FindButton>
	</div>;
}

function FindButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
	return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-3.5">{children}</button>;
}
