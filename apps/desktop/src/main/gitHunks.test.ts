import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { readGitHunks } from "./gitHunks";
import { gitCommand } from "./gitOperations";

it("stages and reverses selected literal-file hunks while preserving other changes and rejecting stale review", async () => {
	const root = mkdtempSync(path.join(tmpdir(), "phaseo-hunks-"));
	const git = (args: string[]) => execFileSync("git", args, { cwd: root, windowsHide: true }).toString();
	try {
		git(["init", "-b", "fixture"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); git(["config", "commit.gpgsign", "false"]);
		const filename = "[literal] 世界.txt", file = path.join(root, filename);
		const original = Array.from({ length: 30 }, (_, index) => `Line ${index}`).join("\n") + "\n";
		writeFileSync(file, original); git(["add", "--", filename]); git(["commit", "-m", "fixture"]);
		const edited = original.replace("Line 2\n", "First edit\n").replace("Line 25\n", "Second edit\n"); writeFileSync(file, edited);
		const review = await readGitHunks(root, filename, false); expect(review.hunks).toHaveLength(2);
		await gitCommand(root, { type: "stage-hunk", filename, index: 1, hash: review.hash });
		expect(git(["diff", "--cached"])).toContain("Second edit"); expect(git(["diff", "--cached"])).not.toContain("First edit");
		expect(readFileSync(file, "utf8")).toBe(edited);
		await expect(gitCommand(root, { type: "stage-hunk", filename, index: 0, hash: review.hash })).rejects.toThrow("diff changed");
		const staged = await readGitHunks(root, filename, true);
		await gitCommand(root, { type: "unstage-hunk", filename, index: 0, hash: staged.hash });
		expect(git(["diff", "--cached"])).toBe(""); expect(readFileSync(file, "utf8")).toBe(edited);
		await expect(readGitHunks(root, "../outside", false)).rejects.toThrow("inside");
		await expect(gitCommand(root, { type: "stage-hunk", filename, index: -1, hash: review.hash })).rejects.toThrow("Invalid Git hunk");
	} finally { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}, 30000);
