import { useSyncExternalStore } from "react";
import { browserColorScheme, browserUrl, browserViewport, browserZoom, type BrowserColorScheme, type BrowserOpenTab, type BrowserState, type BrowserViewport } from "../../shared/browser";
import { dispatchKeybinding } from "./keybindings";

/** A saved browser tab. name is the person's own title; title is the page's. */
export type BrowserTab = { id: string; title: string; url: string; viewport: BrowserViewport; zoom?: number; colorScheme?: BrowserColorScheme; name?: string };
export type BrowserTabs = { active: string; tabs: BrowserTab[] };
/** What a pane tab shows for a browser tab. */
export type BrowserTabInfo = BrowserTab & { context: string; label: string; favicon?: string; loading: boolean; audible: boolean; muted: boolean; active: boolean };
export const browserTabLimit = 20;
const storageKey = "phaseo.desktop.browserTabs";

/** Saved tabs for one chat, validated. Older saves with Desktop/Phone/Tablet previews are converted. */
export function browserTabs(value: unknown, context: string): BrowserTabs {
	if (!value || typeof value !== "object" || !("tabs" in value) || !Array.isArray(value.tabs)) return { active: "", tabs: [] };
	const tabs: BrowserTab[] = [];
	for (const item of value.tabs.slice(0, browserTabLimit)) {
		if (!item || typeof item !== "object" || typeof item.id !== "string" || item.id.length > 200 || (item.id !== context && !item.id.startsWith(context + ":")) || tabs.some(tab => tab.id === item.id)) continue;
		let url = ""; try { if (typeof item.url === "string" && item.url) url = browserUrl(item.url); } catch { /* Discard invalid persisted addresses. */ }
		let viewport: BrowserViewport = { mode: "fill" }; try { viewport = browserViewport(item.viewport); } catch { /* Recover invalid stored previews. */ }
		// Blank tabs were saved as "New tab" before tabs took the page's title.
		const title = typeof item.title === "string" && !(item.title === "New tab" && !url) ? item.title.slice(0, 120) : "";
		const tab: BrowserTab = { viewport, id: item.id, title, url };
		try { if (item.zoom !== undefined && item.zoom !== 1) tab.zoom = browserZoom(item.zoom); } catch { /* Invalid zoom resets to 100%. */ }
		try { if (item.colorScheme !== undefined && item.colorScheme !== "system") tab.colorScheme = browserColorScheme(item.colorScheme); } catch { /* Invalid scheme follows the system. */ }
		if (typeof item.name === "string" && item.name.trim()) tab.name = item.name.trim().slice(0, 120);
		tabs.push(tab);
	}
	return { tabs, active: "active" in value && tabs.some(tab => tab.id === value.active) ? String(value.active) : tabs[0]?.id ?? "" };
}

/** The tab after a native state change; the address and title survive a load that has not committed yet. */
export function updateBrowserTab(group: BrowserTabs, state: BrowserState): BrowserTabs {
	return { ...group, tabs: group.tabs.map(tab => {
		// A fresh native page reports itself before the saved address is restored into it.
		if (tab.id !== state.id || (!state.configured && !state.url)) return tab;
		const rest: BrowserTab = { ...tab }; delete rest.zoom; delete rest.colorScheme;
		return { ...rest, viewport: state.viewport, url: state.url || (state.loading ? tab.url : ""), title: state.title || (state.loading ? tab.title : ""), ...(state.zoom !== 1 ? { zoom: state.zoom } : {}), ...(state.colorScheme !== "system" ? { colorScheme: state.colorScheme } : {}) };
	}) };
}

export function openBrowserTab(group: BrowserTabs, request: BrowserOpenTab, id: string): BrowserTabs {
	if (!group.tabs.some(tab => tab.id === request.sourceId)) return group;
	if (group.tabs.length >= browserTabLimit) throw new Error("Close a browser tab before opening another.");
	const url = browserUrl(request.url);
	return { active: request.background ? group.active : id, tabs: [...group.tabs, { id, title: "", url, viewport: { mode: "fill" } }] };
}

/** A live native surface keeps its own viewport; a fresh one takes the saved one. */
export function browserViewportToRestore(state: Pick<BrowserState, "viewport" | "configured">, saved: BrowserViewport): BrowserViewport { return state.configured ? state.viewport : saved; }

/** The pane tab title: the person's name, else the page title, else the host, else "Browser". */
export function browserTabLabel(tab: Pick<BrowserTab, "title" | "url" | "name">): string {
	if (tab.name) return tab.name;
	if (tab.title) return tab.title;
	try { return new URL(tab.url).host || "Browser"; } catch { return "Browser"; }
}

// One store per window: every chat's tabs, and the live status of each native page.
type Live = { favicon?: string; loading: boolean; audible: boolean; muted: boolean };
let saved: Record<string, BrowserTabs> = {};
try { saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") ?? {}; } catch { /* Start empty when storage is unavailable or invalid. */ }
const live = new Map<string, Live>();
const errors = new Map<string, string>();
const listeners = new Set<() => void>();
const openedListeners = new Set<(tab: { context: string; id: string; background: boolean }) => void>();
let snapshots = new Map<string, BrowserTabInfo[]>();
let focused: string | undefined;

const group = (context: string) => browserTabs(saved[context], context);
function commit(context: string, next: BrowserTabs) {
	saved = { ...saved, [context]: next };
	if (!next.tabs.length) { saved = { ...saved }; delete saved[context]; }
	try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* Keep working without storage. */ }
	changed();
}
function changed() { snapshots = new Map(); for (const listener of listeners) listener(); }
const contextOf = (id: string) => Object.keys(saved).find(context => group(context).tabs.some(tab => tab.id === id));
const newId = (context: string, tabs: BrowserTab[]) => tabs.some(tab => tab.id === context) ? context + ":" + crypto.randomUUID() : context;

