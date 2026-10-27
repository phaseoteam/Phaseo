import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureCheckpoint, checkpointChanges, restoreCheckpoint } from "./gitCheckpoints";

function repository() {
	const root = mkdtempSync(path.join(tmpdir(), "phaseo-checkpoint-restore-"));
	const git = (args: string[], cwd = root) => execFileSync("git", args, { cwd, windowsHide: true, stdio: "pipe" }).toString();
	git(["init", "-b", "main"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); git(["config", "commit.gpgsign", "false"]); git(["config", "core.autocrlf", "false"]);
	writeFileSync(path.join(root, ".gitignore"), "ignored.log\n");
	writeFileSync(path.join(root, "kept.txt"), "One\n"); writeFileSync(path.join(root, "gone.txt"), "Gone\n"); git(["add", "."]); git(["commit", "-m", "Base"]);
	return { root, git, cleanup: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) };
}

describe("turn checkpoints", () => {
	it("lists and restores the working tree to a snapshot, leaving the index and ignored files alone", async () => {
		const owned = repository();
		try {
			writeFileSync(path.join(owned.root, "draft.txt"), "Untracked before the turn\n");
			const before = await captureCheckpoint(owned.root);
			expect(before).toBeTruthy();
			// The turn edits, deletes and adds files, one with a glob character in its name.
			writeFileSync(path.join(owned.root, "kept.txt"), "One\nTwo\n"); rmSync(path.join(owned.root, "gone.txt"));
			writeFileSync(path.join(owned.root, "new[1].txt"), "New\n"); writeFileSync(path.join(owned.root, "ignored.log"), "Log\n");
			owned.git(["add", "kept.txt"]);
			const changes = await checkpointChanges(owned.root, before!);
			expect(changes.sort((a, b) => a.path.localeCompare(b.path))).toEqual([{ path: "gone.txt", status: "deleted" }, { path: "kept.txt", status: "modified" }, { path: "new[1].txt", status: "added" }]);
			await restoreCheckpoint(owned.root, before!);
			expect(readFileSync(path.join(owned.root, "kept.txt"), "utf8")).toBe("One\n");
			expect(readFileSync(path.join(owned.root, "gone.txt"), "utf8")).toBe("Gone\n");
			expect(existsSync(path.join(owned.root, "new[1].txt"))).toBe(false);
			expect(readFileSync(path.join(owned.root, "draft.txt"), "utf8")).toBe("Untracked before the turn\n");
			expect(existsSync(path.join(owned.root, "ignored.log"))).toBe(true);
			// The staged edit is still staged: only the working tree moved back.
			expect(owned.git(["diff", "--cached", "--name-only"]).trim()).toBe("kept.txt");
			expect(await checkpointChanges(owned.root, before!)).toEqual([]);
		} finally { owned.cleanup(); }
	}, 30000);

	it("reads paths from a project folder inside a larger repository", async () => {
		const owned = repository();
		try {
			const folder = path.join(owned.root, "app"); mkdirSync(folder);
			writeFileSync(path.join(folder, "main.ts"), "a\n"); owned.git(["add", "."]); owned.git(["commit", "-m", "App"]);
			const before = await captureCheckpoint(folder);
			writeFileSync(path.join(folder, "main.ts"), "b\n"); writeFileSync(path.join(folder, "added.ts"), "c\n");
			expect((await checkpointChanges(folder, before!)).map(change => change.path).sort()).toEqual(["added.ts", "main.ts"]);
			await restoreCheckpoint(folder, before!);
			expect(readFileSync(path.join(folder, "main.ts"), "utf8")).toBe("a\n");
			expect(existsSync(path.join(folder, "added.ts"))).toBe(false);
		} finally { owned.cleanup(); }
	}, 30000);

	it("refuses snapshots that are malformed or missing", async () => {
		const owned = repository();
		try {
			await expect(checkpointChanges(owned.root, "not-a-tree")).rejects.toThrow("no saved snapshot");
			await expect(checkpointChanges(owned.root, "0".repeat(40))).rejects.toThrow("no longer in the repository");
		} finally { owned.cleanup(); }
	}, 30000);
});
