import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parseReport, proofKind } from "../shared/report";
import { FACTORY_BRANCH_PREFIX } from "../shared/intake";
import { PROOF_FOLDER, stageDefinition } from "../shared/stages";
import type { AgentProfile, FactorySettings, LogLine, ProofFile, Run, RunReport, StageId, WorkItem } from "../shared/types";
import { startClaude } from "./claude";
import { killTree } from "./kill";
import { StringDecoder } from "node:string_decoder";
import { agentEnvironment, onClaudePlan } from "./connections";

/** Runs one stage of one work item with a local agent CLI, in a git worktree of its own. */

export interface RunHandlers {
	log(line: LogLine): void;
	session(sessionId: string): void;
	/** `crashed`: the agent's process ended badly without a report, which is worth carrying on rather than failing. */
	finish(result: { status: Run["status"]; summary?: string; usage?: Run["usage"]; report?: RunReport; crashed?: boolean }): void;
}

/** `raw`: the output as git printed it, for formats where leading spaces mean something. */
export function git(cwd: string, args: string[], raw = false): Promise<string> {
	return new Promise((resolve, reject) => {
		// Never waits on a password prompt nobody can see: a push that needs one fails and says so.
		execFile("git", ["-C", cwd, ...args], { windowsHide: true, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }, (error, stdout, stderr) => {
			if (error) reject(new Error(stderr.trim() || error.message));
			else resolve(raw ? stdout : stdout.trim());
		});
	});
}

function slug(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/**
 * One worktree per work item, reused by every stage so later stages see earlier stages' commits.
 * It never changes a branch of yours: a pull request is checked out under a name of Factory's own unless
 * its branch is one Factory made, and an existing branch is checked out as it is, never reset. `note` says
 * what happened to bring a pull request's worktree up to date, for the run's log.
 */
export async function prepareWorktree(root: string, checkout: string, item: WorkItem): Promise<{ dir: string; branch: string; note?: string }> {
	const dir = path.join(root, `${slug(item.repo)}-${item.number}`);
	const wanted = item.branch ?? `factory/${item.number}-${slug(item.title)}`;
	if (existsSync(dir)) {
		// The branch it really has: it may have been given another name when it was made.
		const current = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "");
		const note = item.kind === "pull" ? await catchUp(dir, item.number) : undefined;
		return { dir, branch: current && current !== "HEAD" ? current : wanted, note };
	}
	await mkdir(root, { recursive: true });
	// A worktree whose folder was deleted still holds its branch until it's pruned.
	await git(checkout, ["worktree", "prune"]).catch(() => undefined);
	if (item.kind === "pull") {
		// A branch can only be checked out once. When Factory fixed the issue this pull request
		// came from, that worktree already holds the branch and its commits, so the work carries on there.
		const holder = await worktreeWith(checkout, wanted);
		if (holder && inside(root, holder.dir)) return { dir: holder.dir, branch: wanted, note: await catchUp(holder.dir, item.number) };
		// Someone else's branch name (main, a fork's patch-1, a branch of yours) is never used for the local
		// branch: Factory works on factory/pr-N. Fixes still go to the pull request's own branch when pushed.
		const branch = wanted.startsWith(FACTORY_BRANCH_PREFIX) && !holder ? wanted : await freeBranch(checkout, `factory/pr-${item.number}`);
		if (await branchExists(checkout, branch)) {
			await git(checkout, ["worktree", "add", dir, branch]);
			return { dir, branch, note: await catchUp(dir, item.number) };
		}
		await git(checkout, ["fetch", "origin", `pull/${item.number}/head:${branch}`]);
		await git(checkout, ["worktree", "add", dir, branch]);
		return { dir, branch };
	}
	await git(checkout, ["fetch", "origin"]);
	const head = (await git(checkout, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => "origin/main")) || "origin/main";
	// Never take a branch another worktree has out: a numbered name leaves that work alone.
	const branch = await freeBranch(checkout, wanted);
	// A branch that's already there keeps its commits, such as a fix that hasn't gone up as a pull request yet.
	if (await branchExists(checkout, branch)) await git(checkout, ["worktree", "add", dir, branch]);
	else await git(checkout, ["worktree", "add", "--no-track", "-b", branch, dir, head]);
	return { dir, branch };
}

async function branchExists(checkout: string, branch: string): Promise<boolean> {
	return git(checkout, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).then(() => true, () => false);
}

