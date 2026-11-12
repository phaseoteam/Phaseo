import { useSyncExternalStore } from "react";

/** The floating player: one browser tab per chat floats over the chat, sized and placed as the person left it. */
export type MiniPlayerSize = { width: number; height: number };
export type MiniPlayerPosition = { x: number; y: number };
export type MiniPlayerFrame = MiniPlayerPosition & MiniPlayerSize;
/** A chat's player; a closed one keeps its size and place for next time. */
export type MiniPlayerState = { tabId: string; open: boolean; source: MiniPlayerSize; width?: number; position?: MiniPlayerPosition };
export type MiniPlayerResizeDirection = "north" | "south" | "east" | "west" | "northeast" | "northwest" | "southeast" | "southwest";

export const miniPlayerEdgeGap = 12;
export const miniPlayerCornerRadius = 12;
/** Room above the player for its handle and hover pill, which sit outside it because the native page draws over the app. */
export const miniPlayerHandleSpace = 40;
const defaultBox = { width: 320, height: 320 }, minimum = { width: 240, height: 150 };
const fallbackSource = { width: 1280, height: 800 };

/** The aspect a page floats at: the size it had in the pane, else a 16:10 window. */
export function miniPlayerSource(size?: Partial<MiniPlayerSize>): MiniPlayerSize {
	const width = Number(size?.width), height = Number(size?.height);
	return Number.isFinite(width) && Number.isFinite(height) && width >= 50 && height >= 50 ? { width: Math.round(width), height: Math.round(height) } : fallbackSource;
}
/** Width is the player's only free dimension; height follows the page's aspect, so the page fills it. A tight chat wins over the minimum. */
function fitWidth(desired: number, source: MiniPlayerSize, max: MiniPlayerSize): MiniPlayerSize {
	const ratio = source.width / source.height;
	const width = Math.min(Math.max(desired, minimum.width, minimum.height * ratio), Math.max(1, max.width), Math.max(1, max.height * ratio));
	return { width: Math.round(width), height: Math.round(width / ratio) };
}
const area = (container: MiniPlayerSize): MiniPlayerSize => ({ width: container.width - miniPlayerEdgeGap * 2, height: container.height - miniPlayerEdgeGap - miniPlayerHandleSpace });
/** Keeps the player inside the chat, below room for its handle. */
export function clampMiniPlayerPosition(position: MiniPlayerPosition, container: MiniPlayerSize, player: MiniPlayerSize): MiniPlayerPosition {
	return {
		x: Math.round(Math.min(Math.max(position.x, miniPlayerEdgeGap), Math.max(miniPlayerEdgeGap, container.width - player.width - miniPlayerEdgeGap))),
		y: Math.round(Math.min(Math.max(position.y, miniPlayerHandleSpace), Math.max(miniPlayerHandleSpace, container.height - player.height - miniPlayerEdgeGap))),
	};
}
/**
 * The frame on screen from the saved width and position. Clamping happens on every layout instead of being saved, so a narrow
 * window for a moment never loses the chosen size. A player without a position sits at the top right, at most 320 × 320.
 */
export function resolveMiniPlayerFrame(state: Pick<MiniPlayerState, "source" | "width" | "position">, container: MiniPlayerSize): MiniPlayerFrame {
	const source = miniPlayerSource(state.source);
	const size = fitWidth(state.width ?? Math.min(defaultBox.width, defaultBox.height * source.width / source.height), source, area(container));
	const anchored = state.position ?? { x: container.width - miniPlayerEdgeGap - size.width, y: miniPlayerHandleSpace };
	return { ...clampMiniPlayerPosition(anchored, container, size), ...size };
}
/** Resizes from an edge or corner, holding the aspect; the opposite edge stays put. */
export function resizeMiniPlayer(start: MiniPlayerFrame, direction: MiniPlayerResizeDirection, delta: MiniPlayerPosition, source: MiniPlayerSize, container: MiniPlayerSize): MiniPlayerFrame {
	const east = direction.includes("east"), west = direction.includes("west"), north = direction.includes("north"), south = direction.includes("south");
	const right = start.x + start.width, bottom = start.y + start.height;
	const max = {
		width: west ? right - miniPlayerEdgeGap : east ? container.width - miniPlayerEdgeGap - start.x : container.width - miniPlayerEdgeGap * 2,
		height: north ? bottom - miniPlayerHandleSpace : south ? container.height - miniPlayerEdgeGap - start.y : container.height - miniPlayerEdgeGap - miniPlayerHandleSpace,
	};
	const ratio = source.width / source.height;
	const desiredWidth = start.width + (east ? delta.x : west ? -delta.x : 0), desiredHeight = start.height + (south ? delta.y : north ? -delta.y : 0);
	const horizontal = east || west, vertical = north || south;
	// Corner drags follow the aspect diagonal, so switching the leading axis does not jump.
	const desired = horizontal && vertical ? (desiredWidth + desiredHeight / ratio) / (1 + 1 / ratio ** 2) : horizontal ? desiredWidth : desiredHeight * ratio;
	const size = fitWidth(desired, source, max);
	return { ...clampMiniPlayerPosition({ x: west ? right - size.width : start.x, y: north ? bottom - size.height : start.y }, container, size), ...size };
}

