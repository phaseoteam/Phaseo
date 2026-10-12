import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runProjectCommand } from "./runProjectCommand";

describe("approved project commands", () => {
	it("returns output and failure exit codes, and enforces project directories", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-command-"));
		try {
			const result = await runProjectCommand(root, process.platform === "win32" ? 'Write-Output "Hello"; exit 7' : "printf Hello; exit 7", ".");
			expect(result.output).toContain("Hello"); expect(result.exitCode).toBe(7);
			await expect(runProjectCommand(root, "echo outside", "..")).rejects.toThrow("outside");
			await expect(runProjectCommand(root, "echo cancelled", ".", AbortSignal.abort())).rejects.toThrow("cancelled");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