/**
 * Brings a pull request's worktree up to its latest commits, when that only moves it forward and nothing
 * is uncommitted. Commits here that the pull request doesn't have yet are never thrown away.
 */
async function catchUp(dir: string, number: number): Promise<string | undefined> {
	if (!(await git(dir, ["fetch", "origin", `pull/${number}/head`]).then(() => true, () => false))) return "Couldn't read the pull request's latest commits; working on the ones already here";
	const head = await git(dir, ["rev-parse", "HEAD"]);
	const latest = await git(dir, ["rev-parse", "FETCH_HEAD"]);
	if (head === latest) return undefined;
	const behind = await git(dir, ["merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD"]).then(() => true, () => false);
	if (!behind) return "This worktree has commits the pull request doesn't, so it was left as it is";
	if ((await changedFiles(dir)).length) return "The pull request has new commits, but this worktree has uncommitted changes, so it was left as it is";
	await git(dir, ["merge", "--ff-only", "FETCH_HEAD"]);
	return `Brought up to date with the pull request's latest commit, ${latest.slice(0, 7)}`;
}

const inside = (root: string, dir: string) => path.resolve(dir).toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep);

/** The worktree that has a branch checked out, if one does and it's still there. */
async function worktreeWith(checkout: string, branch: string): Promise<{ dir: string; clone: boolean } | null> {
	const list = await git(checkout, ["worktree", "list", "--porcelain"]).catch(() => "");
	const clone = path.resolve(checkout).toLowerCase();
	for (const entry of list.split(/\r?\n\r?\n/)) {
		const dir = entry.match(/^worktree (.+)$/m)?.[1];
		if (!dir || !entry.split(/\r?\n/).includes(`branch refs/heads/${branch}`)) continue;
		if (path.resolve(dir).toLowerCase() === clone || existsSync(dir)) return { dir: path.normalize(dir), clone: path.resolve(dir).toLowerCase() === clone };
	}
	return null;
}

/** The branch name, or the first numbered one after it, that no worktree has checked out. */
async function freeBranch(checkout: string, wanted: string): Promise<string> {
	for (let attempt = 1; ; attempt++) {
		const name = attempt === 1 ? wanted : `${wanted}-${attempt}`;
		if (!(await worktreeWith(checkout, name))) return name;
	}
}

export function proofDir(worktree: string, runId: string): string {
	return path.join(worktree, ...PROOF_FOLDER.split("/"), runId);
}

/** Makes the run's proof folder and keeps `.factory/` out of git, without touching the repository's .gitignore. */
export async function prepareProof(worktree: string, runId: string): Promise<string> {
	const dir = proofDir(worktree, runId);
	await mkdir(dir, { recursive: true });
	const exclude = path.resolve(worktree, await git(worktree, ["rev-parse", "--git-path", "info/exclude"]));
	const current = await readFile(exclude, "utf8").catch(() => "");
	if (!current.split(/\r?\n/).includes(".factory/")) {
		await mkdir(path.dirname(exclude), { recursive: true });
		await appendFile(exclude, `${current && !current.endsWith("\n") ? "\n" : ""}.factory/\n`);
	}
	return dir;
}

const MAX_PROOF_FILES = 40;

export async function collectProof(dir: string): Promise<Omit<ProofFile, "caption">[]> {
	const names = await readdir(dir).catch(() => [] as string[]);
	const files: Omit<ProofFile, "caption">[] = [];
	for (const name of names.sort()) {
		const info = await stat(path.join(dir, name)).catch(() => null);
		if (info?.isFile()) files.push({ name, kind: proofKind(name), bytes: info.size });
		if (files.length === MAX_PROOF_FILES) break;
	}
	return files;
}

/** Tracked or new files a run changed outside its proof folder. */
export async function changedFiles(worktree: string): Promise<string[]> {
	// Raw: each line starts with two status columns, and the first is often a space.
	const status = await git(worktree, ["status", "--porcelain", "--untracked-files=all"], true).catch(() => "");
	return status.split("\n").map((line) => line.slice(3).trim()).filter((file) => file && !file.startsWith(".factory/"));
}

const SAFE_MODEL = /^[\w.:/-]*$/;
/** Effort levels go on a shell command line too, so only plain words. */
const SAFE_EFFORT = /^[a-z]+$/;
const SAFE_SESSION = /^[\w-]+$/;

