import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PullRequestView } from "../shared/pullRequestView";
import { createGitWorktree } from "./gitWorktrees";
import { checkoutPullRequestWorktree } from "./pullRequestCheckout";

function fixture() {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-pr-checkout-")), git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, windowsHide: true, stdio: "pipe" }).toString().trim();
	const origin = path.join(directory, "origin.git"), author = path.join(directory, "author"), root = path.join(directory, "root");
	mkdirSync(author); git(directory, ["init", "--bare", "-b", "main", origin]);
	git(author, ["init", "-b", "main"]); git(author, ["config", "user.name", "Fixture"]); git(author, ["config", "user.email", "fixture@example.invalid"]); git(author, ["config", "commit.gpgsign", "false"]);
	writeFileSync(path.join(author, "file.txt"), "main\n"); git(author, ["add", "."]); git(author, ["commit", "-m", "Main"]); git(author, ["remote", "add", "origin", origin]); git(author, ["push", "origin", "main"]);
	git(author, ["switch", "-c", "feature/x"]); writeFileSync(path.join(author, "file.txt"), "feature\n"); git(author, ["commit", "-am", "Feature"]);
	git(author, ["push", "origin", "feature/x", "feature/x:refs/pull/7/head"]);
	const head = git(author, ["rev-parse", "HEAD"]);
	git(directory, ["clone", origin, root]);
	return { directory, root, head, git };
}
const view = (head: string, patch: Partial<PullRequestView> = {}) => ({ number: 7, state: "OPEN", head: "feature/x", headOid: head, repository: "owned/repo", headRepository: "owned/repo", headRefExists: true, ...patch }) as PullRequestView;

describe("checking a pull request out into a worktree", () => {
	it("fetches the head, branches at it and tracks the same-repository branch", async () => {
		const { directory, root, head, git } = fixture();
		try {
			const target = path.join(directory, "worktree");
			const result = await checkoutPullRequestWorktree(root, view(head), async (branch, base) => { await createGitWorktree(root, target, branch, base); return { projectId: "p", directory: target }; });
			expect(result).toMatchObject({ projectId: "p", branch: "feature/x" });
			expect(git(target, ["rev-parse", "HEAD"])).toBe(head);
			expect(git(target, ["rev-parse", "--abbrev-ref", "@{upstream}"])).toBe("origin/feature/x");
			// The name is taken now, so a second checkout uses pull/7.
			const second = path.join(directory, "second");
			expect((await checkoutPullRequestWorktree(root, view(head, { headRepository: "fork/repo" }), async (branch, base) => { await createGitWorktree(root, second, branch, base); return { projectId: "q", directory: second }; })).branch).toBe("pull/7");
			await expect(checkoutPullRequestWorktree(root, view(head), async () => ({ projectId: "r" }))).rejects.toThrow("already exists");
			await expect(checkoutPullRequestWorktree(root, view(head, { state: "MERGED" }), async () => ({ projectId: "r" }))).rejects.toThrow("open pull request");
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
});
