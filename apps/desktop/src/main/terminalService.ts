import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node-pty";
import type { IPty } from "node-pty";
import type { TerminalCommand, TerminalEvent, TerminalSession } from "../shared/workspace";
import type { WorkspaceStore } from "./workspaceStore";
import { validateTerminalAuth, type TerminalAuthentication, type TerminalAuthRequest } from "./terminalAuth";
import { settingsProject, type ProjectScript } from "../shared/projectSettings";
import { readProcessTable, shellIsBusy, type ProcessRow } from "./terminalProcesses";

/** `activity` counts output and input, so a close check notices a command typed while it ran. */
type Entry = { pty: IPty; session: TerminalSession; pending: string; activity: number; timer?: ReturnType<typeof setTimeout>; settle?: (error?: Error) => void };

export class TerminalService {
	private readonly running = new Map<string, Entry>();
	/** Terminals closed because their chat settled: their transcripts go with them. */
	private readonly discarding = new Set<string>();
	private closed = false;
	onEvent: (event: TerminalEvent) => void = () => {};
	constructor(private readonly store: WorkspaceStore, private readonly directory: string, private readonly spawnPty = spawn, private readonly processTable: () => Promise<ProcessRow[]> = readProcessTable) {}
	get(): TerminalSession[] { return [...this.running.values()].filter(value => value.session.ephemeral).map(value => ({ ...value.session })).concat(this.store.getTerminals()); }
	/** Each running terminal's shell PID with its title and chat, for Settings → Diagnostics. */
	processOwners(): { pid: number; title: string; taskId?: string; projectId?: string }[] {
		return [...this.running.values()].flatMap(entry => Number.isInteger(entry.pty.pid) && entry.pty.pid > 0 ? [{ pid: entry.pty.pid, title: entry.session.title, ...(entry.session.taskId ? { taskId: entry.session.taskId } : {}), ...(entry.session.projectId ? { projectId: entry.session.projectId } : {}) }] : []);
	}
	authenticate(request: TerminalAuthRequest, signal: AbortSignal): TerminalAuthentication {
		if (this.closed || signal.aborted) throw new Error("Native sign-in cancelled.");
		if (this.running.size >= 10) throw new Error("Close a terminal before signing in.");
		validateTerminalAuth(request);
		const session: TerminalSession = { id: randomUUID(), projectId: request.projectId, taskId: request.taskId, title: request.title.slice(0, 200), cwd: request.cwd, output: "", ephemeral: true, status: "running", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
		let resolve!: () => void; let reject!: (error: Error) => void; const completed = new Promise<void>((accept, decline) => { resolve = accept; reject = decline; });
		const entry = this.start(session, request.agent.executable, [...request.agent.arguments, ...request.args], { ...process.env, ...request.env, ELECTRON_RUN_AS_NODE: "1" });
		const abort = () => { this.flush(session.id); this.running.delete(session.id); session.output = ""; session.status = "interrupted"; this.onEvent({ sessionId: session.id, session }); entry.settle?.(new Error("Native sign-in cancelled.")); try { entry.pty.kill(); } catch { /* The native process may already have exited. */ } };
		const timeout = setTimeout(abort, 10 * 60 * 1000);
		entry.settle = error => { clearTimeout(timeout); signal.removeEventListener("abort", abort); if (error) reject(error); else resolve(); };
		signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
		return { session, completed };
	}
	private start(session: TerminalSession, executable: string, args: string[], env: NodeJS.ProcessEnv) {
		const pty = this.spawnPty(executable, args, { name: "xterm-256color", cwd: session.cwd, cols: 100, rows: 30, env });
		const entry: Entry = { pty, session, pending: "", activity: 0 };
		this.running.set(session.id, entry); if (!session.ephemeral) this.store.saveTerminal(session); this.onEvent({ sessionId: session.id, session });
		pty.onData(data => { if (this.closed || !this.running.has(session.id)) return; entry.activity++; entry.pending = (entry.pending + data).slice(-1024 * 1024); entry.timer ??= setTimeout(() => this.flush(session.id), 100); });
		pty.onExit(({ exitCode }) => {
			if (this.closed || !this.running.has(session.id)) return;
			this.flush(session.id); session.status = "exited"; session.exitCode = exitCode;
			if (!session.ephemeral) this.store.saveTerminal(session); else session.output = "";
			if (this.discarding.delete(session.id)) this.store.deleteTerminal(session.id);
			this.running.delete(session.id); this.onEvent({ sessionId: session.id, session }); entry.settle?.(exitCode === 0 ? undefined : new Error("Native sign-in ended without completing."));
		});
		return entry;
	}
	/** A shell in a project (and chat), running a project script when one is given, as T3's script terminals do. */
	private open(projectId: string | undefined, taskId: string | undefined, script?: ProjectScript) {
		if (this.running.size >= 10 || this.store.getTerminals().length >= 50) throw new Error("Close a terminal or delete an old transcript first.");
		const project = projectId ? this.store.getProjects().find(project => project.id === projectId) : undefined;
		if (projectId && !project) throw new Error("Project no longer exists.");
		if (taskId) { const task = this.store.getTask(taskId); if ((task.projectId ?? undefined) !== project?.id) throw new Error("This chat belongs to another project."); }
		const id = randomUUID(); const cwd = project?.directory ?? path.join(this.directory, id); mkdirSync(cwd, { recursive: true });
		const session: TerminalSession = { id, projectId: project?.id, ...(taskId ? { taskId } : {}), ...(script ? { scriptId: script.id } : {}), title: script?.name.slice(0, 200) ?? this.nextTitle(project?.id, taskId), cwd, output: "", status: "running", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
		const entry = this.start(session, process.platform === "win32" ? "powershell.exe" : process.env.SHELL ?? "/bin/bash", process.platform === "win32" ? ["-NoLogo"] : [], process.env);
		if (script) entry.pty.write(`${script.command}\r`);
		return session;
	}
	/** Starts a project script in its own terminal, such as one that runs when a worktree is created. */
	runScript(projectId: string, script: ProjectScript, taskId?: string) {
		if (this.closed) throw new Error("Terminals are shutting down.");
		return this.open(projectId, taskId, script);
	}
	command(raw: unknown): TerminalSession[] {
		if (this.closed) throw new Error("Terminals are shutting down.");
		if (!raw || typeof raw !== "object") throw new Error("Invalid terminal command.");
		const command = raw as TerminalCommand;
		if (command.type === "open") {
			if (command.projectId !== undefined && typeof command.projectId !== "string") throw new Error("Invalid project.");
			if (command.taskId !== undefined && (typeof command.taskId !== "string" || !command.taskId || command.taskId.length > 200)) throw new Error("Invalid chat.");
			let script: ProjectScript | undefined;
			if (command.scriptId !== undefined) {
				if (typeof command.scriptId !== "string" || !command.projectId) throw new Error("Invalid project script.");
				script = settingsProject(this.store.getProjects(), command.projectId)?.settings?.scripts?.find(value => value.id === command.scriptId);
				if (!script) throw new Error("This project script no longer exists.");
			}
			this.open(command.projectId, command.taskId, script);
		} else {
			if (typeof command.id !== "string") throw new Error("Invalid terminal.");
			const entry = this.running.get(command.id);
			if (command.type === "delete") { if (entry) throw new Error("Close the terminal before deleting its transcript."); this.store.deleteTerminal(command.id); }
			else if (!entry) throw new Error("This terminal is no longer running.");
			else if (command.type === "write") { if (typeof command.data !== "string" || command.data.length > 65536) throw new Error("Invalid terminal input."); entry.activity++; entry.pty.write(command.data); }
			else if (command.type === "resize") { if (![command.columns, command.rows].every(value => Number.isInteger(value) && value >= 1 && value <= 500)) throw new Error("Invalid terminal dimensions."); entry.pty.resize(command.columns, command.rows); }
			else if (command.type === "close") entry.pty.kill();
			else throw new Error("Unknown terminal command.");
		}
		return command.type === "write" || command.type === "resize" ? [] : this.get();
	}
	/**
	 * T3's settle cleanup: closes a chat's terminals that sit at an idle shell prompt. One running a command
	 * (a dev server, an editor) stays, and so does every terminal when the process table cannot be read.
	 */
	async closeIdle(taskId: string): Promise<number> {
		const candidates = [...this.running.values()].filter(entry => !entry.session.ephemeral && entry.session.taskId === taskId);
		if (this.closed || !candidates.length) return 0;
		const marks = new Map(candidates.map(entry => [entry, entry.activity]));
		let table: ProcessRow[];
		try { table = await this.processTable(); } catch { return 0; }
		let closed = 0;
		for (const entry of candidates) {
			if (this.closed || this.running.get(entry.session.id) !== entry || entry.activity !== marks.get(entry)) continue;
			if (!Number.isInteger(entry.pty.pid) || shellIsBusy(table, entry.pty.pid)) continue;
			this.discarding.add(entry.session.id);
			try { entry.pty.kill(); closed++; } catch { this.discarding.delete(entry.session.id); }
		}
		return closed;
	}
	/** T3's numbering: "Terminal N", one above the highest number in use for the same chat or project. */
	private nextTitle(projectId?: string, taskId?: string) {
		const used = this.get().filter(session => !session.ephemeral && session.projectId === projectId && session.taskId === taskId).map(session => /^Terminal (\d+)$/.exec(session.title)?.[1]).filter(Boolean).map(Number);
		return `Terminal ${used.length ? Math.max(...used) + 1 : 1}`;
	}
	private flush(id: string) {
		const entry = this.running.get(id); if (!entry) return;
		if (entry.timer) clearTimeout(entry.timer); entry.timer = undefined;
		if (!entry.pending) return;
		const data = entry.pending; entry.pending = ""; entry.session.output = (entry.session.output + data).slice(-1024 * 1024);
		if (!entry.session.ephemeral) this.store.saveTerminal(entry.session); this.onEvent({ sessionId: id, data });
	}
	close() {
		this.closed = true;
		for (const [id, entry] of this.running) { this.flush(id); entry.session.status = "interrupted"; if (!entry.session.ephemeral) this.store.saveTerminal(entry.session); else entry.session.output = ""; entry.settle?.(new Error("Native sign-in cancelled.")); try { entry.pty.kill(); } catch { /* The process may already have exited. */ } }
		this.running.clear();
	}
}
