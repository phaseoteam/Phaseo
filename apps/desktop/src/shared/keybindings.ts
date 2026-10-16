/**
 * Keyboard shortcuts, after T3 Code: every command has default keys and an optional "when" condition, and
 * keybindings.json holds the person's own bindings. A command with any entry in the file uses those entries
 * instead of its defaults; an entry with an empty key unassigns it.
 */
export const keybindingCommands = [
	{ command: "commandPalette.toggle", label: "Search chats and commands", group: "General", keys: ["mod+k"] },
	{ command: "chat.new", label: "New chat", group: "General", keys: ["mod+n"], when: "!terminalFocused" },
	{ command: "settings.open", label: "Open settings", group: "General", keys: ["mod+,"] },
	{ command: "mode.chat", label: "Switch to Chat", group: "General", keys: ["mod+alt+1"] },
	{ command: "mode.code", label: "Switch to Code", group: "General", keys: ["mod+alt+2"] },
	{ command: "sidebar.toggle", label: "Toggle sidebar", group: "General", keys: ["mod+b"] },
	...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map(index => ({ command: `thread.jump.${index}` as const, label: `Open chat ${index} in the sidebar`, group: "Chats", keys: [`mod+${index}`] })),
	{ command: "thread.previous", label: "Previous chat", group: "Chats", keys: ["mod+shift+["] },
	{ command: "thread.next", label: "Next chat", group: "Chats", keys: ["mod+shift+]"] },
	{ command: "thread.settle", label: "Settle or un-settle chat", group: "Chats", keys: ["mod+shift+s"], when: "codeMode && chatOpen" },
	{ command: "thread.undo", label: "Undo settle, snooze, unpin or archive", group: "Chats", keys: ["mod+z"], when: "!textFocused" },
	{ command: "modelSettings.toggle", label: "Model settings", group: "Chats", keys: ["mod+shift+e"] },
	{ command: "rightPanel.toggle", label: "Toggle right pane", group: "Panes", keys: ["mod+alt+b"] },
	{ command: "rightPanel.closeTab", label: "Close pane tab", group: "Panes", keys: ["mod+w"], when: "paneOpen && !terminalFocused" },
	{ command: "terminal.toggle", label: "Toggle terminal", group: "Panes", keys: ["mod+j"] },
	{ command: "rightPanel.new", label: "Open a surface in the pane", group: "Panes", keys: ["mod+t"], when: "paneOpen && !terminalFocused" },
	{ command: "rightPanel.reopenClosed", label: "Reopen closed pane tab", group: "Panes", keys: ["mod+shift+t"] },
	{ command: "diff.toggle", label: "Toggle diff", group: "Panes", keys: ["mod+d"], when: "!terminalFocused" },
	{ command: "preview.toggle", label: "Toggle browser", group: "Panes", keys: ["mod+shift+j"] },
	{ command: "terminal.split", label: "Split terminal side by side", group: "Panes", keys: ["mod+d"], when: "terminalFocused" },
	{ command: "terminal.splitVertical", label: "Split terminal stacked", group: "Panes", keys: ["mod+shift+d"], when: "terminalFocused" },
	{ command: "terminal.new", label: "New terminal", group: "Panes", keys: ["mod+n"], when: "terminalFocused" },
	{ command: "terminal.close", label: "Close terminal", group: "Panes", keys: ["mod+w"], when: "terminalFocused" },
	// Browser commands come before the app's own: while a page or its address bar has focus, the same keys act on the page.
	{ command: "browser.reload", label: "Reload page", group: "Browser", keys: ["mod+r"], when: "browserFocused" },
	{ command: "browser.focusUrl", label: "Focus address bar", group: "Browser", keys: ["mod+l"], when: "browserFocused" },
	{ command: "browser.zoomIn", label: "Zoom page in", group: "Browser", keys: ["mod+=", "mod++"], when: "browserFocused" },
	{ command: "browser.zoomOut", label: "Zoom page out", group: "Browser", keys: ["mod+-"], when: "browserFocused" },
	{ command: "browser.zoomReset", label: "Reset page zoom", group: "Browser", keys: ["mod+0"], when: "browserFocused" },
	// T3's J and K step through a review guide while its tab is on screen, unless you are typing.
	{ command: "guide.next", label: "Next stop in a review guide", group: "Pull requests", keys: ["j"], when: "paneOpen && !textFocused && !terminalFocused && !browserFocused" },
	{ command: "guide.previous", label: "Previous stop in a review guide", group: "Pull requests", keys: ["k"], when: "paneOpen && !textFocused && !terminalFocused && !browserFocused" },
	{ command: "view.zoomIn", label: "Zoom in", group: "View", keys: ["mod+=", "mod++"] },
	{ command: "view.zoomOut", label: "Zoom out", group: "View", keys: ["mod+-"] },
	{ command: "view.zoomReset", label: "Actual size", group: "View", keys: ["mod+0"] },
] as const satisfies readonly { command: string; label: string; group: string; keys: readonly string[]; when?: string }[];