/** What an agent's runs add to the environment: the hub's address when it bills through the hub. */
export function agentVariables(agent: AgentProfile, settings: FactorySettings): Record<string, string> {
	if (agent.billing !== "hub") return {};
	return agent.harness === "claude" ? { ANTHROPIC_BASE_URL: settings.hubUrl } : { OPENAI_BASE_URL: `${settings.hubUrl.replace(/\/$/, "")}/v1` };
}

/** The Codex command line. `chat`: a conversation, which reads like a read-only stage. Claude runs through the Agent SDK instead. */
export function commandFor(agent: AgentProfile, stage: StageId | "chat", resume?: string): { command: string; args: string[] } {
	if (agent.harness !== "codex") throw new Error(agent.harness === "claude" ? "Claude runs through the Agent SDK" : "Phaseo API agents are not wired up yet");
	if (!SAFE_MODEL.test(agent.model)) throw new Error(`Unsupported model id: ${agent.model}`);
	if (agent.effort && !SAFE_EFFORT.test(agent.effort)) throw new Error(`Unsupported effort: ${agent.effort}`);
	if (resume && !SAFE_SESSION.test(resume)) throw new Error("Unsupported session id");
	const access = stage === "chat" ? "read" : stageDefinition(stage).access;
	const sandbox = access === "read" ? "read-only" : "workspace-write";
	const model = [...(agent.model ? ["--model", agent.model] : []), ...(agent.effort ? ["-c", `model_reasoning_effort=${agent.effort}`] : [])];
	// `exec resume` has no --sandbox flag; the config override does the same.
	const args = resume
		? ["exec", "resume", "--json", "-c", `sandbox_mode=${sandbox}`, ...model, resume, "-"]
		: ["exec", "--json", "--sandbox", sandbox, ...model, "-"];
	return { command: "codex", args };
}

function brief(value: unknown): string {
	if (!value || typeof value !== "object") return "";
	const input = value as Record<string, unknown>;
	const text = input.file_path ?? input.path ?? input.pattern ?? input.command ?? input.url ?? input.description;
	return typeof text === "string" ? text.slice(0, 160) : "";
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ParsedLine {
	lines: LogLine[];
	usage?: Run["usage"];
	/** Claude: the text of a finished turn. */
	result?: string;
	sessionId?: string;
	/** Claude: the turn ended in an error (a usage limit, the turn limit, the API failing), and why. */
	failed?: string;
}

/** Turns one Agent SDK message from Claude, or one `--json` event from Codex, into log lines. */
export function parseEvent(harness: AgentProfile["harness"], event: Json, at = Date.now()): ParsedLine {
	const lines: LogLine[] = [];
	if (harness === "claude") {
		if (event.type === "system" && event.subtype === "init") return { lines: [{ at, kind: "info", text: `Session started on ${event.model ?? "the default model"}` }], sessionId: typeof event.session_id === "string" ? event.session_id : undefined };
		if (event.type === "assistant") {
			for (const block of (event.message?.content ?? []) as Json[]) {
				if (block.type === "text" && block.text?.trim()) lines.push({ at, kind: "text", text: block.text.trim() });
				if (block.type === "tool_use") lines.push({ at, kind: "tool", text: `${block.name} ${brief(block.input)}`.trim() });
			}
		}
		if (event.type === "result") {
			const usage = event.usage ?? {};
			const failed = event.is_error || (event.subtype && event.subtype !== "success");
			const why = typeof event.result === "string" && event.result ? event.result : Array.isArray(event.errors) && event.errors.length ? event.errors.join("; ") : "The run failed";
			return {
				failed: failed ? why : undefined,
				lines: [{ at, kind: failed ? "error" : "result", text: failed ? why : `Finished in ${event.num_turns ?? "?"} turns` }],
				usage: { inputTokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0), outputTokens: usage.output_tokens ?? 0, costUsd: event.total_cost_usd },
				result: typeof event.result === "string" ? event.result : "",
			};
		}
		return { lines };
	}
	if (event.type === "thread.started" && typeof event.thread_id === "string") return { lines: [{ at, kind: "info", text: "Session started" }], sessionId: event.thread_id };
	const item = event.item as Json | undefined;
	if (event.type === "item.completed" && item) {
		if (item.type === "agent_message" && item.text) lines.push({ at, kind: "text", text: String(item.text).trim() });
		if (item.type === "command_execution") lines.push({ at, kind: "tool", text: `Run ${item.command ?? ""}`.trim() });
		if (item.type === "file_change") lines.push({ at, kind: "tool", text: `Edit ${(item.changes ?? []).map((change: Json) => change.path).join(", ")}` });
	}
	if (event.type === "turn.completed" && event.usage) return { lines, usage: { inputTokens: event.usage.input_tokens ?? 0, outputTokens: event.usage.output_tokens ?? 0 } };
	if (event.type === "turn.failed" || event.type === "error") lines.push({ at, kind: "error", text: String(event.error?.message ?? event.message ?? "The run failed") });
	return { lines };
}

