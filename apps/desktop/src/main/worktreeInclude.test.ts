import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { copyWorktreeIncludes } from "./worktreeInclude";

describe(".worktreeinclude", () => {
	it("copies matching untracked files into a new worktree without overwriting what it has", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-worktree-include-"));
		const source = path.join(directory, "source"), worktree = path.join(directory, "worktree");
		try {
			mkdirSync(path.join(source, "config"), { recursive: true }); mkdirSync(worktree);
			const git = (args: string[]) => execFileSync("git", args, { cwd: source, windowsHide: true, stdio: "pipe" });
			git(["init", "-b", "main"]);
			writeFileSync(path.join(source, ".gitignore"), ".env\nconfig/local.json\nbuild/\n");
			writeFileSync(path.join(source, ".worktreeinclude"), ".env\nconfig/*.json\n");
			writeFileSync(path.join(source, ".env"), "SECRET=1\n");
			writeFileSync(path.join(source, "config", "local.json"), "{}\n");
			mkdirSync(path.join(source, "build")); writeFileSync(path.join(source, "build", "out.js"), "x");
			writeFileSync(path.join(worktree, ".env"), "KEEP=1\n");
			const result = await copyWorktreeIncludes(source, worktree);
			expect(result.copied).toEqual(["config/local.json"]);
			expect(result.skipped).toEqual([".env"]);
			expect(readFileSync(path.join(worktree, ".env"), "utf8")).toBe("KEEP=1\n");
			expect(readFileSync(path.join(worktree, "config", "local.json"), "utf8")).toBe("{}\n");
			rmSync(path.join(source, ".worktreeinclude"));
			expect(await copyWorktreeIncludes(source, worktree)).toEqual({ copied: [], skipped: [] });
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
});
