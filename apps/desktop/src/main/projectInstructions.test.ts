import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ProjectInstructions } from "./projectInstructions";

describe("project instruction discovery", () => {
	it("orders global guidance before project scopes and revisions include global changes", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-global-instructions-")), global = path.join(root, "instructions"), project = path.join(root, "project"); mkdirSync(global); mkdirSync(path.join(project, "global"), { recursive: true }); writeFileSync(path.join(global, "AGENTS.md"), "Global guidance"); writeFileSync(path.join(project, "AGENTS.md"), "Project guidance"); writeFileSync(path.join(project, "global", "AGENTS.md"), "Folder guidance");
		try { const instructions = new ProjectInstructions(project, undefined, global); await instructions.load("global", true); expect(instructions.list().map(value => value.scope)).toEqual(["*", ".", "global"]); expect(instructions.list().map(value => value.text)).toEqual(["Global guidance", "Project guidance", "Folder guidance"]); const before = instructions.revision(); writeFileSync(path.join(global, "AGENTS.md"), "Changed global guidance"); expect(await instructions.refresh()).toBe(true); expect(instructions.revision()).not.toBe(before); rmSync(path.join(global, "AGENTS.md")); await instructions.refresh(); expect(instructions.list().map(value => value.scope)).toEqual([".", "global"]); }
		finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("loads global guidance for a personal chat without reading project files", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-personal-instructions-")); writeFileSync(path.join(root, "AGENTS.md"), "Global guidance");
		try { const instructions = new ProjectInstructions(path.join(root, "nonexistent-personal-directory"), undefined, root); await instructions.loadGlobal(); expect(instructions.list()).toEqual([{ path: "global/AGENTS.md", scope: "*", text: "Global guidance" }]); }
		finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("does not partially update guidance when global content becomes invalid", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-global-invalid-")), global = path.join(root, "instructions"); mkdirSync(global); writeFileSync(path.join(global, "AGENTS.md"), "Valid global"); writeFileSync(path.join(root, "AGENTS.md"), "Valid project");
		try { const instructions = new ProjectInstructions(root, undefined, global); await instructions.load(".", true); const before = instructions.revision(); writeFileSync(path.join(global, "AGENTS.md"), Buffer.from([0xff])); writeFileSync(path.join(root, "AGENTS.md"), "Changed project"); await expect(instructions.refresh()).rejects.toThrow("UTF-8"); expect(instructions.revision()).toBe(before); }
		finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("loads ancestor scopes in order and refreshes changed or removed guidance", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-instructions-")); mkdirSync(path.join(root, "src", "nested"), { recursive: true });
		writeFileSync(path.join(root, "AGENTS.md"), "Root guidance"); writeFileSync(path.join(root, "src", "AGENTS.md"), "Scoped guidance");
		try {
			const changed = vi.fn(), instructions = new ProjectInstructions(root, changed);
			await instructions.load("src/nested/new.txt"); expect(instructions.list().map(file => file.path)).toEqual(["AGENTS.md", "src/AGENTS.md"]);
			const revision = instructions.revision(); expect(await instructions.refresh()).toBe(false);
			writeFileSync(path.join(root, "AGENTS.md"), "Changed root"); rmSync(path.join(root, "src", "AGENTS.md"));
			expect(await instructions.refresh()).toBe(true); expect(instructions.revision()).not.toBe(revision);
			expect(instructions.prompt()).toContain("Changed root"); expect(instructions.prompt()).not.toContain("Scoped guidance"); expect(changed).toHaveBeenCalledTimes(2);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
	it.each([Buffer.from([0xff]), Buffer.from("binary\0text"), Buffer.from("😀".repeat(4096) + "x")])("rejects invalid UTF-8, binary or oversized guidance without committing partial state", async content => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-instructions-")); writeFileSync(path.join(root, "AGENTS.md"), content);
		try { const instructions = new ProjectInstructions(root); await expect(instructions.load(".", true)).rejects.toThrow(/UTF-8/); expect(instructions.list()).toEqual([]); }
		finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("accepts the byte boundary and treats an AGENTS directory as an error", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-instructions-"));
		try {
			const instructions = new ProjectInstructions(root); writeFileSync(path.join(root, "AGENTS.md"), "😀".repeat(4096));
			await instructions.load(".", true); expect(Buffer.byteLength(instructions.list()[0].text)).toBe(16 * 1024);
			rmSync(path.join(root, "AGENTS.md")); mkdirSync(path.join(root, "AGENTS.md"));
			await expect(instructions.refresh()).rejects.toThrow("UTF-8 text file");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("uses canonical in-project scopes and rejects an external directory link", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-instructions-")), root = path.join(directory, "project"), outside = path.join(directory, "outside");
		mkdirSync(path.join(root, "src"), { recursive: true }); mkdirSync(outside); writeFileSync(path.join(root, "src", "AGENTS.md"), "Scoped"); writeFileSync(path.join(root, "src", "file.txt"), "Owned"); writeFileSync(path.join(outside, "AGENTS.md"), "Outside content"); writeFileSync(path.join(outside, "file.txt"), "Outside");
		symlinkSync(path.join(root, "src"), path.join(root, "alias"), process.platform === "win32" ? "junction" : "dir"); symlinkSync(outside, path.join(root, "external"), process.platform === "win32" ? "junction" : "dir");
		try {
			const instructions = new ProjectInstructions(root); await instructions.load("alias/file.txt"); expect(instructions.list().map(file => file.path)).toEqual(["src/AGENTS.md"]);
			await expect(instructions.load("external/file.txt")).rejects.toThrow("outside"); expect(instructions.prompt()).not.toContain("Outside content");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("bounds combined guidance, file count and scope depth without replacing confirmed state", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-instructions-"));
		try {
			const instructions = new ProjectInstructions(root);
			for (let index = 0; index < 33; index++) { mkdirSync(path.join(root, String(index))); writeFileSync(path.join(root, String(index), "AGENTS.md"), "Owned"); if (index < 32) await instructions.load(String(index), true); }
			const revision = instructions.revision(); await expect(instructions.load("32", true)).rejects.toThrow("32 files"); expect(instructions.revision()).toBe(revision);
			const combined = new ProjectInstructions(root); for (let index = 0; index < 5; index++) { writeFileSync(path.join(root, String(index), "AGENTS.md"), "a".repeat(15 * 1024)); if (index < 4) await combined.load(String(index), true); }
			await expect(combined.load("4", true)).rejects.toThrow("64 KiB");
			const deep = Array.from({ length: 32 }, () => "d").join(path.sep); mkdirSync(path.join(root, deep), { recursive: true }); await expect(new ProjectInstructions(root).load(deep, true)).rejects.toThrow("32 directories");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
