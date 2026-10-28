import { spawn, type ChildProcess } from "node:child_process";
import { query, type AccountInfo, type EffortLevel, type ModelInfo, type Options, type SDKMessage, type SDKUserMessage, type SpawnOptions, type SpawnedProcess } from "@anthropic-ai/claude-agent-sdk";
import { stageDefinition } from "../shared/stages";
import { killTree } from "./kill";
import type { AgentProfile, StageId } from "../shared/types";

/**
 * Claude runs through the Agent SDK, on the Claude Code it ships with. It keeps Claude Code's own system
 * prompt untouched: Factory's instructions go in the first message, never in the system prompt.
 */

const EFFORTS = new Set<string>(["low", "medium", "high", "xhigh", "max"]);
const SAFE_MODEL = /^[\w.:/-]*$/;
const SAFE_SESSION = /^[\w-]+$/;

/** `chat`: a conversation, which reads like a read-only stage. */
export function claudeOptions(agent: AgentProfile, stage: StageId | "chat", resume?: string): Options {
	if (!SAFE_MODEL.test(agent.model)) throw new Error(`Unsupported model id: ${agent.model}`);
	if (agent.effort && !EFFORTS.has(agent.effort)) throw new Error(`Unsupported effort: ${agent.effort}`);
	if (resume && !SAFE_SESSION.test(resume)) throw new Error("Unsupported session id");
	const access = stage === "chat" ? "read" : stageDefinition(stage).access;
	const options: Options = {
		systemPrompt: { type: "preset", preset: "claude_code" },
		// Everything Claude Code reads when it runs on its own: settings and CLAUDE.md files.
		settingSources: ["user", "project", "local"],
		...(agent.model ? { model: agent.model } : {}),
		...(agent.effort ? { effort: agent.effort as EffortLevel } : {}),
		...(resume ? { resume } : {}),
	};
	if (access === "write") return { ...options, permissionMode: "acceptEdits", allowedTools: ["Bash", "PowerShell"] };
	// Run stages may run commands and save proof; the worktree is checked for edits afterwards.
	if (access === "run") return { ...options, permissionMode: "default", allowedTools: ["Bash", "PowerShell", "Write"], disallowedTools: ["Edit", "NotebookEdit"] };
	// Read stages lose every tool that runs commands or writes, not just the obvious ones.
	return { ...options, permissionMode: "default", disallowedTools: ["Edit", "Write", "NotebookEdit", "Bash", "PowerShell", "Monitor"] };
}

/**
 * In an installed app the SDK sits inside app.asar, and the Claude Code it ships with can't be run from
 * there. Packaging unpacks the SDK's platform package beside it, into app.asar.unpacked: run that copy.
 */
export function unpacked(command: string): string {
	return command.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
}

/** Starts Claude Code for the SDK. Factory does it itself so a stop ends the whole tree, and so an installed app runs the unpacked copy. */
function spawnClaudeCode(onStart?: (child: ChildProcess) => void) {
	return (spawned: SpawnOptions): SpawnedProcess => {
		const child = spawn(unpacked(spawned.command), spawned.args, { cwd: spawned.cwd, env: spawned.env, signal: spawned.signal, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
		onStart?.(child);
		return child as unknown as SpawnedProcess;
	};
}

export function userTurn(text: string): SDKUserMessage {
	return { type: "user", message: { role: "user", content: [{ type: "text", text }] }, parent_tool_use_id: null };
}

/** The messages a run takes: the prompt first, then whatever is sent while it works, until it's closed. */
class Inbox implements AsyncIterable<SDKUserMessage> {
	private queue: SDKUserMessage[] = [];
	private wake: (() => void) | undefined;
	closed = false;

	/** Messages Claude Code hasn't been handed yet. */
	get waiting() {
		return this.queue.length;
	}

	push(text: string) {
		this.queue.push(userTurn(text));
		this.wake?.();
	}

	close() {
		this.closed = true;
		this.wake?.();
	}

	async *[Symbol.asyncIterator]() {
		for (;;) {
			const next = this.queue.shift();
			if (next) yield next;
			else if (this.closed) return;
			else await new Promise<void>((resolve) => (this.wake = resolve));
		}
	}
}

/** What Claude Code says about itself before any prompt: its models, and the sign-in it would use. Null if it doesn't answer in time. */
export async function askClaudeCode(env: NodeJS.ProcessEnv, timeout: number): Promise<{ models: ModelInfo[]; account: AccountInfo } | null> {
	// An inbox that is closed without a message: Claude Code starts, answers, and exits without a turn.
	const inbox = new Inbox();
	const run = query({ prompt: inbox, options: { systemPrompt: { type: "preset", preset: "claude_code" }, env: strings(env), spawnClaudeCodeProcess: spawnClaudeCode() } });
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			Promise.all([run.supportedModels(), run.accountInfo()]).then(([models, account]) => ({ models, account })),
			new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), timeout))),
		]);
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
		inbox.close();
		run.close();
	}
}

function strings(env: NodeJS.ProcessEnv): Record<string, string> {
	return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export interface ClaudeSession {
	/** The Claude Code process, once the SDK has started it. */
	child(): ChildProcess | undefined;
	/** Hands a message to Claude now. False once the run has finished taking messages. */
	send(text: string): boolean;
	/** Ends the session, whether or not Claude Code has started yet. */
	stop(): void;
}

export function startClaude(input: {
	agent: AgentProfile; stage: StageId | "chat"; cwd: string; prompt: string; resume?: string;
	env: NodeJS.ProcessEnv;
	handlers: {
		message(message: SDKMessage): void;
		stderr(text: string): void;
		/** `code` is Claude Code's exit code; `error` is what the SDK said went wrong, if anything. */
		exit(result: { code: number | null; signal: NodeJS.Signals | null; error?: string }): void;
	};
}): ClaudeSession {
	const { agent, stage, cwd, prompt, resume, handlers } = input;
	const inbox = new Inbox();
	let child: ChildProcess | undefined;
	let stopped = false;
	inbox.push(prompt);
	const run = query({
		prompt: inbox,
		options: {
			...claudeOptions(agent, stage, resume),
			cwd,
			env: strings(input.env),
			spawnClaudeCodeProcess: spawnClaudeCode((started) => {
				child = started;
				started.stderr?.on("data", (chunk: Buffer) => handlers.stderr(chunk.toString()));
				// Stopped while the SDK was still getting ready: it ends as soon as it exists.
				if (stopped) killTree(started);
			}),
		},
	});
	void (async () => {
		let error: string | undefined;
		try {
			for await (const message of run) {
				handlers.message(message);
				// Claude Code has every message (it may answer two in one turn): close the inbox so it exits once done.
				if (message.type === "result" && !inbox.waiting) inbox.close();
			}
		} catch (caught) {
			error = caught instanceof Error ? caught.message : String(caught);
		}
		inbox.close();
		const claude = child;
		if (claude && claude.exitCode === null && claude.signalCode === null) await new Promise((resolve) => {
			// A process that never started has no exit to wait for.
			claude.once("exit", resolve);
			claude.once("error", resolve);
		});
		handlers.exit({ code: claude?.exitCode ?? (error ? 1 : 0), signal: claude?.signalCode ?? null, error });
	})();
	return {
		child: () => child,
		send(text) {
			if (inbox.closed) return false;
			inbox.push(text);
			return true;
		},
		stop() {
			stopped = true;
			inbox.close();
			if (child) killTree(child);
			else run.close();
		},
	};
}