/** A project action's own command, after T3's `script.<id>.run`, scoped to its project: `script.<projectId>.<actionId>.run`. */
export type ScriptCommand = `script.${string}.${string}.run`;
export type KeybindingCommand = typeof keybindingCommands[number]["command"] | ScriptCommand;
export type CommandInfo = { command: KeybindingCommand; label: string; group: string; keys: readonly string[]; when?: string };
const commandList: readonly CommandInfo[] = keybindingCommands;
export type KeybindingEntry = { command: KeybindingCommand; key: string; when?: string };
export type KeybindingRow = KeybindingEntry & { id: string; label: string; group: string; source: "Default" | "Custom"; defaultKeys: readonly string[]; defaultWhen?: string };
export const keybindingGroups = ["General", "Chats", "Panes", "Browser", "Pull requests", "View", "Project actions"] as const;

const scriptCommandPattern = /^script\.([A-Za-z0-9_-]{1,200})\.([A-Za-z0-9_-]{1,100})\.run$/;
export const scriptCommand = (projectId: string, actionId: string): ScriptCommand => `script.${projectId}.${actionId}.run`;
export function parseScriptCommand(command: string) { const match = scriptCommandPattern.exec(command); return match ? { projectId: match[1], actionId: match[2] } : undefined; }
export const isScriptCommand = (value: unknown): value is ScriptCommand => typeof value === "string" && scriptCommandPattern.test(value);

/** Conditions a "when" clause can test. */
export const whenVariables = {
	chatMode: "Chat is selected at the top left",
	codeMode: "Code is selected at the top left",
	chatOpen: "A chat is open",
	paneOpen: "The right pane is open",
	settingsOpen: "Settings are open",
	textFocused: "A text field or the composer has focus",
	terminalFocused: "A terminal has focus",
	browserFocused: "A browser page or its address bar has focus",
} as const;
export type WhenContext = Partial<Record<keyof typeof whenVariables, boolean>>;

const commandInfo = (command: string, extra: readonly CommandInfo[] = []) => commandList.find(value => value.command === command) ?? extra.find(value => value.command === command);
export const commandLabel = (command: string, extra?: readonly CommandInfo[]) => commandInfo(command, extra)?.label ?? command;
export const isKeybindingCommand = (value: unknown): value is KeybindingCommand => typeof value === "string" && (Boolean(commandInfo(value)) || isScriptCommand(value));

