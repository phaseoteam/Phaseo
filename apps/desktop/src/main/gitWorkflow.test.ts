import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanCommitMessage, commitChanges, commitMessagePrompt, generateCommitMessage, gitInit, gitPull, publishRepository } from "./gitWorkflow";
import { gitCommand } from "./gitOperations";
import { pushesToDefaultBranch, validatePublishRepository, repositoryNameFrom } from "../shared/gitWorkflow";

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
function fixture() {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-git-workflow-")); folders.push(directory);
	const git = (args: string[], cwd: string) => execFileSync("git", args, { cwd, windowsHide: true, stdio: "pipe" }).toString().trim();
	const repository = (name: string) => { const root = path.join(directory, name); mkdirSync(root); git(["init", "-b", "main"], root); git(["config", "user.name", "Fixture"], root); git(["config", "user.email", "fixture@example.invalid"], root); git(["config", "commit.gpgsign", "false"], root); return root; };
	return { directory, git, repository };
}

describe("commit messages", () => {
	it("cleans model replies", () => {
		expect(cleanCommitMessage("```\nSubject: Add dark mode toggle.\n\n- Adds a setting\n```")).toBe("Add dark mode toggle\n\n- Adds a setting");
		expect(cleanCommitMessage("\n\"Fix login\"\n")).toBe("Fix login");
		expect(cleanCommitMessage("x".repeat(90))).toHaveLength(72);
		expect(() => cleanCommitMessage("  ")).toThrow("did not write");
	});

	it("reads staged changes, or every change when nothing is staged", async () => {
		const { repository } = fixture(), root = repository("repo");
		writeFileSync(path.join(root, "a.txt"), "one\n"); execFileSync("git", ["add", "a.txt"], { cwd: root }); execFileSync("git", ["commit", "-m", "First"], { cwd: root });
		writeFileSync(path.join(root, "a.txt"), "two\n"); writeFileSync(path.join(root, "b.txt"), "new\n");
		expect((await commitChanges(root)).summary).toContain("?? b.txt");
		execFileSync("git", ["add", "a.txt"], { cwd: root });
		const staged = await commitChanges(root);
		expect(staged).toMatchObject({ branch: "main", summary: "M\ta.txt\n" }); expect(staged.patch).toContain("+two");
		const prompts: string[] = [];
		expect(await generateCommitMessage(root, async input => { prompts.push(input.user); return { reply: "Update a.txt" }; })).toBe("Update a.txt");
		expect(prompts[0]).toContain("Branch: main");
		expect(commitMessagePrompt({ branch: "", summary: "", patch: "x".repeat(50_000) }).user).toContain("[truncated]");
	});
});

describe("Git workflow", () => {
	it("commits everything and pushes in one step, then pulls on a second clone", async () => {
		const { directory, git, repository } = fixture(), root = repository("repo"), remote = path.join(directory, "remote.git");
		git(["init", "--bare", "-b", "main", remote], directory); git(["remote", "add", "origin", remote], root);
		writeFileSync(path.join(root, "a.txt"), "one\n");
		await expect(gitCommand(root, { type: "commit", message: "First" })).rejects.toThrow("Stage changes");
		const review = await gitCommand(root, { type: "commit", message: "First", all: true, push: true });
		expect(review.upstream).toMatchObject({ name: "origin/main", ahead: 0 });
		expect(git(["log", "--format=%s", "main"], remote)).toBe("First");
		const clone = path.join(directory, "clone"); git(["clone", remote, clone], directory);
		writeFileSync(path.join(root, "a.txt"), "two\n"); await gitCommand(root, { type: "commit", message: "Second", all: true, push: true });
		await gitCommand(clone, { type: "pull" });
		expect(git(["log", "-1", "--format=%s"], clone)).toBe("Second");
	}, 30000);

	it("refuses to pull without an upstream", async () => {
		const { repository } = fixture(), root = repository("repo");
		writeFileSync(path.join(root, "a.txt"), "one\n"); await gitCommand(root, { type: "commit", message: "First", all: true });
		await expect(gitPull(root)).rejects.toThrow("no upstream");
	});

	it("initialises a plain folder once", async () => {
		const { directory } = fixture(), root = path.join(directory, "plain"); mkdirSync(root);
		expect((await gitInit(root)).files).toEqual([]);
		await expect(gitInit(root)).rejects.toThrow("already");
	});

	it("publishes through gh api pinned to github.com, adds origin and pushes", async () => {
		const { repository } = fixture(), root = repository("repo");
		writeFileSync(path.join(root, "a.txt"), "one\n"); await gitCommand(root, { type: "commit", message: "First", all: true });
		const calls: string[][] = [];
		const gh = async (_root: string, args: string[]) => {
			calls.push(args);
			if (args.at(-1) === "user") return JSON.stringify({ login: "octo" });
			if (args.at(-1) === "user/orgs") return JSON.stringify([{ login: "acme" }]);
			return JSON.stringify({ full_name: "acme/tool", clone_url: "https://github.com/acme/tool.git", html_url: "https://github.com/acme/tool" });
		};
		let pushed = 0;
		const result = await publishRepository(root, { name: "tool", owner: "acme", visibility: "private" }, async () => { pushed++; }, gh);
		expect(result).toEqual({ repository: "acme/tool", url: "https://github.com/acme/tool", pushed: true });
		expect(pushed).toBe(1);
		expect(calls.every(args => args[0] === "api" && args[1] === "--hostname" && args[2] === "github.com")).toBe(true);
		expect(calls[2]).toEqual(["api", "--hostname", "github.com", "--method", "POST", "orgs/acme/repos", "-f", "name=tool", "-F", "private=true"]);
		expect(execFileSync("git", ["remote", "get-url", "origin"], { cwd: root }).toString().trim()).toBe("https://github.com/acme/tool.git");
		await expect(publishRepository(root, { name: "tool", visibility: "public" }, async () => {}, gh)).rejects.toThrow("already has a remote");
	});

	it("validates publish requests", () => {
		expect(validatePublishRepository({ name: "my-tool", visibility: "public", description: " A tool " })).toEqual({ name: "my-tool", visibility: "public", description: "A tool" });
		expect(() => validatePublishRepository({ name: "bad name", visibility: "public" })).toThrow("repository name");
		expect(() => validatePublishRepository({ name: "ok", owner: "../x", visibility: "public" })).toThrow("account");
		expect(repositoryNameFrom("My Project!")).toBe("My-Project");
	});
});

describe("pushing to the default branch", () => {
	it("asks only when the checkout is on the remote's default branch", () => {
		expect(pushesToDefaultBranch("main", { branch: "main", defaultBranch: "main" })).toBe(true);
		expect(pushesToDefaultBranch("feature", { branch: "feature", defaultBranch: "main" })).toBe(false);
		// A reading for another branch, or none yet, does not ask on a guess.
		expect(pushesToDefaultBranch("main", { branch: "feature", defaultBranch: "main" })).toBe(false);
		expect(pushesToDefaultBranch("main", undefined)).toBe(false);
		expect(pushesToDefaultBranch(undefined, { branch: "", defaultBranch: "" })).toBe(false);
	});
});
