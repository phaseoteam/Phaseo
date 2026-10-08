import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node-pty";
import type { IPty } from "node-pty";
import type { TerminalCommand, TerminalEvent, TerminalSession } from "../shared/workspace";
import type { WorkspaceStore } from "./workspaceStore";
import { validateTerminalAuth, type TerminalAuthentication, type TerminalAuthRequest } from "./terminalAuth";

export class TerminalService {
	private readonly running = new Map<string, { pty: IPty; session: TerminalSession; pending: string; timer?: ReturnType<typeof setTimeout>; settle?: (error?: Error) => void }>();
	private closed = false;
	onEvent: (event: TerminalEvent) => void = () => {};
	constructor(private readonly store: WorkspaceStore, private readonly directory: string, private readonly spawnPty = spawn) {}
	get(): TerminalSession[] { return [...this.running.values()].filter(value => value.session.ephemeral).map(value => ({ ...value.session })).concat(this.store.getTerminals()); }
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
		const entry = { pty, session, pending: "" } as { pty: IPty; session: TerminalSession; pending: string; timer?: ReturnType<typeof setTimeout>; settle?: (error?: Error) => void };
		this.running.set(session.id, entry); if (!session.ephemeral) this.store.saveTerminal(session); this.onEvent({ sessionId: session.id, session });
		pty.onData(data => { if (this.closed || !this.running.has(session.id)) return; entry.pending = (entry.pending + data).slice(-1024 * 1024); entry.timer ??= setTimeout(() => this.flush(session.id), 100); });
		pty.onExit(({ exitCode }) => { if (this.closed || !this.running.has(session.id)) return; this.flush(session.id); session.status = "exited"; session.exitCode = exitCode; if (!session.ephemeral) this.store.saveTerminal(session); else session.output = ""; this.running.delete(session.id); this.onEvent({ sessionId: session.id, session }); entry.settle?.(exitCode === 0 ? undefined : new Error("Native sign-in ended without completing.")); });
		return entry;
	}
	command(raw: unknown): TerminalSession[] {
		if (this.closed) throw new Error("Terminals are shutting down.");
		if (!raw || typeof raw !== "object") throw new Error("Invalid terminal command.");
		const command = raw as TerminalCommand;
		if (command.type === "open") {
			if (this.running.size >= 10 || this.store.getTerminals().length >= 50) throw new Error("Close a terminal or delete an old transcript first.");
			if (command.projectId !== undefined && typeof command.projectId !== "string") throw new Error("Invalid project.");
			const project = command.projectId ? this.store.getProjects().find(project => project.id === command.projectId) : undefined;
			if (command.projectId && !project) throw new Error("Project no longer exists.");
			const id = randomUUID(); const cwd = project?.directory ?? path.join(this.directory, id); mkdirSync(cwd, { recursive: true });
			const session: TerminalSession = { id, projectId: project?.id, title: project?.name ?? "Personal terminal", cwd, output: "", status: "running", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
			this.start(session, process.platform === "win32" ? "powershell.exe" : process.env.SHELL ?? "/bin/bash", process.platform === "win32" ? ["-NoLogo"] : [], process.env);
		} else {
			if (typeof command.id !== "string") throw new Error("Invalid terminal.");
			const entry = this.running.get(command.id);
			if (command.type === "delete") { if (entry) throw new Error("Close the terminal before deleting its transcript."); this.store.deleteTerminal(command.id); }
			else if (!entry) throw new Error("This terminal is no longer running.");
			else if (command.type === "write") { if (typeof command.data !== "string" || command.data.length > 65536) throw new Error("Invalid terminal input."); entry.pty.write(command.data); }
			else if (command.type === "resize") { if (![command.columns, command.rows].every(value => Number.isInteger(value) && value >= 1 && value <= 500)) throw new Error("Invalid terminal dimensions."); entry.pty.resize(command.columns, command.rows); }
			else if (command.type === "close") entry.pty.kill();
			else throw new Error("Unknown terminal command.");
		}
		return command.type === "write" || command.type === "resize" ? [] : this.get();
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
