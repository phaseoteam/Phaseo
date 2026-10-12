import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { phaseoTools } from "./phaseoTools";
import { contentHash } from "./projectEdits";
import { ProjectInstructions } from "./projectInstructions";

describe("Phaseo file tools", () => {
	it("discovers new scoped instructions before writes and commands execute", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-tools-instructions-"));
		try {
			mkdirSync(path.join(root, "src")); writeFileSync(path.join(root, "src", "file.txt"), "original");
			const instructions = new ProjectInstructions(root); await instructions.load(".", true);
			const revision = instructions.revision(); writeFileSync(path.join(root, "src", "AGENTS.md"), "New scoped rule");
			const tools = phaseoTools(root, true, instructions);
			const context = { runId: "test", agentId: "test", stepIndex: 0, context: undefined, toolCall: { id: "edit", name: "write_project_file", input: {} }, emitProgress: () => {}, setContext: () => {} };
			const edit = tools[1], command = tools[2];
			if (typeof edit.execute !== "function" || typeof command.execute !== "function") throw new Error("Missing tools");
			expect(await edit.execute({ path: "src/file.txt", content: "updated", expectedHash: contentHash("original"), instructionRevision: revision }, context)).toEqual(expect.objectContaining({ blocked: true, instructionFiles: ["src/AGENTS.md"] }));
			expect(readFileSync(path.join(root, "src", "file.txt"), "utf8")).toBe("original");
			expect(await command.execute({ command: "must never execute", directory: "src", instructionRevision: revision }, context)).toEqual(expect.objectContaining({ blocked: true }));
			await edit.execute({ path: "src/file.txt", content: "updated", expectedHash: contentHash("original"), instructionRevision: instructions.revision() }, context);
			expect(readFileSync(path.join(root, "src", "file.txt"), "utf8")).toBe("updated");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it("rejects stale edits, outside paths, and replacing existing files as new", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-tools-"));
		try {
			writeFileSync(path.join(root, "file.txt"), "original");
			const tool = phaseoTools(root, true)[1];
			if (typeof tool.execute !== "function") throw new Error("Missing write tool");
			const context = { runId: "test", agentId: "test", stepIndex: 0, context: undefined, toolCall: { id: "edit", name: tool.id, input: {} }, emitProgress: () => {}, setContext: () => {} };
			await expect(tool.execute({ path: "file.txt", content: "overwrite", expectedHash: "new" }, context)).rejects.toThrow();
			await expect(tool.execute({ path: "file.txt", content: "overwrite", expectedHash: contentHash("stale") }, context)).rejects.toThrow("changed");
			await expect(tool.execute({ path: "../escape.txt", content: "overwrite", expectedHash: "new" }, context)).rejects.toThrow("outside");
			expect(readFileSync(path.join(root, "file.txt"), "utf8")).toBe("original");
			await tool.execute({ path: "file.txt", content: "updated", expectedHash: contentHash("original") }, context);
			expect(readFileSync(path.join(root, "file.txt"), "utf8")).toBe("updated");
			expect(phaseoTools(root, false).map(tool => tool.id)).toEqual(["project_files"]);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
