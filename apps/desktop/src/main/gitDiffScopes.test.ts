import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureCheckpoint } from "./gitCheckpoints";
import { gitCommits, gitRefs, gitScopedDiff, limitPatch, readScopedDiffContents } from "./gitDiffScopes";

function repository() {
	const root = mkdtempSync(path.join(tmpdir(), "phaseo-scoped-diff-"));
	const git = (args: string[]) => execFileSync("git", args, { cwd: root, windowsHide: true, stdio: "pipe" }).toString();
	git(["init", "-b", "main"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); git(["config", "commit.gpgsign", "false"]); git(["config", "core.autocrlf", "false"]);
	writeFileSync(path.join(root, "kept.txt"), "One\nTwo\nThree\n"); git(["add", "."]); git(["commit", "-m", "Base"]);
	return { root, git, cleanup: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) };
}

describe("scoped Git diffs", () => {
	it("compares a branch with its automatic base, including commits, edits and new files", async () => {
		const owned = repository();
		try {
			owned.git(["switch", "-c", "feature"]);
			writeFileSync(path.join(owned.root, "kept.txt"), "One\nTwo changed\nThree\n"); owned.git(["commit", "-am", "Feature commit"]);
			writeFileSync(path.join(owned.root, "new.txt"), "Brand new\n");
			writeFileSync(path.join(owned.root, "kept.txt"), "One\nTwo changed\nThree\nFour\n");
			const branch = await gitScopedDiff(owned.root, { scope: "branch" });
			expect(branch).toMatchObject({ repository: true, headRef: "feature", baseRef: "main", truncated: false });
			expect(branch.patch).toContain("+Two changed"); expect(branch.patch).toContain("+Four"); expect(branch.patch).toContain("+Brand new");
			const uncommitted = await gitScopedDiff(owned.root, { scope: "uncommitted" });
			expect(uncommitted.patch).not.toContain("+Two changed"); expect(uncommitted.patch).toContain("+Four"); expect(uncommitted.patch).toContain("new file mode");
			await expect(gitScopedDiff(owned.root, { scope: "branch", baseRef: "missing" })).rejects.toThrow("no longer exists");
			await expect(gitScopedDiff(owned.root, { scope: "branch", baseRef: "--output=x" })).rejects.toThrow("valid branch");
			expect(await gitRefs(owned.root)).toMatchObject({ current: "feature", remote: [] });
			const contents = await readScopedDiffContents(owned.root, { diff: { scope: "branch" }, filename: "kept.txt", hash: branch.hash });
			expect(contents).toEqual({ oldFile: { name: "kept.txt", contents: "One\nTwo\nThree\n" }, newFile: { name: "kept.txt", contents: "One\nTwo changed\nThree\nFour\n" } });
			writeFileSync(path.join(owned.root, "kept.txt"), "Moved on\n");
			await expect(readScopedDiffContents(owned.root, { diff: { scope: "branch" }, filename: "kept.txt", hash: branch.hash })).rejects.toThrow("diff changed");
		} finally { owned.cleanup(); }
	}, 30000);

	it("ignores whitespace on request and reports folders that are not repositories", async () => {
		const owned = repository();
		const plain = mkdtempSync(path.join(tmpdir(), "phaseo-plain-"));
		try {
			writeFileSync(path.join(owned.root, "kept.txt"), "One\n  Two\nThree\n");
			expect((await gitScopedDiff(owned.root, { scope: "uncommitted" })).patch).toContain("+  Two");
			expect((await gitScopedDiff(owned.root, { scope: "uncommitted", ignoreWhitespace: true })).patch).toBe("");
			expect(await gitScopedDiff(plain, { scope: "uncommitted" })).toMatchObject({ repository: false, patch: "" });
		} finally { owned.cleanup(); rmSync(plain, { recursive: true, force: true }); }
	}, 30000);

	it("shows one turn's changes from checkpoints without touching the index", async () => {
		const owned = repository();
		try {
			writeFileSync(path.join(owned.root, "kept.txt"), "Before the turn\n"); owned.git(["add", "kept.txt"]);
			const before = await captureCheckpoint(owned.root);
			writeFileSync(path.join(owned.root, "kept.txt"), "During the turn\n"); writeFileSync(path.join(owned.root, "made.txt"), "Made by the agent\n");
			const after = await captureCheckpoint(owned.root);
			expect(before).toMatch(/^[0-9a-f]{40}/); expect(after).not.toBe(before);
			const turn = await gitScopedDiff(owned.root, { scope: "turn", from: before, to: after });
			expect(turn.patch).toContain("-Before the turn"); expect(turn.patch).toContain("+During the turn"); expect(turn.patch).toContain("+Made by the agent");
			expect(owned.git(["diff", "--cached", "--name-only"]).trim()).toBe("kept.txt");
			expect(owned.git(["status", "--porcelain"])).toContain("?? made.txt");
			const contents = await readScopedDiffContents(owned.root, { diff: { scope: "turn", from: before, to: after }, filename: "kept.txt", hash: turn.hash });
			expect(contents.oldFile.contents).toBe("Before the turn\n"); expect(contents.newFile.contents).toBe("During the turn\n");
			expect(await captureCheckpoint(tmpdir())).toBeUndefined();
		} finally { owned.cleanup(); }
	}, 30000);

	it("cuts oversized patches at a file boundary", () => {
		const file = (name: string) => `diff --git a/${name} b/${name}\n${"+line\n".repeat(10)}`;
		const patch = file("a") + file("b") + file("c");
		expect(limitPatch(patch, patch.length)).toEqual({ patch, truncated: false });
		expect(limitPatch(patch, file("a").length + 10)).toEqual({ patch: file("a"), truncated: true });
	});
});

