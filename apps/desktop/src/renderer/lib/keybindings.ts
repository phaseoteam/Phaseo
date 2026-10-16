import { useEffect, useRef, useSyncExternalStore } from "react";
import type { KeybindingsState } from "../../shared/desktop";
import { evaluateWhen, keybindingRows, keyLabel, matchesKey, type CommandInfo, type KeybindingCommand, type KeybindingRow, type WhenContext } from "../../shared/keybindings";
import { isMac } from "./shortcuts";

/** The person's keybindings, shared by the whole window and kept in step with keybindings.json. */
let state: KeybindingsState & { rows: KeybindingRow[]; extra: readonly CommandInfo[] } = { entries: [], path: "", rows: keybindingRows([]), extra: [] };
const listeners = new Set<() => void>();
let started = false;
const set = (next: KeybindingsState, extra = state.extra) => { state = { ...next, extra, rows: keybindingRows(next.entries, extra) }; for (const listener of listeners) listener(); };

/** Commands that come and go, such as project actions, so they get rows, shortcuts and conflict checks. */
export function setDynamicCommands(extra: readonly CommandInfo[]) {
	if (JSON.stringify(extra) === JSON.stringify(state.extra)) return;
	set(state, extra);
}

function start() {
	if (started) return;
	started = true;
	const api = window.phaseoDesktop?.keybindings;
	if (!api) return;
	void api.get().then(set, () => undefined);
	api.onChange(set);
}

export function useKeybindings() {
	start();
	return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);
}

export async function saveKeybindings(entries: KeybindingsState["entries"]) {
	const api = window.phaseoDesktop?.keybindings;
	if (!api) throw new Error("Open the desktop application to change keyboard shortcuts.");
	set(await api.save(entries));
}

/** The label of a command's first binding ("Ctrl+K", "⌘K"), or "" when it has none. Re-rendered by useKeybindings in App. */
export function shortcut(command: KeybindingCommand) {
	const row = state.rows.find(value => value.command === command && value.key);
	return row ? keyLabel(row.key, isMac()) : "";
}

const handlers = new Map<KeybindingCommand, Set<() => boolean | void>>();

/** Runs handler when command's shortcut is pressed. Returning false lets the key through. */
export function useCommand(command: KeybindingCommand, handler: () => boolean | void, enabled = true) {
	const latest = useRef(handler);
	latest.current = handler;
	useEffect(() => {
		if (!enabled) return;
		const run = () => latest.current();
		const registered = handlers.get(command) ?? new Set();
		registered.add(run); handlers.set(command, registered);
		return () => { registered.delete(run); };
	}, [command, enabled]);
}

/** useCommand for a changing list of commands, with one handler that is told which ran. */
export function useCommands(commands: readonly KeybindingCommand[], handler: (command: KeybindingCommand) => boolean | void, enabled = true) {
	const latest = useRef(handler);
	latest.current = handler;
	const key = commands.join(" ");
	useEffect(() => {
		if (!enabled || !key) return;
		const removers = key.split(" ").map(value => {
			const command = value as KeybindingCommand;
			const run = () => latest.current(command);
			const registered = handlers.get(command) ?? new Set();
			registered.add(run); handlers.set(command, registered);
			return () => { registered.delete(run); };
		});
		return () => { for (const remove of removers) remove(); };
	}, [key, enabled]);
}

/** Runs a command as if its shortcut was pressed; false when nothing handles it now. The newest handler goes first. */
export function runCommand(command: KeybindingCommand) {
	for (const handler of [...handlers.get(command) ?? []].reverse()) if (handler() !== false) return true;
	return false;
}

type KeyInput = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"> & { repeat?: boolean };
let whenContext: () => WhenContext = () => ({});

/** Runs the first binding whose keys and condition match and that something handles; true when one did. */
export function dispatchKeybinding(event: KeyInput, overrides: WhenContext = {}) {
	const candidates = state.rows.filter(row => row.key && matchesKey(row.key, event, isMac()));
	if (!candidates.length) return false;
	const active = document.activeElement as HTMLElement | null;
	const textFocused = Boolean(active && (active.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)));
	const when = { ...whenContext(), textFocused, terminalFocused: Boolean(active?.closest(".xterm")), browserFocused: Boolean(active?.closest("[data-browser-surface]")), ...overrides };
	for (const row of candidates) {
		if (!evaluateWhen(row.when, when)) continue;
		// Held keys repeat only for zoom.
		if (event.repeat && !row.command.includes("zoom")) return true;
		if (runCommand(row.command)) return true;
	}
	return false;
}

/** The single key listener: the first binding whose keys and condition match, and that something handles, wins. */
export function useKeybindingDispatcher(context: () => WhenContext) {
	const latest = useRef(context);
	latest.current = context;
	useEffect(() => {
		whenContext = () => latest.current();
		const onKeyDown = (event: KeyboardEvent) => {
			// A shortcut field records keys instead of running them.
			if (event.isComposing || event.defaultPrevented || (document.activeElement as HTMLElement | null)?.dataset.keybindingCapture !== undefined) return;
			if (dispatchKeybinding(event)) event.preventDefault();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);
}

/** Whether a key event is bound to one of these commands, so a terminal can leave it to the app instead of the shell. */
export function isCommandKey(event: KeyboardEvent, commands: readonly KeybindingCommand[]) {
	const mac = isMac();
	return state.rows.some(row => row.key && commands.includes(row.command) && matchesKey(row.key, event, mac));
}
