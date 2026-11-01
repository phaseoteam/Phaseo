/**
 * The right pane's tabs: every browser tab, terminal, file and pull request is its own pane tab.
 * A tab is a key: "browser:<id>", "pull:<number>", "file:<path>", "terminal:<id>", or a single surface
 * ("files", "diff", "pulls", "terminal", "agents").
 */
export type PaneKey = string;
export type PaneState = { tabs: PaneKey[]; active?: PaneKey; maximized?: boolean; width?: number; closed?: PaneKey[] };

export const paneWidths = { default: 540, minimum: 360 };

export const paneKind = (key: PaneKey) => key.split(":")[0];
export const paneValue = (key: PaneKey) => key.slice(key.indexOf(":") + 1);

/** Opens a tab (adding it after the active one if new) and makes it active. */
export function openPaneTab(state: PaneState, key: PaneKey, background = false): PaneState {
	if (state.tabs.includes(key)) return background ? state : { ...state, active: key };
	const index = state.active ? state.tabs.indexOf(state.active) : -1;
	const tabs = [...state.tabs]; tabs.splice(index < 0 ? tabs.length : index + 1, 0, key);
	return { ...state, tabs, active: background && state.active ? state.active : key };
}

/** Closes tabs; the active tab's neighbour at the same place becomes active. Closed tabs can be reopened. */
export function closePaneTabs(state: PaneState, keys: PaneKey[]): PaneState {
	const tabs = state.tabs.filter(key => !keys.includes(key));
	const index = state.active ? state.tabs.indexOf(state.active) : -1;
	const active = state.active && tabs.includes(state.active) ? state.active : tabs[Math.min(Math.max(index, 0), tabs.length - 1)];
	const closed = [...(state.closed ?? []), ...keys.filter(key => state.tabs.includes(key))].slice(-20);
	return { ...state, tabs, active, closed };
}

/** Ctrl+Shift+T: the most recently closed tab comes back. */
export function reopenPaneTab(state: PaneState, exists: (key: PaneKey) => boolean): PaneState | undefined {
	const closed = [...(state.closed ?? [])];
	while (closed.length) {
		const key = closed.pop()!;
		if (exists(key) && !state.tabs.includes(key)) return { ...openPaneTab({ ...state, closed }, key) };
	}
	return undefined;
}

export function movePaneTab(state: PaneState, key: PaneKey, before: PaneKey | undefined): PaneState {
	if (key === before || !state.tabs.includes(key)) return state;
	const tabs = state.tabs.filter(value => value !== key);
	const index = before ? tabs.indexOf(before) : -1;
	tabs.splice(index < 0 ? tabs.length : index, 0, key);
	return { ...state, tabs };
}

/** Old saved layouts used one tab per surface type; "changes" became "files" and "browser" a real browser tab. */
export function migratePaneState(state: PaneState): PaneState {
	const rename = (key: PaneKey) => key === "changes" ? "files" : key;
	const tabs = [...new Set(state.tabs.map(rename))].filter(key => key !== "browser");
	const active = state.active ? rename(state.active) : undefined;
	return { ...state, tabs, active: active && tabs.includes(active) ? active : tabs[0] };
}
