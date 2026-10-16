import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cascadeRebaseStack } from "./pullRequestStacks";
import { WorkspaceStore } from "./workspaceStore";

function fixture() {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-stack-")), git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, windowsHide: true, stdio: "pipe" }).toString().trim();
	const origin = path.join(directory, "origin.git"), author = path.join(directory, "author"), root = path.join(directory, "root");
	mkdirSync(author); git(directory, ["init", "--bare", "-b", "main", origin]);
	git(author, ["init", "-b", "main"]); git(author, ["config", "user.name", "Fixture"]); git(author, ["config", "user.email", "fixture@example.invalid"]); git(author, ["config", "commit.gpgsign", "false"]); git(author, ["remote", "add", "origin", origin]);
	const commit = (file: string, text: string, message: string) => { writeFileSync(path.join(author, file), text); git(author, ["add", "."]); git(author, ["commit", "-m", message]); };
	commit("base.txt", "base\n", "Base"); git(author, ["push", "origin", "main"]);
	git(author, ["switch", "-c", "one"]); commit("one.txt", "one\n", "One");
	git(author, ["switch", "-c", "two"]); commit("two.txt", "two\n", "Two");
	git(author, ["push", "origin", "one", "two"]);
	const heads = { one: git(author, ["rev-parse", "one"]), two: git(author, ["rev-parse", "two"]) };
	// main moves on after the stack was opened.
	git(author, ["switch", "main"]); commit("main.txt", "later\n", "Later"); git(author, ["push", "origin", "main"]);
	git(directory, ["clone", origin, root]);
	return { directory, origin, root, author, heads, git, commit };
}

describe("rebasing a stack", () => {
	it("moves each layer's own commits onto the new layer below, in a scratch repository, without touching the checkout", async () => {
		const { directory, origin, root, heads, git } = fixture();
		try {
			const before = git(root, ["rev-parse", "HEAD"]);
			const count = await cascadeRebaseStack({ root, remote: origin, base: "main", layers: [{ number: 1, headBranch: "one", headSha: heads.one }, { number: 2, headBranch: "two", headSha: heads.two }] });
			expect(count).toBe(2);
			const one = git(origin, ["rev-parse", "one"]), two = git(origin, ["rev-parse", "two"]), main = git(origin, ["rev-parse", "main"]);
			expect(one).not.toBe(heads.one);
			expect(git(origin, ["rev-parse", `${one}^`])).toBe(main);
			expect(git(origin, ["rev-parse", `${two}^`])).toBe(one);
			expect(git(origin, ["log", "--format=%s", "two"]).split("\n")).toEqual(["Two", "One", "Later", "Base"]);
			expect(git(root, ["rev-parse", "HEAD"])).toBe(before);
			expect(git(root, ["status", "--porcelain"])).toBe("");
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 60000);
	it("refuses to overwrite a push that landed after the stack was read, and stops at a conflict", async () => {
		const { directory, origin, root, author, heads, git, commit } = fixture();
		try {
			git(author, ["switch", "two"]); commit("two.txt", "newer\n", "Newer"); git(author, ["push", "origin", "two"]);
			const pushed = git(origin, ["rev-parse", "two"]);
			await expect(cascadeRebaseStack({ root, remote: origin, base: "main", layers: [{ number: 1, headBranch: "one", headSha: heads.one }, { number: 2, headBranch: "two", headSha: heads.two }] })).rejects.toThrow("Stack rebase stopped at #2 while pushing. 1 layer was rebased.");
			expect(git(origin, ["rev-parse", "two"])).toBe(pushed);
			git(author, ["switch", "main"]); commit("one.txt", "clash\n", "Clash"); git(author, ["push", "origin", "main"]);
			await expect(cascadeRebaseStack({ root, remote: origin, base: "main", layers: [{ number: 1, headBranch: "one", headSha: git(origin, ["rev-parse", "one"]) }] })).rejects.toThrow("#1 conflicts with the layer below it");
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 60000);
});

describe("stacks on chat links", () => {
	it("groups linked layers, links the missing ones as found in the stack, and keeps a dismissed layer dismissed", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "opencode", model: "default", mode: "code" });
			store.apply({ type: "link-pull-request", id: task.id, reference: "#2", repository: "owned/repo", number: 2 });
			const stack = { id: "9", number: 3, url: "https://github.com/owned/repo/stacks/3", base: "main", layers: [{ number: 1, headBranch: "one", state: "open" as const, headSha: "a".repeat(40) }, { number: 2, headBranch: "two", state: "open" as const }] };
			expect(store.syncPullRequestStack("owned/repo", 2, stack)).toBe(true);
			expect(store.syncPullRequestStack("owned/repo", 2, stack)).toBe(false);
			const links = store.getTask(task.id).pullRequests!;
			expect(links.map(link => [link.number, link.source, link.stack?.number])).toEqual([[2, "manual", 3], [1, "stack", 3]]);
			// Saved stacks keep only what navigation needs.
			expect(links[0].stack?.layers[0]).toEqual({ number: 1, headBranch: "one", state: "open" });
			store.apply({ type: "unlink-pull-request", id: task.id, repository: "owned/repo", number: 1 });
			expect(store.getTask(task.id).pullRequests!.find(link => link.number === 1)?.source).toBe("stack-dismissed");
			store.syncPullRequestStack("owned/repo", 2, stack);
			expect(store.getTask(task.id).pullRequests!.find(link => link.number === 1)?.source).toBe("stack-dismissed");
			expect(() => store.apply({ type: "unlink-pull-request", id: task.id, repository: "owned/repo", number: 1 })).toThrow("not linked");
			store.apply({ type: "link-pull-request", id: task.id, reference: "#1", repository: "owned/repo", number: 1 });
			expect(store.getTask(task.id).pullRequests!.find(link => link.number === 1)?.source).toBe("manual");
			store.apply({ type: "link-pull-request", id: task.id, reference: "#9", repository: "owned/repo", number: 9, source: "created" });
			expect(store.getTask(task.id).pullRequests!.find(link => link.number === 9)?.source).toBe("created");
			expect(store.syncPullRequestStack("owned/repo", 2, null)).toBe(true);
			expect(store.getTask(task.id).pullRequests!.find(link => link.number === 2)?.stack).toBeUndefined();
		} finally { store.close(); }
	});
});
