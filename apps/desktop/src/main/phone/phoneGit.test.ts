import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePhoneFrame, phoneLimits, type DesktopFrame, type PhoneCapability, type PhoneResponse } from "@phaseo/phone-protocol";
import { gitCommand } from "../gitOperations";
import { fakePhoneHost, fakePullRequestView } from "./fakePhoneHost";
import { phoneGitCommand, phonePullRequestAction, phonePullRequestFiles, phonePullRequestView } from "./phoneGit";
import { PhoneHub } from "./phoneSession";

const connected = async (capabilities: PhoneCapability[] = ["code", "changes"]) => {
	const app = fakePhoneHost(), hub = new PhoneHub(app.host), frames: DesktopFrame[] = [];
	app.gitStatuses.set("p1", { branch: "main", files: [{ path: "src/usage.ts", indexStatus: " ", worktreeStatus: "M" }], hasRemote: false });
	let allowed = capabilities;
	hub.capabilitiesOf = () => allowed;
	const session = hub.open({ id: "dev", name: "Daniel's Pixel" }, frame => frames.push(frame));
	let next = 0;
	const ask = async (request: object) => { const id = `r${next++}`; await session.receive(JSON.stringify({ id, ...request })); return frames.find(frame => "id" in frame && frame.id === id) as PhoneResponse; };
	await ask({ type: "hello", deviceId: "dev", appVersion: "1.0.0", protocol: 6 });
	return { app, ask, session, frames, allow: (value: PhoneCapability[]) => { allowed = value; hub.accessChanged("dev"); } };
};
const head = "a".repeat(40);

