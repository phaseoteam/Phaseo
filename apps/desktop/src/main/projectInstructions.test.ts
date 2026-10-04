import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ProjectInstructions } from "./projectInstructions";

describe("project instruction discovery", () => {
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
