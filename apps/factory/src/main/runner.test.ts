import { describe, expect, it } from "vitest";
import { DEMO_AGENTS, DEMO_SETTINGS } from "../shared/demo";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { WorkItem } from "../shared/types";
import { mkdir, writeFile } from "node:fs/promises";
import { claudeOptions, userTurn } from "./claude";
import { onClaudePlan } from "./connections";
import { commandFor, git, parseEvent, parseLine, prepareWorktree, startAgent, withoutNoise } from "./runner";

describe("parseLine", () => {
	it("reads Claude's Agent SDK messages", () => {
		const init = parseLine("claude", JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-5-5", session_id: "abc-123" }), 1);
		expect(init.lines).toEqual([{ at: 1, kind: "info", text: "Session started on claude-opus-5-5" }]);
		expect(init.sessionId).toBe("abc-123");
		const assistant = parseLine("claude", JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Looking at it." }, { type: "tool_use", name: "Read", input: { file_path: "src/a.ts" } }] } }), 2);
		expect(assistant.lines).toEqual([{ at: 2, kind: "text", text: "Looking at it." }, { at: 2, kind: "tool", text: "Read src/a.ts" }]);
		const result = parseLine("claude", JSON.stringify({ type: "result", num_turns: 4, result: "Done.\nSummary: Fixed it.", total_cost_usd: 0.42, usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 } }), 3);
		expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 5, costUsd: 0.42 });
		expect(result.result).toBe("Done.\nSummary: Fixed it.");
		// A run that ran out of turns says so, rather than finishing quietly.
		expect(parseEvent("claude", { type: "result", subtype: "error_max_turns", is_error: true, num_turns: 50, errors: ["Reached the turn limit"] }, 4)).toMatchObject({ failed: "Reached the turn limit", lines: [{ at: 4, kind: "error", text: "Reached the turn limit" }] });
		expect(parseEvent("claude", { type: "result", num_turns: 2, result: "Done." }).failed).toBeUndefined();
	});

	it("reads Codex --json events", () => {
		expect(parseLine("codex", JSON.stringify({ type: "thread.started", thread_id: "t-1" })).sessionId).toBe("t-1");
		expect(parseLine("codex", JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "pnpm test" } }), 1).lines).toEqual([{ at: 1, kind: "tool", text: "Run pnpm test" }]);
		expect(parseLine("codex", JSON.stringify({ type: "turn.completed", usage: { input_tokens: 7, output_tokens: 3 } })).usage).toEqual({ inputTokens: 7, outputTokens: 3 });
		expect(parseLine("codex", JSON.stringify({ type: "turn.failed", error: { message: "rate limited" } }), 4).lines).toEqual([{ at: 4, kind: "error", text: "rate limited" }]);
	});

	it("keeps plain text lines and drops blank ones", () => {
		expect(parseLine("codex", "warming up", 5).lines).toEqual([{ at: 5, kind: "info", text: "warming up" }]);
		expect(parseLine("claude", "   ").lines).toEqual([]);
	});
});

describe("claudeOptions", () => {
	const [opus] = DEMO_AGENTS;

	it("keeps Claude Code's own system prompt and settings, and resumes sessions", () => {
		const options = claudeOptions(opus, "fix");
		expect(options.systemPrompt).toEqual({ type: "preset", preset: "claude_code" });
		expect(options.settingSources).toEqual(["user", "project", "local"]);
		expect(options).toMatchObject({ permissionMode: "acceptEdits", allowedTools: ["Bash", "PowerShell"] });
		expect(claudeOptions(opus, "fix", "abc-123").resume).toBe("abc-123");
		expect(() => claudeOptions(opus, "fix", "abc; rm -rf /")).toThrow("Unsupported session id");
		expect(userTurn("hi")).toEqual({ type: "user", message: { role: "user", content: [{ type: "text", text: "hi" }] }, parent_tool_use_id: null });
	});

	it("lets run stages run commands but not edit, and read stages and chats only read", () => {
		expect(claudeOptions(opus, "verify").disallowedTools).toEqual(["Edit", "NotebookEdit"]);
		expect(claudeOptions(opus, "triage").disallowedTools).toEqual(["Edit", "Write", "NotebookEdit", "Bash", "PowerShell", "Monitor"]);
		expect(claudeOptions(opus, "chat").disallowedTools).toEqual(["Edit", "Write", "NotebookEdit", "Bash", "PowerShell", "Monitor"]);
	});
});