const modifiers = ["mod", "ctrl", "meta", "alt", "shift"] as const;
const named = new Set(["enter", "escape", "tab", "space", "backspace", "delete", "arrowup", "arrowdown", "arrowleft", "arrowright", "home", "end", "pageup", "pagedown", ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`)]);

/** "mod+shift+s" as its modifiers and key; a trailing "+" is the plus key. Undefined when malformed. */
export function parseKey(value: string) {
	const text = value.trim().toLowerCase();
	if (!text) return;
	const parts = text.endsWith("++") ? [...text.slice(0, -2).split("+").filter(Boolean), "+"] : text === "+" ? ["+"] : text.split("+");
	const key = parts.pop();
	if (!key || parts.some(part => !(modifiers as readonly string[]).includes(part)) || new Set(parts).size !== parts.length) return;
	if (key.length !== 1 && !named.has(key)) return;
	if ((modifiers as readonly string[]).includes(key)) return;
	return { mod: parts.includes("mod"), ctrl: parts.includes("ctrl"), meta: parts.includes("meta"), alt: parts.includes("alt"), shift: parts.includes("shift"), key };
}

/** What Shift produces on a US layout, mapped back to the key itself. */
const unshifted: Record<string, string> = { "{": "[", "}": "]", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", "_": "-", "+": "=", ":": ";", "\"": "'", "<": ",", ">": ".", "?": "/", "|": "\\", "~": "`" };

export function matchesKey(value: string, event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, mac: boolean) {
	const parsed = parseKey(value);
	if (!parsed) return false;
	const wantCtrl = parsed.ctrl || (parsed.mod && !mac), wantMeta = parsed.meta || (parsed.mod && mac);
	if (event.ctrlKey !== wantCtrl || event.metaKey !== wantMeta || event.altKey !== parsed.alt) return false;
	const key = event.key.toLowerCase();
	// Shift changes the character for symbols ("+" is Shift+"=", "{" is Shift+"["), so symbol keys match either form.
	if (parsed.key.length === 1 && !/[a-z0-9]/.test(parsed.key)) return key === parsed.key ? !parsed.shift || event.shiftKey : event.shiftKey && parsed.shift && unshifted[key] === parsed.key;
	return event.shiftKey === parsed.shift && (key === parsed.key || (parsed.key === "space" && key === " "));
}

/** A pressed key as a binding string, or undefined while only modifiers are held. */
export function keyFromEvent(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, mac: boolean) {
	const typed = event.key === " " ? "space" : event.key.toLowerCase();
	// Record Shift+"[" as shift+[ rather than "{"; "+" stays itself.
	const key = event.shiftKey && typed !== "+" && unshifted[typed] ? unshifted[typed] : typed;
	if (["control", "meta", "alt", "shift", "os", "dead", "unidentified"].includes(key)) return;
	const parts: string[] = [];
	if (mac ? event.metaKey : event.ctrlKey) parts.push("mod");
	if (mac && event.ctrlKey) parts.push("ctrl");
	if (!mac && event.metaKey) parts.push("meta");
	if (event.altKey) parts.push("alt");
	if (event.shiftKey && (key.length > 1 || /[a-z0-9]/.test(key) || key !== typed)) parts.push("shift");
	const value = [...parts, key].join("+");
	return parseKey(value) ? value : undefined;
}

/** The keys to show for a binding: ["Ctrl", "⇧", "S"] or ["⌘", "⇧", "S"]. */
export function keyParts(value: string, mac: boolean) {
	const parsed = parseKey(value);
	if (!parsed) return [];
	const parts: string[] = [];
	if (parsed.mod) parts.push(mac ? "⌘" : "Ctrl");
	if (parsed.ctrl) parts.push(mac ? "⌃" : "Ctrl");
	if (parsed.meta) parts.push(mac ? "⌘" : "Win");
	if (parsed.alt) parts.push(mac ? "⌥" : "Alt");
	if (parsed.shift) parts.push(mac ? "⇧" : "Shift");
	const names: Record<string, string> = { arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", escape: "Esc", space: "Space", enter: "Enter", backspace: "Backspace", delete: "Delete", tab: "Tab", pageup: "Page Up", pagedown: "Page Down", home: "Home", end: "End" };
	parts.push(names[parsed.key] ?? parsed.key.toUpperCase());
	return parts;
}

export const keyLabel = (value: string, mac: boolean) => keyParts(value, mac).join(mac ? "" : "+");

export type WhenNode = { type: "var"; name: string } | { type: "not"; node: WhenNode } | { type: "and" | "or"; left: WhenNode; right: WhenNode };

/** The visual builder's shape (T3): groups of conditions joined by all-of or any-of, each of which can be negated. */
export type WhenCondition = { kind: "condition"; name: string; negated: boolean };
export type WhenGroup = { kind: "group"; operator: "and" | "or"; negated: boolean; items: (WhenCondition | WhenGroup)[] };

export function whenGroup(value?: string): WhenGroup {
	const node = parseWhen(value ?? "");
	const toItem = (current: WhenNode, negated = false): WhenCondition | WhenGroup => {
		if (current.type === "var") return { kind: "condition", name: current.name, negated };
		if (current.type === "not") return toItem(current.node, !negated);
		const group = toGroup(current); return { ...group, negated: group.negated !== negated };
	};
	const flatten = (current: WhenNode, operator: "and" | "or"): WhenNode[] => current.type === operator ? [...flatten(current.left, operator), ...flatten(current.right, operator)] : [current];
	const toGroup = (current: WhenNode): WhenGroup => current.type === "and" || current.type === "or"
		? { kind: "group", operator: current.type, negated: false, items: flatten(current, current.type).map(child => toItem(child)) }
		: { kind: "group", operator: "and", negated: false, items: [toItem(current)] };
	return node ? toGroup(node) : { kind: "group", operator: "and", negated: false, items: [] };
}

/** Back to an expression: "codeMode && !textFocused", with brackets only where a group needs them. */
export function formatWhen(group: WhenGroup, nested = false): string {
	const parts = group.items.map(item => item.kind === "condition" ? `${item.negated ? "!" : ""}${item.name}` : item.items.length ? formatWhen(item, true) : "").filter(Boolean);
	if (!parts.length) return "";
	const joined = parts.join(group.operator === "and" ? " && " : " || ");
	if (group.negated) return `!(${joined})`;
	return nested && parts.length > 1 ? `(${joined})` : joined;
}

/** Parses "codeMode && !textFocused || paneOpen" (with parentheses). Throws a readable error. */
export function parseWhen(value: string): WhenNode | undefined {
	const tokens = value.match(/\s*(&&|\|\||!|\(|\)|[A-Za-z_][\w.]*|\S)/g)?.map(token => token.trim()) ?? [];
	if (!tokens.length) return;
	let index = 0;
	const primary = (): WhenNode => {
		const token = tokens[index++];
		if (token === "!") return { type: "not", node: primary() };
		if (token === "(") { const node = or(); if (tokens[index++] !== ")") throw new Error("Close every bracket."); return node; }
		if (!token || !/^[A-Za-z_][\w.]*$/.test(token)) throw new Error(token ? `Unexpected "${token}".` : "The condition ends too early.");
		if (!(token in whenVariables)) throw new Error(`Unknown condition "${token}".`);
		return { type: "var", name: token };
	};
	const and = (): WhenNode => { let node = primary(); while (tokens[index] === "&&") { index++; node = { type: "and", left: node, right: primary() }; } return node; };
	const or = (): WhenNode => { let node = and(); while (tokens[index] === "||") { index++; node = { type: "or", left: node, right: and() }; } return node; };
	const node = or();
	if (index < tokens.length) throw new Error(`Unexpected "${tokens[index]}".`);
	return node;
}

export function whenError(value?: string) {
	try { parseWhen(value ?? ""); return undefined; } catch (error) { return error instanceof Error ? error.message : "Invalid condition."; }
}

export function evaluateWhen(value: string | undefined, context: WhenContext) {
	let node: WhenNode | undefined;
	try { node = parseWhen(value ?? ""); } catch { return false; }
	const run = (current: WhenNode): boolean => current.type === "var" ? Boolean(context[current.name as keyof WhenContext]) : current.type === "not" ? !run(current.node) : current.type === "and" ? run(current.left) && run(current.right) : run(current.left) || run(current.right);
	return node ? run(node) : true;
}

/** Checks keybindings.json: a list of { command, key, when? }. Throws on anything else. */
export function validateKeybindings(value: unknown): KeybindingEntry[] {
	if (!Array.isArray(value)) throw new Error("keybindings.json must be a list of bindings.");
	if (value.length > 500) throw new Error("keybindings.json has too many bindings.");
	return value.map((raw, index) => {
		const entry = raw as Record<string, unknown>;
		const where = `Binding ${index + 1}`;
		if (!entry || typeof entry !== "object") throw new Error(`${where} must be an object.`);
		if (!isKeybindingCommand(entry.command)) throw new Error(`${where} names an unknown command.`);
		if (typeof entry.key !== "string" || (entry.key.trim() && !parseKey(entry.key))) throw new Error(`${where} has an invalid key.`);
		if (entry.when !== undefined && (typeof entry.when !== "string" || entry.when.length > 500)) throw new Error(`${where} has an invalid when clause.`);
		const when = typeof entry.when === "string" && entry.when.trim() ? entry.when.trim() : undefined;
		const problem = whenError(when); if (problem) throw new Error(`${where}: ${problem}`);
		return { command: entry.command, key: entry.key.trim().toLowerCase(), ...(when ? { when } : {}) };
	});
}

/**
 * Every binding in effect, defaults first replaced by the person's own; unassigned commands keep one empty row.
 * `extra` adds commands that exist only now, such as project actions; bindings for actions that are gone are left out.
 */
export function keybindingRows(custom: KeybindingEntry[], extra: readonly CommandInfo[] = []): KeybindingRow[] {
	return [...commandList, ...extra].flatMap((info): KeybindingRow[] => {
		const mine = custom.filter(entry => entry.command === info.command);
		const base = { label: info.label, group: info.group, defaultKeys: info.keys, defaultWhen: info.when };
		if (!mine.length) return (info.keys.length ? info.keys : [""]).map((key, index) => ({ ...base, id: `${info.command}:default:${index}`, command: info.command, key, ...(info.when ? { when: info.when } : {}), source: "Default" as const }));
		return mine.map((entry, index) => ({ ...base, ...entry, id: `${info.command}:custom:${index}`, source: "Custom" as const }));
	});
}

/** Other commands bound to the same key. */
export function keybindingConflicts(rows: KeybindingRow[], row: Pick<KeybindingRow, "id" | "command" | "key" | "when">) {
	const key = parseKey(row.key);
	if (!key) return [];
	const same = (value: string) => { const other = parseKey(value); return Boolean(other) && JSON.stringify(other) === JSON.stringify(key); };
	// Actions of different projects never run together: only the open chat's project's actions are active.
	const project = parseScriptCommand(row.command)?.projectId;
	const together = (command: string) => { const other = parseScriptCommand(command)?.projectId; return !project || !other || project === other; };
	return [...new Set(rows.filter(other => other.id !== row.id && other.command !== row.command && together(other.command) && same(other.key)).map(other => other.label))];
}

/** The person's bindings after editing one command's rows. */
export function replaceCommandBindings(custom: KeybindingEntry[], command: KeybindingCommand, entries: KeybindingEntry[]) {
	return [...custom.filter(entry => entry.command !== command), ...entries];
}

/** Commands that act on the page itself, so the page keeps keyboard focus after them. */
const pageCommands: readonly string[] = ["browser.reload", "browser.zoomIn", "browser.zoomOut", "browser.zoomReset"];
/** Keys a focused web page hands to the app; the app takes keyboard focus for all but the page's own commands. Undo stays with the page, where it edits text. */
export function browserShortcuts(custom: KeybindingEntry[]) {
	const shortcuts = new Map<string, boolean>();
	// A bare letter (the guide's J and K) is typing on a page, never the app's.
	const typed = (key: string) => { const parsed = parseKey(key); return Boolean(parsed && !parsed.mod && !parsed.ctrl && !parsed.meta && !parsed.alt && parsed.key.length === 1); };
	for (const row of keybindingRows(custom)) if (row.key && row.command !== "thread.undo" && !typed(row.key)) shortcuts.set(row.key, (shortcuts.get(row.key) ?? false) || pageCommands.includes(row.command));
	for (const entry of custom) if (entry.key && isScriptCommand(entry.command) && !typed(entry.key)) shortcuts.set(entry.key, shortcuts.get(entry.key) ?? false);
	return [...shortcuts].map(([key, keepPageFocus]) => ({ key, keepPageFocus }));
}