describe("phone git and pull requests", () => {
	it("refuses every change without Make changes, and every read without Read code, before git runs", async () => {
		const { app, ask, allow } = await connected(["code"]);
		const writes = [
			{ type: "git_action", projectId: "p1", action: "commit", message: "Fix", all: true },
			{ type: "git_action", projectId: "p1", action: "push" },
			{ type: "commit_message", projectId: "p1" },
			{ type: "create_pull_request", projectId: "p1" },
			{ type: "pr_action", projectId: "p1", number: 7, headOid: head, action: { type: "merge", method: "squash" } },
			{ type: "new_chat", projectId: "p1", text: "Try it", mode: "code", workspace: { kind: "worktree", base: "main" } },
		];
		for (const request of writes) expect(await ask(request)).toMatchObject({ ok: false, error: { code: "forbidden", message: "Allow this on the computer: Settings → Phone." } });
		// Make changes without Read code isn't enough: every change answers with the code as it is after.
		allow(["changes"]);
		for (const request of writes) expect(await ask(request)).toMatchObject({ ok: false, error: { code: "forbidden" } });
		for (const request of [{ type: "list_branches", projectId: "p1" }, { type: "list_pull_requests", projectId: "p1" }, { type: "read_pull_request", projectId: "p1", number: 7 }, { type: "pull_request_files", projectId: "p1", number: 7, headOid: head, baseOid: head }]) {
			expect(await ask(request)).toMatchObject({ ok: false, error: { code: "forbidden" } });
		}
		expect(app.git.calls).toEqual([]);
		expect(app.tasks.size).toBe(0);
	});

	it("runs a commit as the window's Git command, notes it in the window, and answers with the status after", async () => {
		const { app, ask } = await connected();
		const answer = await ask({ type: "git_action", projectId: "p1", action: "commit", message: "Fix the usage total", all: true });
		expect(app.git.calls).toEqual([{ kind: "git", projectId: "p1", value: { type: "commit", message: "Fix the usage total", all: true } }]);
		expect(answer).toMatchObject({ ok: true, result: { repository: true, branch: "main", hasRemote: false } });
		expect(app.git.notes).toEqual([{ device: "Daniel's Pixel", summary: "Committed", projectId: "p1" }]);
		// Git's own words come back as the error, and nothing is noted for a change that didn't happen.
		app.git.failure = "Add a remote before pushing.";
		expect(await ask({ type: "git_action", projectId: "p1", action: "push" })).toMatchObject({ ok: false, error: { code: "rejected", message: "Add a remote before pushing." } });
		expect(app.git.notes).toHaveLength(1);
		expect(await ask({ type: "git_action", projectId: "gone", action: "pull" })).toMatchObject({ ok: false, error: { code: "not_found" } });
	});

	it("sends nothing once Make changes goes off while a change runs, but still tells the window it happened", async () => {
		const { app, ask, allow } = await connected();
		let release!: () => void;
		app.git.hold = new Promise(resolve => { release = resolve; });
		const pending = [
			ask({ type: "git_action", projectId: "p1", action: "pull" }),
			ask({ type: "commit_message", projectId: "p1" }),
			ask({ type: "pr_action", projectId: "p1", number: 7, headOid: head, action: { type: "close" } }),
		];
		app.git.pullRequests.set(7, fakePullRequestView(7));
		await Promise.resolve();
		allow(["code"]);
		release();
		for (const answer of await Promise.all(pending)) expect(answer).toMatchObject({ ok: false, error: { code: "forbidden" } });
		expect(app.git.notes.map(note => note.summary)).toEqual(["Pulled", "Closed #7"]);
	});

	it("starts a thread in a new worktree only with Make changes, from the base the phone chose", async () => {
		const { app, ask } = await connected();
		const answer = await ask({ type: "new_chat", projectId: "p1", text: "Try it in a worktree", mode: "code", workspace: { kind: "worktree", base: "origin/main" } });
		expect(answer).toMatchObject({ ok: true });
		expect(app.git.calls).toEqual([{ kind: "worktree", projectId: "p1", value: { projectId: "p1", base: "origin/main", text: "Try it in a worktree" } }]);
		const task = [...app.tasks.values()].at(-1)!;
		expect(task.projectId).toBe("wt-1");
		// The first message is sent to the new chat, as the window sends it; a worktree chat's waits there for the setup.
		expect(app.commands.at(-1)).toEqual({ type: "send", id: task.id, text: "Try it in a worktree" });
		expect(app.git.notes).toEqual([{ device: "Daniel's Pixel", summary: "Started a thread in a new worktree from origin/main", projectId: "p1" }]);
	});

	it("adds the branch's pull request to git status only when asked, from protocol 6", async () => {
		const { app, ask } = await connected();
		app.git.branchPullRequest = { branch: "fix/usage", pullRequest: { repository: "phaseo/phaseo", number: 7, url: "https://github.com/phaseo/phaseo/pull/7", title: "Fix", state: "OPEN", draft: false } };
		expect((await ask({ type: "git_status", projectId: "p1" }) as Extract<PhoneResponse, { ok: true }>).result).not.toHaveProperty("pullRequest");
		expect(app.git.calls).toEqual([]);
		expect(await ask({ type: "git_status", projectId: "p1", pullRequest: true })).toMatchObject({ ok: true, result: { pullRequest: { number: 7, state: "open", draft: false } } });
		// A GitHub that can't be asked is no pull request, not a failed status.
		app.git.failure = "gh: not signed in";
		expect(await ask({ type: "git_status", projectId: "p1", pullRequest: true })).toMatchObject({ ok: true, result: { pullRequest: null, branch: "main" } });
	});

	it("reads pull requests and merges with a method the repository allows, refused once the head moved", async () => {
		const { app, ask } = await connected();
		app.git.pullRequests.set(7, fakePullRequestView(7));
		app.git.mergeMethod = "squash";
		expect(await ask({ type: "list_pull_requests", projectId: "p1" })).toMatchObject({ ok: true, result: { repository: "phaseo/phaseo", pullRequests: [{ number: 7, review: "required" }], limitReached: false } });
		expect(await ask({ type: "read_pull_request", projectId: "p1", number: 7 })).toMatchObject({ ok: true, result: { number: 7, state: "open", mergeMethods: ["squash", "merge"], mergeMethod: "squash", checkRuns: [{ name: "build", status: "passing" }, { name: "lint", status: "failed" }, { name: "deploy", status: "pending" }] } });
		expect(await ask({ type: "pr_action", projectId: "p1", number: 7, headOid: "f".repeat(40), action: { type: "merge", method: "squash" } })).toMatchObject({ ok: false, error: { message: "This pull request changed. It has been refreshed; check it and try again." } });
		expect(await ask({ type: "pr_action", projectId: "p1", number: 7, headOid: head, action: { type: "merge", method: "squash" } })).toMatchObject({ ok: true, result: { state: "merged" } });
		expect(app.git.notes.map(note => note.summary)).toEqual(["Merged #7"]);
		const files = await ask({ type: "pull_request_files", projectId: "p1", number: 7, headOid: head, baseOid: "b".repeat(40) });
		expect(files).toMatchObject({ ok: true, result: { total: 2, files: [{ path: "src/usage.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" }, { path: "assets/big.json", status: "added", truncated: true }] } });
	});

	it("puts a phone's pull request action through the window's validator", () => {
		const parsed = parsePhoneFrame(JSON.stringify({ id: "1", type: "pr_action", projectId: "p1", number: 7, headOid: head.toUpperCase(), action: { type: "review", event: "request-changes", body: "Totals still off." } }));
		if (parsed.type !== "pr_action") throw new Error("parsed");
		expect(phonePullRequestAction(parsed.number, parsed.headOid, parsed.action)).toEqual({ number: 7, headOid: head, action: { type: "review", event: "request-changes", body: "Totals still off." } });
		expect(() => phonePullRequestAction(7, "nope", { type: "close" })).toThrow("Invalid pull request action.");
	});

	it("slims a pull request for a frame: long text cut, activity in order, a merge method only when allowed", () => {
		const long = "x".repeat(phoneLimits.pullRequestTextChars + 50);
		const view = phonePullRequestView(fakePullRequestView(7, { body: long, mergeMethods: ["merge"] }), "squash");
		expect(view.body).toHaveLength(phoneLimits.pullRequestTextChars);
		expect(view.bodyTruncated).toBe(true);
		expect(view.mergeMethod).toBeUndefined();
		expect(view.events.map(event => event.kind)).toEqual(["commit", "comment"]);
		// Thousands of large patches still fit one frame: the rest say they were left out.
		const page = phonePullRequestFiles({ repository: "r", number: 7, headOid: head, baseOid: head, page: 1, total: 100, hasNext: false, limitReached: false, files: Array.from({ length: 100 }, (_, index) => ({ filename: `f${index}.ts`, status: "modified", additions: 1, deletions: 1, blobOid: head, patch: `@@ -1 +1 @@\n${"+y".repeat(10_000)}`, preview: "available" as const })) });
		expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(phoneLimits.frameBytes - 64 * 1024);
		expect(page.files.filter(file => file.truncated).length).toBeGreaterThan(0);
	});
});

