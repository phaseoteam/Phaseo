import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node-pty";
import type { IPty } from "node-pty";
import type { TerminalCommand, TerminalEvent, TerminalSession } from "../shared/workspace";
import type { WorkspaceStore } from "./workspaceStore";

export class TerminalService {
	private readonly running = new Map<string, { pty: IPty; session: TerminalSession; pending: string; timer?: ReturnType<typeof setTimeout> }>();
	private closed = false;
	onEvent: (event: TerminalEvent) => void = () => {};
	constructor(private readonly store: WorkspaceStore, private readonly directory: string, private readonly spawnPty = spawn) {}
	command(raw: unknown): TerminalSession[] {
		if (this.closed) throw new Error("Terminals are shutting down.");
		if (!raw || typeof raw !== "object") throw new Error("Invalid terminal command.");
		const command = raw as TerminalCommand;
		if (command.type === "open") {
			if (this.running.size >= 10 || this.store.getTerminals().length >= 50) throw new Error("Close a terminal or delete an old transcript first.");
			if (command.projectId !== undefined && typeof command.projectId !== "string") throw new Error("Invalid project.");
			const project = command.projectId ? this.store.get().projects.find(project => project.id === command.projectId) : undefined;
			if (command.projectId && !project) throw new Error("Project no longer exists.");
			const id = randomUUID(); const cwd = project?.directory ?? path.join(this.directory, id); mkdirSync(cwd, { recursive: true });
			const session: TerminalSession = { id, projectId: project?.id, title: project?.name ?? "Personal terminal", cwd, output: "", status: "running", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
			const pty = this.spawnPty(process.platform === "win32" ? "powershell.exe" : process.env.SHELL ?? "/bin/bash", process.platform === "win32" ? ["-NoLogo"] : [], { name: "xterm-256color", cwd, cols: 100, rows: 30, env: process.env });
			const entry = { pty, session, pending: "" } as { pty: IPty; session: TerminalSession; pending: string; timer?: ReturnType<typeof setTimeout> };
			this.running.set(id, entry); this.store.saveTerminal(session); this.onEvent({ sessionId: id, session });
			pty.onData(data => { if (this.closed) return; entry.pending = (entry.pending + data).slice(-1024 * 1024); entry.timer ??= setTimeout(() => this.flush(id), 100); });
			pty.onExit(({ exitCode }) => { if (this.closed) return; this.flush(id); session.status = "exited"; session.exitCode = exitCode; this.store.saveTerminal(session); this.running.delete(id); this.onEvent({ sessionId: id, session }); });
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
		return command.type === "write" || command.type === "resize" ? [] : this.store.getTerminals();
	}
	private flush(id: string) {
		const entry = this.running.get(id); if (!entry) return;
		if (entry.timer) clearTimeout(entry.timer); entry.timer = undefined;
		if (!entry.pending) return;
		const data = entry.pending; entry.pending = ""; entry.session.output = (entry.session.output + data).slice(-1024 * 1024);
		this.store.saveTerminal(entry.session); this.onEvent({ sessionId: id, data });
	}
	close() {
		this.closed = true;
		for (const [id, entry] of this.running) { this.flush(id); entry.session.status = "interrupted"; this.store.saveTerminal(entry.session); try { entry.pty.kill(); } catch { /* The process may already have exited. */ } }
		this.running.clear();
	}
}
