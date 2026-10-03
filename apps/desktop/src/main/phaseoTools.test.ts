import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { phaseoTools } from "./phaseoTools";
import { contentHash } from "./projectEdits";

describe("Phaseo file tools", () => {
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
