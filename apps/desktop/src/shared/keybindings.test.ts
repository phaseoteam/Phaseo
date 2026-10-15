import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KeybindingsFile } from "../main/keybindingsFile";
import { evaluateWhen, keybindingConflicts, keybindingRows, keyFromEvent, keyLabel, matchesKey, parseKey, replaceCommandBindings, validateKeybindings, whenError } from "./keybindings";

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