let started = false;
function start() {
	if (started) return;
	started = true;
	const api = window.phaseoDesktop;
	if (!api) return;
	api.onBrowserState(recordBrowserState);
	api.onBrowserOpenTab(request => {
		const context = contextOf(request.sourceId);
		if (!context) return;
		const current = group(context), id = newId(context, current.tabs);
		try { const next = openBrowserTab(current, request, id); errors.delete(context); commit(context, next); for (const listener of openedListeners) listener({ context, id, background: request.background }); }
		catch (reason) { errors.set(context, reason instanceof Error ? reason.message : String(reason)); changed(); }
	});
	// A shortcut pressed in a page runs as if the page's surface had focus.
	api.onBrowserKey(input => { focused = input.id; dispatchKeybinding({ key: input.key, ctrlKey: input.ctrl, metaKey: input.meta, altKey: input.alt, shiftKey: input.shift }, { browserFocused: true, textFocused: false, terminalFocused: false }); });
}

/** Saves what a native page reports, from its events or a command's reply. */
export function recordBrowserState(state: BrowserState) {
	const context = contextOf(state.id);
	if (!context) return;
	const next: Live = { loading: state.loading, audible: state.audible, muted: state.muted, ...(state.favicon ? { favicon: state.favicon } : {}) };
	const statusChanged = JSON.stringify(live.get(state.id)) !== JSON.stringify(next);
	live.set(state.id, next);
	const current = group(context), updated = updateBrowserTab(current, state);
	if (JSON.stringify(current) !== JSON.stringify(updated)) commit(context, updated); else if (statusChanged) changed();
}

/** A chat's browser tabs in order. */
export function listBrowserTabs(context: string): BrowserTabInfo[] {
	start();
	const cached = snapshots.get(context);
	if (cached) return cached;
	const current = group(context);
	const tabs = current.tabs.map(tab => { const status = live.get(tab.id); return { ...tab, context, label: browserTabLabel(tab), loading: status?.loading ?? false, audible: status?.audible ?? false, muted: status?.muted ?? false, active: tab.id === current.active, ...(status?.favicon ? { favicon: status.favicon } : {}) }; });
	snapshots.set(context, tabs);
	return tabs;
}
export function subscribeBrowserTabs(listener: () => void) { start(); listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useBrowserTabs(context: string) { return useSyncExternalStore(subscribeBrowserTabs, () => listBrowserTabs(context)); }
export function useBrowserTab(context: string, id: string) { return useBrowserTabs(context).find(tab => tab.id === id); }
/** Called when a page opens a link in a new tab; background tabs should not be selected. */
export function onBrowserTabOpened(listener: (tab: { context: string; id: string; background: boolean }) => void) { start(); openedListeners.add(listener); return () => { openedListeners.delete(listener); }; }
/** The last tab problem in a chat, such as reaching the tab limit. */
export const browserTabError = (context: string) => errors.get(context) ?? "";

/** Adds a tab, optionally opening an address; returns its id. Throws at the tab limit. */
export function createBrowserTab(context: string, options: { url?: string; background?: boolean } = {}): string {
	start();
	const current = group(context);
	if (current.tabs.length >= browserTabLimit) throw new Error("Close a browser tab before opening another.");
	const id = newId(context, current.tabs);
	const url = options.url ? browserUrl(options.url) : "";
	errors.delete(context);
	commit(context, { active: options.background && current.active ? current.active : id, tabs: [...current.tabs, { id, title: "", url, viewport: { mode: "fill" } }] });
	return id;
}
/** The chat's selected tab, creating one when it has none. */
export function ensureBrowserTab(context: string): string { const current = group(context); return current.tabs.find(tab => tab.id === current.active)?.id ?? createBrowserTab(context); }
export function selectBrowserTab(context: string, id: string) { const current = group(context); if (current.active !== id && current.tabs.some(tab => tab.id === id)) commit(context, { ...current, active: id }); }
/** Closes a tab and disposes its page. */
export async function closeBrowserTab(context: string, id: string) {
	await window.phaseoDesktop?.browser({ type: "close", id });
	const current = group(context), index = current.tabs.findIndex(tab => tab.id === id);
	if (index < 0) return;
	const tabs = current.tabs.filter(tab => tab.id !== id);
	live.delete(id); errors.delete(context);
	commit(context, { tabs, active: current.active === id ? tabs[Math.min(index, tabs.length - 1)]?.id ?? "" : current.active });
}
/** Gives a tab the person's own title, or clears it with an empty name. */
export function renameBrowserTab(context: string, id: string, name: string) {
	const current = group(context), trimmed = name.trim().slice(0, 120);
	commit(context, { ...current, tabs: current.tabs.map(tab => { if (tab.id !== id) return tab; const rest: BrowserTab = { ...tab }; delete rest.name; return trimmed ? { ...rest, name: trimmed } : rest; }) });
}
export async function setBrowserTabMuted(id: string, muted: boolean) { await window.phaseoDesktop?.browser({ type: "mute", id, muted }); }

/** The browser tab that last had focus, for its shortcuts. */
export const focusedBrowserTab = () => focused;
export function setFocusedBrowserTab(id: string | undefined) { focused = id; }
