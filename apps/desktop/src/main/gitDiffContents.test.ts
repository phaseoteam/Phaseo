import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readGitDiffContents } from "./gitDiffContents";
import { gitReview } from "./projectFiles";

function fixture() {
	const root = mkdtempSync(path.join(tmpdir(), "phaseo-diff-context-"));
	const git = (args: string[]) => execFileSync("git", args, { cwd: root, windowsHide: true, stdio: "pipe" }).toString();
	git(["init", "-b", "fixture"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); git(["config", "commit.gpgsign", "false"]); git(["config", "core.autocrlf", "false"]);
	return { root, git, close: () => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

describe("full Git diff context", () => {
	it("reads HEAD/index and index/working versions separately, including staged renames", async () => {
		const owned = fixture(), name = "[literal] 世界.txt";
		try {
			const before = "\ufeff" + Array.from({ length: 60 }, (_, index) => `Line ${index}`).join("\n") + "\n";
			writeFileSync(path.join(owned.root, name), before); owned.git(["add", "--", name]); owned.git(["commit", "-m", "fixture"]);
			const indexed = before.replace("Line 20\n", "Indexed edit\n"), working = indexed.replace("Line 40\n", "Working edit\n");
			writeFileSync(path.join(owned.root, name), indexed); owned.git(["add", "--", name]); writeFileSync(path.join(owned.root, name), working);
			const review = await gitReview(owned.root);
			expect(await readGitDiffContents(owned.root, { filename: name, staged: true, hash: review.stagedDiffHash })).toEqual({ oldFile: { name, contents: before }, newFile: { name, contents: indexed } });
			expect(await readGitDiffContents(owned.root, { filename: name, staged: false, hash: review.diffHash })).toEqual({ oldFile: { name, contents: indexed }, newFile: { name, contents: working } });
			writeFileSync(path.join(owned.root, name), indexed);
			await expect(readGitDiffContents(owned.root, { filename: name, staged: false, hash: review.diffHash })).rejects.toThrow("diff changed");
			const renamed = "renamed 世界.txt"; owned.git(["mv", "--", name, renamed]);
			const moved = await gitReview(owned.root);
			expect(await readGitDiffContents(owned.root, { filename: renamed, staged: true, hash: moved.stagedDiffHash })).toEqual({ oldFile: { name, contents: before }, newFile: { name: renamed, contents: indexed } });
		} finally { await owned.close(); }
	}, 30_000);
	it("rejects malformed requests, paths and files absent from the reviewed changes", async () => {
		const owned = fixture();
		try {
			writeFileSync(path.join(owned.root, "file.txt"), "Before\n"); owned.git(["add", "--", "file.txt"]); owned.git(["commit", "-m", "fixture"]);
			const review = await gitReview(owned.root);
			for (const value of [null, [], { filename: "../outside", staged: false, hash: review.diffHash }, { filename: ".GIT/config", staged: false, hash: review.diffHash }, { filename: "file.txt", staged: "false", hash: review.diffHash }, { filename: "file.txt", staged: false, hash: "invalid" }]) await expect(readGitDiffContents(owned.root, value)).rejects.toThrow();
			await expect(readGitDiffContents(owned.root, { filename: "file.txt", staged: false, hash: review.diffHash })).rejects.toThrow("changed tracked");
		} finally { await owned.close(); }
	});
	it("bounds full contents and rejects binary files while leaving the original diff available", async () => {
		const owned = fixture();
		try {
			writeFileSync(path.join(owned.root, "binary.dat"), Buffer.from([0, 1, 2]));
			writeFileSync(path.join(owned.root, "large.txt"), "x".repeat(1024 * 1024 + 1));
			writeFileSync(path.join(owned.root, "lines.txt"), "line\n".repeat(10_001));
			writeFileSync(path.join(owned.root, "encoding.txt"), "Valid UTF-8\n");
			owned.git(["add", "."]); owned.git(["commit", "-m", "fixture"]);
			writeFileSync(path.join(owned.root, "binary.dat"), Buffer.from([0, 3, 4]));
			writeFileSync(path.join(owned.root, "large.txt"), "y" + "x".repeat(1024 * 1024));
			writeFileSync(path.join(owned.root, "lines.txt"), "changed\n" + "line\n".repeat(10_000));
			writeFileSync(path.join(owned.root, "encoding.txt"), Buffer.from([255, 1, 2]));
			const review = await gitReview(owned.root);
			await expect(readGitDiffContents(owned.root, { filename: "binary.dat", staged: false, hash: review.diffHash })).rejects.toThrow(/binary/i);
			for (const filename of ["large.txt", "lines.txt"]) await expect(readGitDiffContents(owned.root, { filename, staged: false, hash: review.diffHash })).rejects.toThrow("Full context supports");
			await expect(readGitDiffContents(owned.root, { filename: "encoding.txt", staged: false, hash: review.diffHash })).rejects.toThrow("UTF-8");
			expect((await gitReview(owned.root)).diffHash).toBe(review.diffHash);
			owned.git(["add", "--", "encoding.txt"]);
			await expect(readGitDiffContents(owned.root, { filename: "encoding.txt", staged: true, hash: (await gitReview(owned.root)).stagedDiffHash })).rejects.toThrow("UTF-8");
		} finally { await owned.close(); }
	}, 30_000);
});