describe("phone git commands through the window's own Git command", () => {
	const folders: string[] = [];
	afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
	const repository = () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-phone-git-")); folders.push(root);
		const run = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
		run("init", "-q", "-b", "main"); run("config", "user.email", "test@example.com"); run("config", "user.name", "Test");
		writeFileSync(path.join(root, "a.txt"), "one\n"); run("add", "-A"); run("commit", "-qm", "First");
		return { root, run };
	};
	const frame = (value: object) => { const parsed = parsePhoneFrame(JSON.stringify({ id: "1", type: "git_action", projectId: "p1", ...value })); if (parsed.type !== "git_action") throw new Error("parsed"); return phoneGitCommand(parsed); };

	it("commits everything, and a push with no remote fails with git's reason", async () => {
		const { root, run } = repository();
		writeFileSync(path.join(root, "a.txt"), "two\n");
		await gitCommand(root, frame({ action: "commit", message: "Second", all: true }));
		expect(run("log", "-1", "--format=%s").trim()).toBe("Second");
		await expect(gitCommand(root, frame({ action: "push" }))).rejects.toThrow("Add a remote before pushing.");
		await expect(gitCommand(root, frame({ action: "commit", message: "Nothing" }))).rejects.toThrow("Stage changes before committing.");
	});

	it("creates and switches branches, refusing a switch with uncommitted work", async () => {
		const { root, run } = repository();
		await gitCommand(root, frame({ action: "create-branch", name: "fix/usage" }));
		expect(run("branch", "--show-current").trim()).toBe("fix/usage");
		await gitCommand(root, frame({ action: "switch-branch", name: "main" }));
		writeFileSync(path.join(root, "a.txt"), "dirty\n");
		await expect(gitCommand(root, frame({ action: "switch-branch", name: "fix/usage" }))).rejects.toThrow("Commit or stash working changes before switching branches.");
	});
});
