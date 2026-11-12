import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { branchPullRequest, parseBranchPullRequest } from "./branchPullRequest";
import { createPullRequest, parsePullRequestText, parseTreeEntries, pullRequestPrompt, pullRequestTemplate, templateCandidates, threadWorkLog, type PullRequestContext } from "./createPullRequest";

function fixture() {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-create-pr-")), git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, windowsHide: true, stdio: "pipe" }).toString().trim();
	const origin = path.join(directory, "origin.git"), root = path.join(directory, "root");
	git(directory, ["init", "--bare", "-b", "main", origin]);
	mkdirSync(root); git(root, ["init", "-b", "main"]); git(root, ["config", "user.name", "Fixture"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "commit.gpgsign", "false"]);
	writeFileSync(path.join(root, "a.txt"), "a\n"); git(root, ["add", "."]); git(root, ["commit", "-m", "Base"]); git(root, ["remote", "add", "origin", origin]); git(root, ["push", "-u", "origin", "main"]);
	git(root, ["remote", "set-head", "origin", "main"]);
	// Reads are pinned to github.com; pushes still go to the local bare repository.
	git(root, ["remote", "set-url", "origin", "https://github.com/owned/repo.git"]); git(root, ["remote", "set-url", "--push", "origin", origin]);
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
			expect(calls.at(-1)).toEqual(["pr", "create", "--repo", "github.com/owned/repo", "--fill", "--head", "feature/x", "--base", "main"]);
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

describe("writing the pull request", () => {
	it("passes the writer's title and description to GitHub CLI, with the commits, changes and the repository's template", async () => {
		const { directory, root, git } = fixture();
		try {
			mkdirSync(path.join(root, ".github")); writeFileSync(path.join(root, ".github", "pull_request_template.md"), "## What changed\n\n## Why\n");
			git(root, ["add", "."]); git(root, ["commit", "-m", "Template"]); git(root, ["push"]);
			git(root, ["switch", "-c", "feature/w"]); writeFileSync(path.join(root, "w.txt"), "w\n"); git(root, ["add", "."]); git(root, ["commit", "-m", "Add w", "-m", "Because w was missing."]);
			let seen: PullRequestContext | undefined, body = "";
			const calls: string[][] = [];
			const gh = async (_root: string, args: string[]) => {
				calls.push(args);
				if (args[1] === "view") throw Object.assign(new Error("gh failed"), { stderr: "no pull requests found" });
				body = (await import("node:fs")).readFileSync(args[args.indexOf("--body-file") + 1], "utf8");
				return "https://github.com/owned/repo/pull/14\n";
			};
			const result = await createPullRequest(root, gh, async context => { seen = context; return { title: "Add w", body: "## What changed\n\nAdds w.", model: "openai/gpt-6-mini" }; });
			expect(result).toMatchObject({ number: 14, status: "created", writtenBy: "openai/gpt-6-mini" });
			expect(seen).toMatchObject({ branch: "feature/w", base: "main", template: "## What changed\n\n## Why" });
			expect(seen!.commits).toContain("Add w\nBecause w was missing.");
			expect(seen!.commits).not.toContain("Template");
			expect(seen!.summary).toContain("w.txt");
			expect(seen!.patch).toContain("+w");
			expect(calls.at(-1)!.slice(0, 5)).toEqual(["pr", "create", "--repo", "github.com/owned/repo", "--title"]);
			expect(calls.at(-1)).toContain("Add w");
			expect(calls.at(-1)).not.toContain("--fill");
			expect(body).toBe("## What changed\n\nAdds w.");
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);

	it("falls back to the commits when the writer fails or has nothing", async () => {
		const { directory, root, git } = fixture();
		try {
			git(root, ["switch", "-c", "feature/f"]); writeFileSync(path.join(root, "f.txt"), "f\n"); git(root, ["add", "."]); git(root, ["commit", "-m", "Add f"]);
			const { gh, calls } = fakeGh({ create: "https://github.com/owned/repo/pull/15\n" });
			expect(await createPullRequest(root, gh, async () => { throw new Error("offline"); })).not.toHaveProperty("writtenBy");
			expect(calls.at(-1)).toContain("--fill");
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);

	it("finds committed templates where GitHub does: .github, the root, docs, then a folder holding exactly one", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-pr-template-")), git = (args: string[]) => execFileSync("git", args, { cwd: directory, windowsHide: true, stdio: "pipe" }).toString().trim();
		const commit = (files: Record<string, string | null>) => { for (const [name, text] of Object.entries(files)) { const file = path.join(directory, ...name.split("/")); if (text === null) rmSync(file, { force: true }); else { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); } } git(["add", "-A"]); git(["commit", "--allow-empty", "-m", "Templates"]); };
		try {
			git(["init", "-b", "main"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); git(["config", "commit.gpgsign", "false"]); git(["config", "core.autocrlf", "false"]);
			commit({ "readme.md": "Readme" });
			expect(await pullRequestTemplate(directory)).toBeUndefined();
			commit({ ".github/PULL_REQUEST_TEMPLATE/a.md": "A" });
			expect(await pullRequestTemplate(directory)).toBe("A");
			// Several templates in a folder are ambiguous, so none is used.
			commit({ ".github/PULL_REQUEST_TEMPLATE/b.md": "B" });
			expect(await pullRequestTemplate(directory)).toBeUndefined();
			commit({ "docs/Pull_Request_Template.txt": "Docs" });
			expect(await pullRequestTemplate(directory)).toBe("Docs");
			commit({ "PULL_REQUEST_TEMPLATE.md": "Root" });
			expect(await pullRequestTemplate(directory)).toBe("Root");
			commit({ ".github/pull_request_template.md": "  \n", ".github/PULL_REQUEST_TEMPLATE.txt": "GitHub" });
			expect(await pullRequestTemplate(directory)).toBe("GitHub");
			// Only what is committed counts: an uncommitted edit is ignored, and an older commit gives its own template.
			writeFileSync(path.join(directory, ".github", "PULL_REQUEST_TEMPLATE.txt"), "Uncommitted");
			expect(await pullRequestTemplate(directory)).toBe("GitHub");
			expect(await pullRequestTemplate(directory, "HEAD~1")).toBe("Root");
			expect(await pullRequestTemplate(directory, "no-such-branch")).toBeUndefined();
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);

	it("orders template candidates by place, then exact spelling, and skips links", () => {
		const entry = (file: string, mode = "100644") => ({ path: file, type: "blob", mode, object: "a".repeat(40) });
		const order = templateCandidates([entry("docs/pull_request_template.md"), entry("Pull_Request_Template.md"), entry("PULL_REQUEST_TEMPLATE.md"), entry(".github/pull_request_template.md", "120000"), entry(".github/pull_request_template/one.md"), entry(".github/notes.md")]);
		expect(order.map(candidate => "file" in candidate ? candidate.file.path : candidate.folder.map(value => value.path).join(","))).toEqual(["PULL_REQUEST_TEMPLATE.md", "Pull_Request_Template.md", "docs/pull_request_template.md", ".github/pull_request_template/one.md"]);
		expect(parseTreeEntries([`100644 blob ${"b".repeat(40)}\tfile.md`, `040000 tree ${"c".repeat(40)}\tdocs`, ""].join("\0"), "x/")).toEqual([{ mode: "100644", type: "blob", object: "b".repeat(40), path: "x/file.md" }, { mode: "040000", type: "tree", object: "c".repeat(40), path: "x/docs" }]);
	});

	it("leaves the template out when following it is turned off", async () => {
		const { directory, root, git } = fixture();
		try {
			mkdirSync(path.join(root, ".github")); writeFileSync(path.join(root, ".github", "pull_request_template.md"), "## Why\n");
			git(root, ["add", "."]); git(root, ["commit", "-m", "Template"]); git(root, ["push"]);
			git(root, ["switch", "-c", "feature/t"]); writeFileSync(path.join(root, "t.txt"), "t\n"); git(root, ["add", "."]); git(root, ["commit", "-m", "Add t"]);
			let seen: PullRequestContext | undefined;
			const { gh } = fakeGh({ create: "https://github.com/owned/repo/pull/16\n" });
			await createPullRequest(root, gh, async context => { seen = context; return undefined; }, { followTemplate: false });
			expect(seen).toBeDefined(); expect(seen).not.toHaveProperty("template");
		} finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);

	it("tells the model about the template and the chat's work, and reads its reply", () => {
		const prompt = pullRequestPrompt({ branch: "feature/w", base: "main", commits: "Add w", summary: " w.txt | 1 +", patch: "+w", template: "## Why" }, "Tool calls:\n- pnpm test");
		expect(prompt.user).toContain("Pull request template:\n## Why");
		expect(prompt.user).toContain("Work log from the chat that made the changes:\nTool calls:\n- pnpm test");
		expect(prompt.system).toContain("never invent results");
		expect(pullRequestPrompt({ branch: "b", commits: "", summary: "", patch: "" }).user).not.toContain("template");
		expect(pullRequestPrompt({ branch: "b", commits: "", summary: "", patch: "" }, undefined, "Keep it to three bullets.").system).toContain("<preferences>\nKeep it to three bullets.\n</preferences>");
		expect(parsePullRequestText("```markdown\nTitle: Add w.\n\n## Why\nIt was missing.\n```")).toEqual({ title: "Add w", body: "## Why\nIt was missing." });
		expect(parsePullRequestText("\n\n")).toBeUndefined();
	});

	it("summarises the chat's work without notices or agent-sent messages", () => {
		const log = threadWorkLog({
			messages: [{ role: "user", text: "Fix the build" }, { role: "user", text: "PR #3 changed", notice: {} }, { role: "user", text: "keep going", autopilot: true }, { role: "assistant", text: "Fixed; tests pass." }],
			activities: [{ type: "tool", title: "pnpm test", status: "completed" }, { type: "reasoning", title: "Thinking" }, { type: "tool", title: "pnpm lint", status: "failed" }],
		});
		expect(log).toBe("Asked:\n- Fix the build\n\nTool calls:\n- pnpm test\n- pnpm lint (failed)\n\nLast reply:\nFixed; tests pass.");
	});
});
