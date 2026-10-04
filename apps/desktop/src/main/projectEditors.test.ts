import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { editorDefinitions, validateProjectOpen } from "../shared/editors";
import { editorArguments, editorCandidates, findEditor, launchEditor, openProjectTarget } from "./projectEditors";

describe("external editors", () => {
	it("maps structured positions to editor launch styles and resolves in-project absolute paths", async () => {
		const project = mkdtempSync(path.join(tmpdir(), "phaseo-editor-"));
		const target = path.join(project, "main.ts"); writeFileSync(target, "owned source");
		const ports = { find: vi.fn(async () => "/owned/editor"), launch: vi.fn(async () => undefined), reveal: vi.fn(), openFolder: vi.fn(async () => "") };
		try {
			await openProjectTarget(project, { editor: "vscode", filename: target, line: 12, column: 3 }, ports);
			expect(ports.launch).toHaveBeenLastCalledWith("/owned/editor", ["--goto", `${target}:12:3`], project);
			await openProjectTarget(project, { editor: "zed", filename: "main.ts", line: 4 }, ports);
			expect(ports.launch).toHaveBeenLastCalledWith("/owned/editor", [`${target}:4`], project);
			await openProjectTarget(project, { editor: "webstorm", filename: "main.ts", line: 8, column: 2 }, ports);
			expect(ports.launch).toHaveBeenLastCalledWith("/owned/editor", ["--line", "8", "--column", "2", target], project);
		} finally { rmSync(project, { recursive: true, force: true }); }
	});
	it("discovers native installations without treating current-directory shims as commands", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-editor-"));
		try {
			const bin = path.join(directory, "bin"); mkdirSync(bin);
			writeFileSync(path.join(bin, "code.cmd"), "must not execute");
			const lookup = { platform: "win32" as const, searchPath: `.;${bin}`, home: directory };
			const editor = editorDefinitions[0];
			expect(editorCandidates(editor, lookup).every(candidate => path.win32.isAbsolute(candidate))).toBe(true);
			if (process.platform === "win32") {
				expect(await findEditor(editor, lookup)).toBeUndefined();
				writeFileSync(path.join(directory, "Code.exe"), "owned executable stand-in");
				expect(await findEditor(editor, lookup)).toBe(path.join(directory, "Code.exe"));
			}
			expect(editorCandidates(editor, { platform: "darwin", searchPath: ".:/usr/bin", home: "/Users/fixture" })).toContain("/Applications/Visual Studio Code.app/Contents/MacOS/Electron");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("opens registered project targets as literal editor arguments and reveals files without executing them", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-editor-"));
		const project = path.join(directory, "project"); mkdirSync(project);
		const filename = "notes & $(literal) # 世界.txt"; writeFileSync(path.join(project, filename), "owned text");
		const ports = { find: vi.fn(async () => "/owned/editor"), launch: vi.fn(async () => undefined), reveal: vi.fn(), openFolder: vi.fn(async () => "") };
		try {
			await openProjectTarget(project, { editor: "cursor", filename }, ports);
			expect(ports.launch).toHaveBeenCalledWith("/owned/editor", ["--classic", path.join(project, filename)], project);
			await openProjectTarget(project, { editor: "vscode" }, ports);
			expect(ports.launch).toHaveBeenLastCalledWith("/owned/editor", [project], project);
			await openProjectTarget(project, { editor: "file-manager", filename }, ports);
			expect(ports.reveal).toHaveBeenCalledWith(path.join(project, filename));
			await openProjectTarget(project, { editor: "file-manager" }, ports);
			expect(ports.openFolder).toHaveBeenCalledWith(project);
			expect(ports.launch).toHaveBeenCalledTimes(2);
			expect(editorArguments(editorDefinitions.find(editor => editor.id === "kiro")!, project)).toEqual(["ide", project]);
			expect(editorArguments(editorDefinitions.find(editor => editor.id === "kiro")!, project, "Kiro.exe")).toEqual([project]);
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("rejects outside paths, links, directories masquerading as files and invalid editors before launch", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-editor-"));
		const project = path.join(directory, "project"), outside = path.join(directory, "outside"); mkdirSync(project); mkdirSync(outside);
		writeFileSync(path.join(outside, "private.txt"), "outside");
		symlinkSync(outside, path.join(project, "link"), process.platform === "win32" ? "junction" : "dir");
		const ports = { find: vi.fn(async () => "/owned/editor"), launch: vi.fn(async () => undefined), reveal: vi.fn(), openFolder: vi.fn(async () => "") };
		try {
			for (const filename of ["../outside/private.txt", "link/private.txt", outside]) await expect(openProjectTarget(project, { editor: "vscode", filename }, ports)).rejects.toThrow();
			await expect(openProjectTarget(project, { editor: "vscode", filename: "link" }, ports)).rejects.toThrow();
			await expect(openProjectTarget(project, { editor: "vscode", filename: "." }, ports)).rejects.toThrow("existing");
			expect(() => validateProjectOpen({ editor: "powershell.exe" })).toThrow("supported editor");
			expect(() => validateProjectOpen({ editor: "vscode", filename: "\0" })).toThrow("Invalid file");
			expect(ports.find).not.toHaveBeenCalled(); expect(ports.launch).not.toHaveBeenCalled(); expect(ports.reveal).not.toHaveBeenCalled();
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("reports unavailable installations and operating-system failures", async () => {
		const project = mkdtempSync(path.join(tmpdir(), "phaseo-editor-"));
		try {
			const ports = { find: vi.fn(async () => undefined), launch: vi.fn(async () => undefined), reveal: vi.fn(), openFolder: vi.fn(async () => "Owned folder failure") };
			await expect(openProjectTarget(project, { editor: "vscode" }, ports)).rejects.toThrow("unavailable");
			await expect(openProjectTarget(project, { editor: "file-manager" }, ports)).rejects.toThrow("Owned folder failure");
			await expect(launchEditor(path.join(project, "missing-editor.exe"), [], project)).rejects.toThrow();
			expect(ports.launch).not.toHaveBeenCalled();
		} finally { rmSync(project, { recursive: true, force: true }); }
	});
	it("launches a real owned process with literal arguments and clears inherited Electron/Node execution flags", async () => {
		const project = mkdtempSync(path.join(tmpdir(), "phaseo-editor-"));
		const output = path.join(project, "result.json"), literal = "世界 & $(do-not-run) # text";
		const originalNode = process.env.NODE_OPTIONS, originalElectron = process.env.ELECTRON_RUN_AS_NODE;
		try {
			process.env.NODE_OPTIONS = "--invalid-owned-option"; process.env.ELECTRON_RUN_AS_NODE = "1";
			await launchEditor(process.execPath, ["-e", "require('node:fs').writeFileSync(process.argv[1], JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),pid:process.pid,node:process.env.NODE_OPTIONS,electron:process.env.ELECTRON_RUN_AS_NODE}))", output, literal], project);
			let result: string | undefined;
			for (let attempt = 0; attempt < 100; attempt++) { try { result = readFileSync(output, "utf8"); break; } catch { await new Promise(resolve => setTimeout(resolve, 20)); } }
			expect(result).toBeDefined();
			const { pid, ...record } = JSON.parse(result!);
			expect(record).toEqual({ args: [literal], cwd: project });
			let exited = false;
			for (let attempt = 0; attempt < 100; attempt++) { try { process.kill(pid, 0); } catch { exited = true; break; } await new Promise(resolve => setTimeout(resolve, 20)); }
			expect(exited).toBe(true);
		} finally {
			if (originalNode === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = originalNode;
			if (originalElectron === undefined) delete process.env.ELECTRON_RUN_AS_NODE; else process.env.ELECTRON_RUN_AS_NODE = originalElectron;
			// Yield while Windows releases the detached child's process and cwd handles.
			await rm(project, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		}
	});
});