/** One line a CLI printed: JSON events go to parseEvent, anything else is shown as it is. */
export function parseLine(harness: AgentProfile["harness"], raw: string, at = Date.now()): ParsedLine {
	let event: Json;
	try {
		event = JSON.parse(raw) as Json;
	} catch {
		return raw.trim() ? { lines: [{ at, kind: "info", text: raw.trim() }] } : { lines: [] };
	}
	return parseEvent(harness, event, at);
}

/** Splits what a process prints into lines, holding back a line until it ends. */
export function lineReader(take: (line: string) => void): { push(chunk: Buffer | string): void; flush(): void } {
	let buffer = "";
	// A character can be split across two chunks; the decoder holds its first bytes until the rest arrive.
	const decoder = new StringDecoder("utf8");
	return {
		push(chunk) {
			buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
			let newline = buffer.indexOf("\n");
			while (newline >= 0) {
				take(buffer.slice(0, newline));
				buffer = buffer.slice(newline + 1);
				newline = buffer.indexOf("\n");
			}
		},
		flush() {
			buffer += decoder.end();
			if (buffer.trim()) take(buffer);
			buffer = "";
		},
	};
}

/**
 * Codex logs its own start-up trouble to stderr: MCP servers that want signing in, a skill file it can't
 * read. None of it is about the run, so those lines stay out of the log; anything else it prints shows.
 */
const CODEX_NOISE = /^\d{4}-\d\d-\d\dT[\d:.]+Z\s+(?:ERROR|WARN|INFO)\s+(?:rmcp::|codex_core::session::session: failed to load skill|codex_core::mcp|codex_rmcp_client::)/;

export function withoutNoise(harness: AgentProfile["harness"], text: string): string {
	if (harness !== "codex") return text;
	return text.split(/\r?\n/).filter((line) => !CODEX_NOISE.test(line.trim())).join("\n");
}

export { killTree };

export interface AgentProcess {
	/** The agent's process, once it has started. */
	child(): ChildProcess | undefined;
	/** Hands a message to the agent now. False when the harness can only take it after the turn. */
	send(text: string): boolean;
	/** Ends it, even before its process has started: then it never starts. */
	stop(): void;
}

/**
 * Starts an agent on a prompt. Claude goes through the Agent SDK and takes messages while it works;
 * Codex gets the prompt on stdin and takes messages only between turns.
 */
export function launchAgent(input: {
	agent: AgentProfile; stage: StageId | "chat"; cwd: string; settings: FactorySettings; prompt: string; resume?: string;
	variables?: Record<string, string>;
	handlers: {
		parsed(parsed: ParsedLine): void;
		stderr(text: string): void;
		exit(code: number | null, signal: NodeJS.Signals | null, error?: string): void;
	};
}): AgentProcess {
	const { agent, stage, cwd, settings, prompt, resume, handlers } = input;
	const base = agentEnvironment({ ...agentVariables(agent, settings), ...input.variables });
	const env = agent.harness === "claude" && agent.billing === "subscription" ? onClaudePlan(base) : base;
	if (agent.harness === "claude") {
		return startClaude({
			agent, stage, cwd, prompt, resume, env,
			handlers: { message: (message) => handlers.parsed(parseEvent("claude", message as Json)), stderr: handlers.stderr, exit: ({ code, signal, error }) => handlers.exit(code, signal, error) },
		});
	}
	const { command, args } = commandFor(agent, stage, resume);
	// The prompt goes in on stdin, so nothing the issue author wrote reaches the shell.
	const child = spawn(command, args, { cwd, shell: true, windowsHide: true, env });
	const reader = lineReader((line) => handlers.parsed(parseLine(agent.harness, line)));
	child.stdout?.on("data", (chunk: Buffer) => reader.push(chunk));
	child.stderr?.on("data", (chunk: Buffer) => handlers.stderr(chunk.toString()));
	child.on("error", (error) => handlers.exit(null, null, error.message));
	child.on("close", (code, signal) => {
		reader.flush();
		handlers.exit(code, signal);
	});
	child.stdin?.end(prompt);
	return { child: () => child, send: () => false, stop: () => killTree(child) };
}

