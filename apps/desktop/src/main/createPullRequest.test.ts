import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { branchPullRequest, parseBranchPullRequest } from "./branchPullRequest";
import { createPullRequest } from "./createPullRequest";

function fixture() {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-create-pr-")), git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, windowsHide: true, stdio: "pipe" }).toString().trim();
	const origin = path.join(directory, "origin.git"), root = path.join(directory, "root");
	git(directory, ["init", "--bare", "-b", "main", origin]);
	mkdirSync(root); git(root, ["init", "-b", "main"]); git(root, ["config", "user.name", "Fixture"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "commit.gpgsign", "false"]);
	writeFileSync(path.join(root, "a.txt"), "a\n"); git(root, ["add", "."]); git(root, ["commit", "-m", "Base"]); git(root, ["remote", "add", "origin", origin]); git(root, ["push", "-u", "origin", "main"]);
	git(root, ["remote", "set-head", "origin", "main"]);
	return { directory, origin, root, git };
}
const fakeGh = (answers: { view?: string; create?: string }) => {
	const calls: string[][] = [];
	return { calls, gh: async (_root: string, args: string[]) => { calls.push(args); if (args[1] === "view") { if (answers.view) return answers.view; throw Object.assign(new Error("gh failed"), { stderr: "no pull requests found" }); } if (answers.create) return answers.create; throw Object.assign(new Error("gh failed"), { stderr: "gh: a pull request already exists" }); } };
};

describe("creating a pull request from Git actions", () => {
	it("publishes the branch, then opens the pull request against the default branch", async () => {
		const { directory, origin, root, git } = fixture();
		try {
			git(root, ["switch", "-c", "feature/x"]); writeFileSync(path.join(root, "b.txt"), "b\n"); git(root, ["add", "."]); git(root, ["commit", "-m", "Feature"]);
			const { gh, calls } = fakeGh({ create: "Creating pull request for feature/x into main\n\nhttps://github.com/owned/repo/pull/12\n" });
			expect(await createPullRequest(root, gh)).toEqual({ repository: "owned/repo", number: 12, url: "https://github.com/owned/repo/pull/12", status: "created" });
			expect(git(origin, ["rev-parse", "feature/x"])).toBe(git(root, ["rev-parse", "HEAD"]));
			expect(calls.at(-1)).toEqual(["pr", "create", "--fill", "--head", "feature/x", "--base", "main"]);
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
	it("returns the open pull request a branch already has, and refuses the default branch or a branch with nothing new", async () => {
		const { directory, root, git } = fixture();
		try {
			await expect(createPullRequest(root, fakeGh({}).gh)).rejects.toThrow("default branch");
			git(root, ["switch", "-c", "feature/y"]);
			await expect(createPullRequest(root, fakeGh({}).gh)).rejects.toThrow("no commits that are not on main");
			const { gh, calls } = fakeGh({ view: JSON.stringify({ number: 4, url: "https://github.com/owned/repo/pull/4", state: "OPEN" }) });
			expect(await createPullRequest(root, gh)).toMatchObject({ number: 4, status: "opened_existing" });
			expect(calls.some(args => args[1] === "create")).toBe(false);
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
});

describe("the current branch's pull request", () => {
	it("reads gh's answer for this branch only, and none when gh finds none", async () => {
		expect(parseBranchPullRequest("feature", JSON.stringify({ number: 3, url: "https://github.com/owned/repo/pull/3", state: "OPEN", title: "Three", isDraft: true, headRefName: "feature" }))).toEqual({ repository: "owned/repo", number: 3, url: "https://github.com/owned/repo/pull/3", title: "Three", state: "OPEN", draft: true });
		expect(parseBranchPullRequest("feature", JSON.stringify({ number: 3, url: "https://github.com/owned/repo/pull/3", state: "OPEN", title: "Three", headRefName: "other" }))).toBeNull();
		expect(parseBranchPullRequest("feature", "not json")).toBeNull();
		const { directory, root, git } = fixture();
		try {
			git(root, ["switch", "-c", "feature/z"]);
			expect(await branchPullRequest(root, true, fakeGh({}).gh)).toEqual({ branch: "feature/z", defaultBranch: "main", pullRequest: null });
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
});
