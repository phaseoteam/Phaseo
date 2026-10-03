import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gitBranches, gitCommand } from "./gitOperations";

describe("Git workspace actions", () => {
	it("accepts an alias of the repository root and rejects a nested project", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-git-alias-"));
		const root = path.join(directory, "repository"); const alias = path.join(directory, "alias");
		mkdirSync(root); mkdirSync(path.join(root, "nested"));
		try {
			execFileSync("git", ["init", "-b", "fixture"], { cwd: root, windowsHide: true, stdio: "pipe" });
			symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");
			writeFileSync(path.join(root, "file.txt"), "Alias fixture\n");
			expect((await gitCommand(alias, { type: "stage", filename: "file.txt" })).stagedDiff).toContain("Alias fixture");
			await expect(gitCommand(path.join(root, "nested"), { type: "stage", filename: "file.txt" })).rejects.toThrow("repository root");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("stages literal filenames, commits and switches branches without losing working changes", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-git-"));
		const git = (args: string[]) => execFileSync("git", args, { cwd: root, windowsHide: true, stdio: "pipe" }).toString();
		try {
			git(["init", "-b", "fixture"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); git(["config", "commit.gpgsign", "false"]);
			writeFileSync(path.join(root, "[literal].txt"), "Before\n");
			expect((await gitCommand(root, { type: "stage", filename: "[literal].txt" })).stagedDiff).toContain("Before");
			expect((await gitCommand(root, { type: "unstage", filename: "[literal].txt" })).stagedDiff).toBe("");
			await gitCommand(root, { type: "stage", filename: "[literal].txt" });
			await gitCommand(root, { type: "commit", message: "Fixture initial commit" });
			expect((await gitCommand(root, { type: "create-branch", name: "feature/fixture" })).branch).toBe("feature/fixture");
			writeFileSync(path.join(root, "[literal].txt"), "Working edit\n");
			await expect(gitCommand(root, { type: "switch-branch", name: "fixture" })).rejects.toThrow("working changes");
			expect(readFileSync(path.join(root, "[literal].txt"), "utf8")).toBe("Working edit\n");
			await gitCommand(root, { type: "stage", filename: "[literal].txt" });
			await gitCommand(root, { type: "unstage", filename: "[literal].txt" });
			expect(git(["diff", "--cached"])).toBe("");
			await gitCommand(root, { type: "stage", filename: "[literal].txt" });
			await gitCommand(root, { type: "commit", message: "Fixture edit" });
			expect((await gitCommand(root, { type: "switch-branch", name: "fixture" })).branch).toBe("fixture");
			expect(await gitBranches(root)).toEqual(["feature/fixture", "fixture"]);
			git(["mv", "--", "[literal].txt", "renamed file.txt"]);
			writeFileSync(path.join(root, "renamed file.txt"), "Before\nExtra\n");
			const renamed = await gitCommand(root, { type: "stage", filename: "renamed file.txt" });
			expect(renamed.files[0].oldPath).toBe("[literal].txt");
			await gitCommand(root, { type: "unstage", filename: "renamed file.txt" });
			expect(git(["diff", "--cached"])).toBe("");
			expect(readFileSync(path.join(root, "renamed file.txt"), "utf8")).toBe("Before\nExtra\n");
			await expect(gitCommand(root, { type: "stage", filename: "../outside" })).rejects.toThrow("inside");
			await expect(gitCommand(root, { type: "switch-branch", name: "--detach" })).rejects.toThrow("branch name");
		} finally { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
	}, 15000);
});