export function startAgent(input: {
	agent: AgentProfile; stage: StageId; cwd: string; proof: string; settings: FactorySettings; prompt: string; resume?: string;
	/** Files already changed before the run, so a read-only stage isn't blamed for them. */
	changedBefore: string[];
	handlers: RunHandlers;
}): AgentProcess {
	const { agent, stage, cwd, proof, settings, prompt, resume, changedBefore, handlers } = input;
	let usage: Run["usage"];
	let lastText: string | undefined;
	let lastError: string | undefined;
	let failedTurn: string | undefined;
	let stoppedOnPurpose = false;
	let finished = false;
	const finish: RunHandlers["finish"] = (result) => {
		if (finished) return;
		finished = true;
		handlers.finish(result);
	};
	const agentProcess = launchAgent({
		agent, stage, cwd, settings, prompt, resume, variables: { FACTORY_PROOF_DIR: proof },
		handlers: {
			parsed(parsed) {
				for (const line of parsed.lines) {
					if (line.kind === "text") lastText = line.text;
					handlers.log(line);
				}
				if (parsed.sessionId) handlers.session(parsed.sessionId);
				// Claude reports each turn, and its cost so far; add up the tokens.
				if (parsed.usage) usage = { inputTokens: (usage?.inputTokens ?? 0) + parsed.usage.inputTokens, outputTokens: (usage?.outputTokens ?? 0) + parsed.usage.outputTokens, costUsd: parsed.usage.costUsd ?? usage?.costUsd };
				if (parsed.result) lastText = parsed.result;
				// A later turn that worked (after a message, say) makes up for one that didn't.
				if (parsed.result !== undefined) failedTurn = parsed.failed;
			},
			stderr(chunk) {
				const text = withoutNoise(agent.harness, chunk).trim();
				if (!text) return;
				lastError = text.split(/\r?\n/).at(-1);
				handlers.log({ at: Date.now(), kind: "error", text: text.slice(0, 2_000) });
			},
			exit(code, signal, error) {
				// Stopped on purpose: however its process ended, that's not an error to report.
				if (signal || stoppedOnPurpose) return finish({ status: "cancelled", usage });
				// The process never started.
				if (code === null) return finish({ status: "failed", summary: error ?? `${agent.label} didn't start` });
				lastError ??= error;
				void (async () => {
					const report = parseReport(lastText, await collectProof(proof));
					const summary = report.summary ?? lastText?.slice(0, 240);
					if (code !== 0) {
						// A failure always says why, even when the agent printed nothing of its own.
						// Windows reports a killed process as 4294967295: the same -1, unsigned.
						const shown = code > 0x7fffffff ? code - 0x100000000 : code;
						const reason = summary ?? `${agent.label} stopped with exit code ${shown}${lastError ? `: ${lastError.slice(0, 200)}` : " without printing anything"}`;
						handlers.log({ at: Date.now(), kind: "error", text: reason });
						return finish({ status: "failed", summary: reason, usage, report, crashed: !report.verdict });
					}
					// Claude Code exits cleanly even when its last turn failed. Without a verdict, that's a failed run, not a pass.
					if (failedTurn && !report.verdict) {
						handlers.log({ at: Date.now(), kind: "error", text: `${agent.label} couldn't finish: ${failedTurn.slice(0, 300)}` });
						return finish({ status: "failed", summary: `${agent.label} couldn't finish: ${failedTurn.slice(0, 200)}`, usage, report });
					}
					// Stages that shouldn't edit code are held to it, whatever the harness allowed.
					if (stageDefinition(stage).access !== "write") {
						const changed = (await changedFiles(cwd)).filter((file) => !changedBefore.includes(file));
						if (changed.length) return finish({ status: "failed", summary: `Changed files it shouldn't have: ${changed.slice(0, 5).join(", ")}`, usage, report });
					}
					finish({ status: "succeeded", summary, usage, report });
				})();
			},
		},
	});
	return {
		...agentProcess,
		stop() {
			stoppedOnPurpose = true;
			agentProcess.stop();
		},
	};
}