describe("reviewing one commit", () => {
	it("lists the branch's commits newest first and diffs each against its first parent", async () => {
		const owned = repository();
		try {
			owned.git(["switch", "-c", "feature"]);
			writeFileSync(path.join(owned.root, "kept.txt"), "One\nTwo changed\nThree\n"); owned.git(["commit", "-am", "First change"]);
			writeFileSync(path.join(owned.root, "added.txt"), "Added\n"); owned.git(["add", "."]); owned.git(["commit", "-m", "Second change"]);
			writeFileSync(path.join(owned.root, "dirty.txt"), "Not committed\n");
			const commits = await gitCommits(owned.root);
			expect(commits.map(commit => commit.subject)).toEqual(["Second change", "First change"]);
			expect(commits[0]).toMatchObject({ author: "Fixture", merge: false });
			const second = await gitScopedDiff(owned.root, { scope: "commit", commit: commits[0].sha });
			expect(second.patch).toContain("+Added"); expect(second.patch).not.toContain("Two changed"); expect(second.patch).not.toContain("Not committed");
			const first = await gitScopedDiff(owned.root, { scope: "commit", commit: commits[1].sha });
			expect(first.patch).toContain("+Two changed"); expect(first.patch).not.toContain("+Added");
			const contents = await readScopedDiffContents(owned.root, { diff: { scope: "commit", commit: commits[1].sha }, filename: "kept.txt", hash: first.hash });
			expect(contents.oldFile.contents).toBe("One\nTwo\nThree\n"); expect(contents.newFile.contents).toBe("One\nTwo changed\nThree\n");
			await expect(gitScopedDiff(owned.root, { scope: "commit", commit: "f".repeat(40) })).rejects.toThrow("not in the local repository");
			await expect(gitScopedDiff(owned.root, { scope: "commit", commit: "HEAD" })).rejects.toThrow("Choose a commit");
		} finally { owned.cleanup(); }
	});

	it("shows a merge against its first parent and the newest commits on the default branch itself", async () => {
		const owned = repository();
		try {
			owned.git(["switch", "-c", "side"]); writeFileSync(path.join(owned.root, "side.txt"), "Side\n"); owned.git(["add", "."]); owned.git(["commit", "-m", "Side work"]);
			owned.git(["switch", "main"]); owned.git(["merge", "--no-ff", "side", "-m", "Merge side"]);
			const commits = await gitCommits(owned.root);
			expect(commits.map(commit => commit.subject)).toEqual(["Merge side", "Side work", "Base"]);
			expect(commits[0].merge).toBe(true);
			expect((await gitScopedDiff(owned.root, { scope: "commit", commit: commits[0].sha })).patch).toContain("+Side");
			const root = await gitScopedDiff(owned.root, { scope: "commit", commit: commits[2].sha });
			expect(root.patch).toContain("+One");
		} finally { owned.cleanup(); }
	});
});