/** Saved players by chat, validated. */
export function miniPlayerStates(value: unknown): Record<string, MiniPlayerState> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const result: Record<string, MiniPlayerState> = {};
	for (const [context, raw] of Object.entries(value as Record<string, unknown>).slice(-200)) {
		if (!raw || typeof raw !== "object") continue;
		const item = raw as Record<string, unknown>;
		if (typeof item.tabId !== "string" || !item.tabId || item.tabId.length > 300 || (item.tabId !== context && !item.tabId.startsWith(context + ":"))) continue;
		const state: MiniPlayerState = { tabId: item.tabId, open: item.open === true, source: miniPlayerSource(item.source as Partial<MiniPlayerSize> | undefined) };
		if (typeof item.width === "number" && Number.isFinite(item.width) && item.width > 0) state.width = Math.round(item.width);
		const position = item.position as Partial<MiniPlayerPosition> | undefined;
		if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) state.position = { x: Math.round(position.x!), y: Math.round(position.y!) };
		result[context] = state;
	}
	return result;
}

// One store per window, remembered across restarts.
const storageKey = "phaseo.desktop.browser.miniPlayer";
let saved: Record<string, MiniPlayerState> = {};
try { saved = miniPlayerStates(JSON.parse(localStorage.getItem(storageKey) ?? "{}")); } catch { /* Start empty when storage is unavailable or invalid. */ }
const listeners = new Set<() => void>();
function commit(next: Record<string, MiniPlayerState>) {
	saved = next;
	try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* Keep working without storage. */ }
	for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** The chat's open player, if any. */
export function useMiniPlayer(context: string): MiniPlayerState | undefined { return useSyncExternalStore(subscribe, () => saved[context]?.open ? saved[context] : undefined); }
export const miniPlayerFor = (context: string): MiniPlayerState | undefined => saved[context]?.open ? saved[context] : undefined;
/** Floats a tab over its chat; a player moved or resized earlier keeps its place. */
export function openMiniPlayer(context: string, tabId: string, source?: Partial<MiniPlayerSize>) {
	const previous = saved[context];
	commit({ ...saved, [context]: { ...previous, tabId, open: true, source: miniPlayerSource(source ?? previous?.source) } });
}
/** Closes the player but remembers where it was. */
export function closeMiniPlayer(context: string) {
	const previous = saved[context]; if (!previous?.open) return;
	commit({ ...saved, [context]: { ...previous, open: false } });
}
export function placeMiniPlayer(context: string, frame: Partial<MiniPlayerFrame>) {
	const previous = saved[context]; if (!previous) return;
	commit({ ...saved, [context]: { ...previous, ...(frame.width !== undefined ? { width: Math.round(frame.width) } : {}), ...(frame.x !== undefined && frame.y !== undefined ? { position: { x: Math.round(frame.x), y: Math.round(frame.y) } } : {}) } });
}

/** Browser tabs a pane surface is showing right now: the player hides while its tab shows in the pane. */
const shown = new Map<string, number>();
const shownListeners = new Set<() => void>();
export function markBrowserSurfaceShown(tabId: string) {
	shown.set(tabId, (shown.get(tabId) ?? 0) + 1); for (const listener of shownListeners) listener();
	return () => { const count = (shown.get(tabId) ?? 1) - 1; if (count > 0) shown.set(tabId, count); else shown.delete(tabId); for (const listener of shownListeners) listener(); };
}
export function useBrowserSurfaceShown(tabId: string | undefined) {
	return useSyncExternalStore(listener => { shownListeners.add(listener); return () => { shownListeners.delete(listener); }; }, () => Boolean(tabId && shown.has(tabId)));
}
