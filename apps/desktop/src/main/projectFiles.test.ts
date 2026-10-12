import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { gitReview, listProjectFiles, parseGitStatus, readProjectFile, resolveProjectPath } from "./projectFiles";

describe("project boundaries", () => {
	it("parses NUL-delimited rename and unusual filename records", () => {
		expect(parseGitStatus("R  new name.txt\0old name.txt\0 M line\nbreak.txt\0?? [literal].txt\0")).toEqual([
			{ path: "new name.txt", oldPath: "old name.txt", indexStatus: "R", worktreeStatus: " " },
			{ path: "line\nbreak.txt", indexStatus: " ", worktreeStatus: "M" },
			{ path: "[literal].txt", indexStatus: "?", worktreeStatus: "?" },
		]);
		expect(() => parseGitStatus("R  missing\0")).toThrow("incomplete rename");
	});
	it("rejects traversal and links outside a registered project", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-project-"));
		const project = path.join(directory, "project"); const outside = path.join(directory, "outside");
		mkdirSync(project); mkdirSync(outside); writeFileSync(path.join(outside, "secret.txt"), "outside");
		symlinkSync(outside, path.join(project, "link"), process.platform === "win32" ? "junction" : "dir");
		try {
			await expect(resolveProjectPath(project, "../outside/secret.txt")).rejects.toThrow("outside");
			await expect(readProjectFile(project, "link/secret.txt")).rejects.toThrow("outside");
			await expect(resolveProjectPath(project, outside)).rejects.toThrow("inside");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("previews text and produces staged and unstaged Git review", async () => {
		const project = mkdtempSync(path.join(tmpdir(), "phaseo-project-"));
		try {
			execFileSync("git", ["init", "-b", "test-workspace"], { cwd: project, windowsHide: true, stdio: "ignore" });
			writeFileSync(path.join(project, "hello.txt"), "Hello\n");
			execFileSync("git", ["add", "--", "hello.txt"], { cwd: project, windowsHide: true });
			expect(await readProjectFile(project, "hello.txt")).toBe("Hello\n");
			expect((await listProjectFiles(project, "")).map(file => file.name)).toEqual(["hello.txt"]);
			const review = await gitReview(project); expect(review.stagedDiff).toContain("+Hello"); expect(review.branch).toBe("test-workspace");
		} finally { rmSync(project, { recursive: true, force: true }); }
	});
});
