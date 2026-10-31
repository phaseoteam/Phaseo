import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KeybindingsFile } from "../main/keybindingsFile";
import { browserShortcuts, isScriptCommand, parseScriptCommand, scriptCommand, evaluateWhen, formatWhen, whenGroup, keybindingConflicts, keybindingRows, keyFromEvent, keyLabel, matchesKey, parseKey, replaceCommandBindings, validateKeybindings, whenError } from "./keybindings";

const press = (key: string, modifiers: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers });

describe("keyboard shortcuts", () => {
	it("parses, matches and labels keys on each platform", () => {
		expect(parseKey("mod+shift+s")).toMatchObject({ mod: true, shift: true, key: "s" });
		expect(parseKey("mod++")?.key).toBe("+");
		for (const bad of ["", "mod+", "shift", "mod+mod+k", "hyper+k", "mod+notakey"]) expect(parseKey(bad)).toBeUndefined();
		expect(matchesKey("mod+k", press("k", { ctrlKey: true }), false)).toBe(true);
		expect(matchesKey("mod+k", press("k", { metaKey: true }), true)).toBe(true);
		expect(matchesKey("mod+k", press("k", { ctrlKey: true, shiftKey: true }), false)).toBe(false);
		expect(matchesKey("mod+shift+s", press("S", { ctrlKey: true, shiftKey: true }), false)).toBe(true);
		// Symbols ignore the Shift that produces them.
		expect(matchesKey("mod++", press("+", { ctrlKey: true, shiftKey: true }), false)).toBe(true);
		expect(keyLabel("mod+shift+s", false)).toBe("Ctrl+Shift+S");
		expect(keyLabel("mod+shift+s", true)).toBe("⌘⇧S");
	});

	it("records pressed keys as binding strings", () => {
		expect(keyFromEvent(press("K", { ctrlKey: true, shiftKey: true }), false)).toBe("mod+shift+k");
		expect(keyFromEvent(press("k", { metaKey: true, altKey: true }), true)).toBe("mod+alt+k");
		expect(keyFromEvent(press("Control", { ctrlKey: true }), false)).toBeUndefined();
		expect(keyFromEvent(press("ArrowUp", { altKey: true }), false)).toBe("alt+arrowup");
		// Shift+[ types "{", but the binding is shift+[.
		expect(keyFromEvent(press("{", { ctrlKey: true, shiftKey: true }), false)).toBe("mod+shift+[");
		expect(matchesKey("mod+shift+[", press("{", { ctrlKey: true, shiftKey: true }), false)).toBe(true);
		expect(matchesKey("mod+shift+[", press("[", { ctrlKey: true }), false)).toBe(false);
		expect(matchesKey("mod+1", press("1", { ctrlKey: true }), false)).toBe(true);
		expect(matchesKey("mod+alt+1", press("1", { ctrlKey: true }), false)).toBe(false);
	});

	it("evaluates when clauses and explains bad ones", () => {
		expect(evaluateWhen("codeMode && chatOpen", { codeMode: true, chatOpen: true })).toBe(true);
		expect(evaluateWhen("codeMode && !textFocused", { codeMode: true, textFocused: true })).toBe(false);
		expect(evaluateWhen("(chatMode || codeMode) && paneOpen", { chatMode: true, paneOpen: true })).toBe(true);
		expect(evaluateWhen(undefined, {})).toBe(true);
		expect(whenError("codeMode &&")).toMatch("ends too early");
		expect(whenError("unknownThing")).toMatch("Unknown condition");
		expect(whenError("(codeMode")).toMatch("bracket");
		expect(evaluateWhen("unknownThing", {})).toBe(false);
	});

	it("turns when clauses into T3's builder groups and back", () => {
		for (const value of ["codeMode && chatOpen", "!textFocused", "(chatMode || codeMode) && paneOpen", "codeMode && !(textFocused || terminalFocused)", "settingsOpen || chatOpen && !paneOpen"]) {
			const round = formatWhen(whenGroup(value));
			for (const context of [{}, { codeMode: true, chatOpen: true }, { chatMode: true, paneOpen: true }, { codeMode: true, terminalFocused: true }, { settingsOpen: true }, { chatOpen: true, paneOpen: true }]) expect(evaluateWhen(round, context)).toBe(evaluateWhen(value, context));
		}
		expect(whenGroup("")).toEqual({ kind: "group", operator: "and", negated: false, items: [] });
		expect(whenGroup("codeMode && !textFocused").items).toEqual([{ kind: "condition", name: "codeMode", negated: false }, { kind: "condition", name: "textFocused", negated: true }]);
		expect(formatWhen({ kind: "group", operator: "or", negated: false, items: [{ kind: "condition", name: "chatMode", negated: false }, { kind: "group", operator: "and", negated: true, items: [{ kind: "condition", name: "paneOpen", negated: false }, { kind: "condition", name: "textFocused", negated: false }] }] })).toBe("chatMode || !(paneOpen && textFocused)");
	});

	it("replaces a command's defaults with the person's bindings and finds conflicts", () => {
		const custom = validateKeybindings([{ command: "chat.new", key: "Mod+Shift+N" }, { command: "sidebar.toggle", key: "" }]);
		const rows = keybindingRows(custom);
		expect(rows.filter(row => row.command === "chat.new").map(row => [row.key, row.source])).toEqual([["mod+shift+n", "Custom"]]);
		expect(rows.find(row => row.command === "sidebar.toggle")?.key).toBe("");
		expect(rows.find(row => row.command === "commandPalette.toggle")?.source).toBe("Default");
		expect(keybindingConflicts(rows, { id: "x", command: "chat.new", key: "mod+k" })).toEqual(["Search chats and commands"]);
		expect(replaceCommandBindings(custom, "chat.new", [])).toEqual([{ command: "sidebar.toggle", key: "" }]);
		expect(() => validateKeybindings([{ command: "nope", key: "mod+k" }])).toThrow("unknown command");
		expect(() => validateKeybindings([{ command: "chat.new", key: "mod+" }])).toThrow("invalid key");
		expect(() => validateKeybindings([{ command: "chat.new", key: "mod+n", when: "nope" }])).toThrow("Unknown condition");
		expect(() => validateKeybindings({})).toThrow("list");
	});

	it("keeps keybindings.json and falls back to defaults when a hand edit breaks it", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-keybindings-"));
		try {
			const file = new KeybindingsFile(path.join(directory, "settings", "keybindings.json"));
			expect(file.read().entries).toEqual([]);
			expect(file.save([{ command: "chat.new", key: "mod+shift+n", when: "codeMode" }]).entries).toEqual([{ command: "chat.new", key: "mod+shift+n", when: "codeMode" }]);
			expect(() => file.save([{ command: "chat.new", key: 5 }])).toThrow();
			writeFileSync(file.filename, "[{ not json");
			const broken = file.read();
			expect(broken.entries).toEqual([]);
			expect(broken.error).toBeTruthy();
			expect(file.ensure()).toBe(file.filename);
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
});

describe("project action shortcuts", () => {
	const actions = [
		{ command: scriptCommand("project-a", "dev"), label: "Run Dev in A", group: "Project actions", keys: [] },
		{ command: scriptCommand("project-a", "test"), label: "Run Test in A", group: "Project actions", keys: [] },
		{ command: scriptCommand("project-b", "dev"), label: "Run Dev in B", group: "Project actions", keys: [] },
	];
	it("names each action as a command of its project and keeps its binding in keybindings.json", () => {
		expect(scriptCommand("p1", "dev-server")).toBe("script.p1.dev-server.run");
		expect(parseScriptCommand("script.p1.dev-server.run")).toEqual({ projectId: "p1", actionId: "dev-server" });
		expect(parseScriptCommand("script.p1.run")).toBeUndefined();
		expect(isScriptCommand("script.a b.c.run")).toBe(false);
		expect(validateKeybindings([{ command: "script.p1.dev.run", key: "Mod+Shift+R" }])).toEqual([{ command: "script.p1.dev.run", key: "mod+shift+r" }]);
		expect(() => validateKeybindings([{ command: "script.p1.run", key: "mod+r" }])).toThrow("unknown command");
	});
	it("lists actions with or without a shortcut, leaves out deleted ones and flags real conflicts", () => {
		const custom = validateKeybindings([{ command: scriptCommand("project-a", "dev"), key: "mod+shift+r" }, { command: scriptCommand("project-b", "dev"), key: "mod+shift+r" }, { command: scriptCommand("gone", "dev"), key: "mod+shift+g" }]);
		const rows = keybindingRows(custom, actions);
		expect(rows.filter(row => row.group === "Project actions").map(row => [row.label, row.key, row.source])).toEqual([["Run Dev in A", "mod+shift+r", "Custom"], ["Run Test in A", "", "Default"], ["Run Dev in B", "mod+shift+r", "Custom"]]);
		expect(rows.some(row => row.command === scriptCommand("gone", "dev"))).toBe(false);
		// Another project's action never runs at the same time, so the same keys there are not a conflict.
		expect(keybindingConflicts(rows, { id: "x", command: scriptCommand("project-a", "dev"), key: "mod+shift+r" })).toEqual([]);
		expect(keybindingConflicts(rows, { id: "x", command: scriptCommand("project-a", "test"), key: "mod+shift+r" })).toEqual(["Run Dev in A"]);
		expect(keybindingConflicts(rows, { id: "x", command: scriptCommand("project-a", "test"), key: "mod+k" })).toEqual(["Search chats and commands"]);
		expect(browserShortcuts(custom)).toContainEqual({ key: "mod+shift+r", keepPageFocus: false });
	});
});

describe("browser shortcuts", () => {
	it("hands app shortcuts from a focused page to the app, except undo", () => {
		const shortcuts = browserShortcuts([]), keys = shortcuts.map(item => item.key);
		expect(keys).toEqual(expect.arrayContaining(["mod+r", "mod+l", "mod+=", "mod+-", "mod+0", "mod+k", "mod+w"]));
		expect(keys).not.toContain("mod+z");
		expect(shortcuts.filter(item => item.keepPageFocus).map(item => item.key).sort()).toEqual(["mod++", "mod+-", "mod+0", "mod+=", "mod+r"].sort());
		expect(browserShortcuts([{ command: "browser.reload", key: "f5" }])).toContainEqual({ key: "f5", keepPageFocus: true });
	});
	it("lets page zoom win over app zoom only while the browser has focus", () => {
		const rows = keybindingRows([]).filter(row => row.key === "mod+=");
		expect(rows.map(row => row.command)).toEqual(["browser.zoomIn", "view.zoomIn"]);
		expect(evaluateWhen(rows[0].when, { browserFocused: true })).toBe(true);
		expect(evaluateWhen(rows[0].when, {})).toBe(false);
	});
});

describe("pull request shortcuts", () => {
	it("leaves keys that cannot run on a page to the page", () => {
		const keys = browserShortcuts([]).map(item => item.key);
		expect(keys).not.toContain("mod+f");
		expect(keys).not.toContain("escape");
		expect(keys).toEqual(expect.arrayContaining(["mod+shift+k", "mod+shift+c"]));
		expect(keybindingRows([]).filter(row => row.group === "Pull requests").map(row => [row.command, row.key])).toEqual(expect.arrayContaining([["pullRequest.copyNumber", "mod+shift+k"], ["pullRequest.copyLink", "mod+shift+c"], ["pullRequest.back", "escape"], ["pullRequests.focusSearch", "mod+f"]]));
		// Mod+Shift+C copies the pull request on screen first, and otherwise the open chat's ID.
		expect(keybindingRows([]).filter(row => row.key === "mod+shift+c").map(row => row.command)).toEqual(["pullRequest.copyLink", "thread.copyReference"]);
	});
});
