import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { WorkItem } from "../../shared/factory/types";
import { git, prepareWorktree } from "./worktrees";

// Each test makes real clones and worktrees, which is slow on Windows when other tests run alongside.
describe("prepareWorktree", { timeout: 90_000 }, () => {
	it("carries a pull request on in the worktree that fixed its issue, since a branch can only be checked out once", async () => {
		const base = await mkdtemp(path.join(os.tmpdir(), "factory-worktree-"));
		try {
			const run = (cwd: string, ...args: string[]) => git(cwd, args);
			await run(base, "init", "-q", "--bare", "-b", "main", "origin.git");
			await run(base, "clone", "-q", "origin.git", "clone");
			const clone = path.join(base, "clone");
			await run(clone, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "start");
			await run(clone, "push", "-q", "origin", "main");
			await run(clone, "remote", "set-head", "origin", "main");

			const root = path.join(base, "worktrees");
			const issue = { repo: "o/r", number: 1, title: "Prices", kind: "issue" } as WorkItem;
			const fixed = await prepareWorktree(root, clone, issue);
			const pull = { repo: "o/r", number: 2, title: "Fix prices", kind: "pull", branch: fixed.branch } as WorkItem;
			expect(await prepareWorktree(root, clone, pull)).toMatchObject({ dir: fixed.dir, branch: fixed.branch });
		} finally {
			await rm(base, { recursive: true, force: true });
		}
	});

	it("gives repositories whose names make the same slug worktrees of their own", async () => {
		const base = await mkdtemp(path.join(os.tmpdir(), "factory-worktree-"));
		try {
			const run = (cwd: string, ...args: string[]) => git(cwd, args);
			const clone = async (name: string) => {
				await run(base, "init", "-q", "--bare", "-b", "main", `${name}.git`);
				await run(base, "clone", "-q", `${name}.git`, name);
				const dir = path.join(base, name);
				await run(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", name);
				await run(dir, "push", "-q", "origin", "main");
				await run(dir, "remote", "set-head", "origin", "main");
				return dir;
			};
			const root = path.join(base, "worktrees");
			const first = await prepareWorktree(root, await clone("first"), { repo: "acme/tools-api", number: 1, title: "One", kind: "issue" } as WorkItem);
			const second = await prepareWorktree(root, await clone("second"), { repo: "acme-tools/api", number: 1, title: "Two", kind: "issue" } as WorkItem);
			expect(second.dir).not.toBe(first.dir);
			expect(await run(second.dir, "log", "-1", "--format=%s")).toBe("second");
			// Each finds its own worktree again.
			expect((await prepareWorktree(root, path.join(base, "second"), { repo: "acme-tools/api", number: 1, title: "Two", kind: "issue" } as WorkItem)).dir).toBe(second.dir);
			expect((await prepareWorktree(root, path.join(base, "first"), { repo: "acme/tools-api", number: 1, title: "One", kind: "issue" } as WorkItem)).dir).toBe(first.dir);
		} finally {
			await rm(base, { recursive: true, force: true });
		}
	});

	it("never touches a branch of yours, keeps a branch's commits, and brings a pull request's worktree up to date", async () => {
		const base = await mkdtemp(path.join(os.tmpdir(), "factory-worktree-"));
		try {
			const run = (cwd: string, ...args: string[]) => git(cwd, args);
			const commit = (cwd: string, message: string) => run(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", message);
			await run(base, "init", "-q", "--bare", "-b", "main", "origin.git");
			await run(base, "clone", "-q", "origin.git", "clone");
			const clone = path.join(base, "clone");
			await commit(clone, "start");
			await run(clone, "push", "-q", "origin", "main");
			await run(clone, "remote", "set-head", "origin", "main");
			const root = path.join(base, "worktrees");

			// A pull request from someone's branch called main: your main, with a commit of yours on it, stays as it is.
			await run(clone, "checkout", "-q", "-b", "dev");
			await commit(clone, "the pull request");
			await run(clone, "push", "-q", "origin", "dev:refs/pull/4/head");
			await run(clone, "checkout", "-q", "main");
			await commit(clone, "mine, not pushed");
			const mine = await run(clone, "rev-parse", "main");
			const pull = { repo: "o/r", number: 4, title: "From a fork", kind: "pull", branch: "main" } as WorkItem;
			const review = await prepareWorktree(root, clone, pull);
			expect(review.branch).toBe("factory/pr-4");
			expect(await run(clone, "rev-parse", "main")).toBe(mine);
			expect(await run(review.dir, "log", "-1", "--format=%s")).toBe("the pull request");

			// New commits on the pull request reach its worktree before the next stage, when it can only move forward.
			await run(clone, "checkout", "-q", "dev");
			await commit(clone, "a second commit");
			await run(clone, "push", "-q", "-f", "origin", "dev:refs/pull/4/head");
			const again = await prepareWorktree(root, clone, pull);
			expect(again.note).toMatch(/^Brought up to date/);
			expect(await run(review.dir, "log", "-1", "--format=%s")).toBe("a second commit");
			// A commit only the worktree has is never thrown away.
			await commit(review.dir, "a fix not pushed yet");
			await commit(clone, "a third commit");
			await run(clone, "push", "-q", "-f", "origin", "dev:refs/pull/4/head");
			expect((await prepareWorktree(root, clone, pull)).note).toMatch(/commits the pull request doesn't/);
			expect(await run(review.dir, "log", "-1", "--format=%s")).toBe("a fix not pushed yet");

			// An issue's branch whose worktree folder went keeps its fix commit when it's checked out again.
			await run(clone, "checkout", "-q", "main");
			const issue = { repo: "o/r", number: 12, title: "Totals", kind: "issue" } as WorkItem;
			const fix = await prepareWorktree(root, clone, issue);
			await commit(fix.dir, "the fix");
			await rm(fix.dir, { recursive: true, force: true });
			const back = await prepareWorktree(root, clone, { ...issue, branch: fix.branch });
			expect(back.branch).toBe(fix.branch);
			expect(await run(back.dir, "log", "-1", "--format=%s")).toBe("the fix");
		} finally {
			await rm(base, { recursive: true, force: true });
		}
	});

	it("leaves a branch alone when a worktree that isn't this profile's has it, and picks it up again later", async () => {
		const base = await mkdtemp(path.join(os.tmpdir(), "factory-worktree-"));
		try {
			const run = (cwd: string, ...args: string[]) => git(cwd, args);
			await run(base, "init", "-q", "--bare", "-b", "main", "origin.git");
			await run(base, "clone", "-q", "origin.git", "clone");
			const clone = path.join(base, "clone");
			await run(clone, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "start");
			await run(clone, "push", "-q", "origin", "main");
			await run(clone, "remote", "set-head", "origin", "main");

			// Another Factory profile on the same clone already works on issue 7.
			const issue = { repo: "o/r", number: 7, title: "Receipt totals", kind: "issue" } as WorkItem;
			const other = await prepareWorktree(path.join(base, "other"), clone, issue);
			const mine = await prepareWorktree(path.join(base, "mine"), clone, issue);
			expect(other.branch).toBe("factory/7-receipt-totals");
			expect(mine.branch).toBe("factory/7-receipt-totals-2");
			expect(await run(other.dir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("factory/7-receipt-totals");
			// The next stage finds the same worktree on its numbered branch.
			expect(await prepareWorktree(path.join(base, "mine"), clone, issue)).toMatchObject({ dir: mine.dir, branch: mine.branch });

			// A pull request whose branch is checked out somewhere else gets a copy of its own.
			await run(clone, "push", "-q", "origin", "main:refs/pull/9/head");
			await run(clone, "branch", "feat/free-shipping");
			await run(path.join(base, "other", "o-r-7"), "worktree", "add", "-q", path.join(base, "yours"), "feat/free-shipping");
			const pull = { repo: "o/r", number: 9, title: "Free shipping", kind: "pull", branch: "feat/free-shipping" } as WorkItem;
			const review = await prepareWorktree(path.join(base, "mine"), clone, pull);
			expect(review.branch).toBe("factory/pr-9");
			expect(review.dir).toBe(path.join(base, "mine", "o-r-9"));
		} finally {
			await rm(base, { recursive: true, force: true });
		}
	});
});