describe("agent environment and logs", () => {
	it("runs Claude on the plan it's signed in with, whatever API settings are around", () => {
		const env = onClaudePlan({ ANTHROPIC_API_KEY: "k", ANTHROPIC_AUTH_TOKEN: "t", ANTHROPIC_BASE_URL: "http://127.0.0.1:8317", CLAUDE_CONFIG_DIR: "C:/claude", PATH: "x" });
		expect(env).toEqual({ CLAUDE_CONFIG_DIR: "C:/claude", PATH: "x" });
	});

	it("leaves Codex's start-up chatter out of the log, and keeps real errors", () => {
		const stderr = [
			"2026-10-27T09:27:13.536754Z ERROR codex_core::session::session: failed to load skill E:/CodexHome/skills/x/SKILL.md: missing YAML",
			"2026-10-27T09:27:17.548775Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired",
			"stream error: rate limited, retrying",
		].join("\n");
		expect(withoutNoise("codex", stderr)).toBe("stream error: rate limited, retrying");
		expect(withoutNoise("claude", stderr)).toBe(stderr);
	});
});

describe("commandFor", () => {
	const [opus, , codex] = DEMO_AGENTS;

	it("runs Codex read-only for read stages, and leaves Claude to the Agent SDK", () => {
		expect(commandFor(codex, "triage").args).toContain("read-only");
		expect(commandFor(codex, "verify").args).toContain("workspace-write");
		expect(() => commandFor(opus, "fix")).toThrow("Claude runs through the Agent SDK");
	});

	it("resumes Codex sessions with the sandbox as a config override", () => {
		expect(commandFor(codex, "fix", "t-1").args).toEqual(["exec", "resume", "--json", "-c", "sandbox_mode=workspace-write", "--model", "gpt-5.5-codex", "t-1", "-"]);
		expect(() => commandFor(codex, "fix", "t-1; rm -rf /")).toThrow("Unsupported session id");
	});
});

// Each test makes real clones and worktrees, which is slow on Windows when other tests run alongside.
describe("prepareWorktree", { timeout: 30_000 }, () => {
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

describe("startAgent", () => {
	it("says why a run failed when the agent exits without printing anything", async () => {
		const base = await mkdtemp(path.join(os.tmpdir(), "factory-agent-"));
		const bin = path.join(base, "bin");
		await mkdir(bin);
		// A stand-in codex on PATH that exits 3 and says nothing.
		if (process.platform === "win32") await writeFile(path.join(bin, "codex.cmd"), "@exit /b 3\r\n");
		else await writeFile(path.join(bin, "codex"), "#!/bin/sh\nexit 3\n", { mode: 0o755 });
		const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
		const before = process.env[pathKey];
		process.env[pathKey] = `${bin}${path.delimiter}${before}`;
		try {
			const codex = DEMO_AGENTS.find((agent) => agent.harness === "codex")!;
			const finished = await new Promise<{ status: string; summary?: string }>((resolve) => {
				startAgent({ agent: codex, stage: "review", cwd: base, proof: path.join(base, "proof"), settings: DEMO_SETTINGS, prompt: "Review", changedBefore: [], handlers: { log: () => undefined, session: () => undefined, finish: resolve } });
			});
			expect(finished.status).toBe("failed");
			expect(finished.summary).toBe(`${codex.label} stopped with exit code 3 without printing anything`);
		} finally {
			process.env[pathKey] = before;
			await rm(base, { recursive: true, force: true });
		}
	});
});

describe("installed app", () => {
	it("runs the Claude Code the SDK ships with from beside app.asar, where packaging unpacks it", async () => {
		const { unpacked } = await import("./claude");
		expect(unpacked(String.raw`C:\Program Files\Phaseo Factory\resources\app.asar\node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe`)).toBe(String.raw`C:\Program Files\Phaseo Factory\resources\app.asar.unpacked\node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe`);
		expect(unpacked("/Applications/Phaseo Factory.app/Contents/Resources/app.asar/node_modules/x/claude")).toBe("/Applications/Phaseo Factory.app/Contents/Resources/app.asar.unpacked/node_modules/x/claude");
		// Running from source: nothing to change.
		expect(unpacked(String.raw`E:\repo\node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe`)).toBe(String.raw`E:\repo\node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe`);
	});
});
