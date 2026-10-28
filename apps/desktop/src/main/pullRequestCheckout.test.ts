import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PullRequestView } from "../shared/pullRequestView";
import { createGitWorktree } from "./gitWorktrees";
import { checkoutPullRequestHere, checkoutPullRequestWorktree } from "./pullRequestCheckout";

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

describe("checking a pull request out in this repository", () => {
	it("switches the checkout to a new branch at the head and tracks the same-repository branch", async () => {
		const { directory, root, head, git } = fixture();
		try {
			const result = await checkoutPullRequestHere(root, view(head));
			expect(result).toEqual({ branch: "feature/x" });
			expect(git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("feature/x");
			expect(git(root, ["rev-parse", "HEAD"])).toBe(head);
			expect(git(root, ["rev-parse", "--abbrev-ref", "@{upstream}"])).toBe("origin/feature/x");
			// Running it again on the same branch is a no-op.
			expect(await checkoutPullRequestHere(root, view(head))).toEqual({ branch: "feature/x" });
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);

	it("refuses while the working tree has changes and leaves them alone", async () => {
		const { directory, root, head, git } = fixture();
		try {
			writeFileSync(path.join(root, "file.txt"), "my edit\n");
			await expect(checkoutPullRequestHere(root, view(head))).rejects.toThrow("uncommitted changes");
			expect(git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
			expect(readFileSync(path.join(root, "file.txt"), "utf8")).toBe("my edit\n");
			writeFileSync(path.join(root, "file.txt"), "main\n"); writeFileSync(path.join(root, "new.txt"), "untracked\n");
			await expect(checkoutPullRequestHere(root, view(head))).rejects.toThrow("uncommitted changes");
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);

	it("moves an existing branch forward, uses pull/N beside an unrelated one, and refuses closed pull requests", async () => {
		const { directory, root, head, git } = fixture();
		try {
			// A local feature/x behind the head is reused and fast-forwarded.
			git(root, ["branch", "feature/x", "origin/main"]);
			expect(await checkoutPullRequestHere(root, view(head))).toEqual({ branch: "feature/x" });
			expect(git(root, ["rev-parse", "HEAD"])).toBe(head);
			// A fork's pull request whose name is taken by a branch with other commits goes to pull/7.
			git(root, ["config", "user.name", "Fixture"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "commit.gpgsign", "false"]);
			writeFileSync(path.join(root, "mine.txt"), "mine\n"); git(root, ["add", "."]); git(root, ["commit", "-m", "Mine"]);
			git(root, ["switch", "main"]);
			expect(await checkoutPullRequestHere(root, view(head, { headRepository: "fork/repo" }))).toEqual({ branch: "pull/7" });
			expect(git(root, ["rev-parse", "HEAD"])).toBe(head);
			await expect(checkoutPullRequestHere(root, view(head, { state: "CLOSED" }))).rejects.toThrow("open pull request");
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);

	it("refuses when the branch is checked out in another worktree", async () => {
		const { directory, root, head } = fixture();
		try {
			const target = path.join(directory, "worktree");
			await checkoutPullRequestWorktree(root, view(head), async (branch, base) => { await createGitWorktree(root, target, branch, base); return { projectId: "p", directory: target }; });
			await expect(checkoutPullRequestHere(root, view(head))).rejects.toThrow("checked out in a worktree");
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
});
