import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { AgentRunResult } from "@phaseo/agent-sdk";
import type { Account, AgentConnection, Attachment, Project, Task, TerminalSession, Workspace, WorkspaceCommand } from "../shared/workspace";

export class WorkspaceStore {
	private readonly db: DatabaseSync;
	constructor(filename: string) {
		this.db = new DatabaseSync(filename);
		this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
			CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS terminals (id TEXT PRIMARY KEY, data TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, data TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, data TEXT NOT NULL);
			PRAGMA user_version=1;`);
		for (const task of this.get().tasks) {
			if (task.status === "running" || task.status === "waiting") {
				task.status = "interrupted";
				task.approvals = []; task.questions = []; task.forms = [];
				task.error = "The application stopped during this task. Resume to continue.";
				this.saveTask(task);
			}
		}
		for (const session of this.getTerminals()) if (session.status === "running") { session.status = "interrupted"; this.saveTerminal(session); }
	}
	getTerminals(): TerminalSession[] { return this.db.prepare("SELECT data FROM terminals").all().map(row => JSON.parse(row.data as string) as TerminalSession).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
	saveTerminal(session: TerminalSession) { session.updatedAt = new Date().toISOString(); this.db.prepare("INSERT INTO terminals (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(session.id, JSON.stringify(session)); }
	deleteTerminal(id: string) { this.db.prepare("DELETE FROM terminals WHERE id=?").run(id); }
	get(): Workspace {
		const rows = (table: "projects" | "tasks" | "accounts" | "agents") => this.db.prepare(`SELECT data FROM ${table}`).all().map(row => JSON.parse(row.data as string));
		return { version: 1, projects: rows("projects"), accounts: rows("accounts"), agents: rows("agents"), tasks: rows("tasks").sort((a: Task, b: Task) => b.updatedAt.localeCompare(a.updatedAt)) };
	}
	getTask(id: string): Task {
		const row = this.db.prepare("SELECT data FROM tasks WHERE id = ?").get(id);
		if (!row) throw new Error("Task no longer exists.");
		return JSON.parse(row.data as string) as Task;
	}
	loadAgentRun(id: string): AgentRunResult | null {
		const row = this.db.prepare("SELECT data FROM agent_runs WHERE id = ?").get(id);
		return row ? JSON.parse(row.data as string) as AgentRunResult : null;
	}
	saveAgentRun(result: AgentRunResult) {
		this.db.prepare("INSERT INTO agent_runs (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(result.run.id, JSON.stringify(result));
	}
	saveTask(task: Task) {
		task.updatedAt = new Date().toISOString();
		this.db.prepare("INSERT INTO tasks (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(task.id, JSON.stringify(task));
	}
	addProject(directory: string): Project {
		const existing = this.get().projects.find(project => project.directory === directory);
		if (existing) return existing;
		const project: Project = { id: randomUUID(), directory, name: directory.split(/[\\/]/).filter(Boolean).at(-1) ?? directory, createdAt: new Date().toISOString() };
		this.db.prepare("INSERT INTO projects (id, data) VALUES (?, ?)").run(project.id, JSON.stringify(project));
		return project;
	}
	saveAccount(account: Account) {
		this.db.prepare("INSERT INTO accounts (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(account.id, JSON.stringify(account));
	}
	saveAgent(agent: AgentConnection) { this.db.prepare("INSERT INTO agents (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(agent.id, JSON.stringify(agent)); }
	getAttachment(id: string): Attachment | undefined { const row = this.db.prepare("SELECT data FROM attachments WHERE id=?").get(id); return row ? JSON.parse(row.data as string) as Attachment : undefined; }
	saveAttachment(attachment: Attachment) { this.db.prepare("INSERT INTO attachments (id, data) VALUES (?, ?)").run(attachment.id, JSON.stringify(attachment)); }
	apply(command: Exclude<WorkspaceCommand, { type: "add-account" | "add-agent" }>): Task {
		if (command.type === "handoff") {
			const source = this.getTask(command.id);
			if (source.status === "running" || source.status === "waiting") throw new Error("Stop this task before handing it off.");
			const destination = this.apply({ ...command, type: "create-task" });
			destination.title = `${source.title} (handoff)`; destination.parentId = source.id; destination.handoffFrom = source.harness;
			destination.messages = source.messages; this.saveTask(destination); return destination;
		}
		if (command.type === "create-task") {
			if (command.projectId && !this.get().projects.some(project => project.id === command.projectId)) throw new Error("Project no longer exists.");
			if (command.accountId && !this.get().accounts.some(account => account.id === command.accountId && account.harness === command.harness && account.configured)) throw new Error("Account is unavailable for this harness. Sign in first.");
			if (command.harness === "phaseo" && !command.accountId) throw new Error("Choose an API account for the Phaseo harness.");
			if (command.harness === "acp" && !this.get().agents.some(agent => agent.id === command.agentId)) throw new Error("Choose a connected ACP agent.");
			const now = new Date().toISOString();
			const task: Task = { id: randomUUID(), title: "New task", projectId: command.projectId, harness: command.harness, accountId: command.accountId, agentId: command.agentId, model: command.model, mode: command.mode, status: "idle", messages: [], queue: [], pinned: false, archived: false, createdAt: now, updatedAt: now };
			this.saveTask(task); return task;
		}
		const task = this.getTask(command.id);
		switch (command.type) {
			case "update-task":
				if (command.title !== undefined) task.title = command.title;
				if (command.pinned !== undefined) task.pinned = command.pinned;
				if (command.archived !== undefined) {
					if (task.status === "running" || task.status === "waiting") throw new Error("Stop this task before archiving it.");
					task.archived = command.archived;
				} break;
			case "send":
				if (task.archived) throw new Error("Restore this task before sending a message.");
				{
					const attachments = command.attachments?.map(id => { const attachment = this.getAttachment(id); if (!attachment || attachment.taskId !== task.id) throw new Error("This attachment belongs to another task or is unavailable."); return attachment; });
					task.queue.push({ id: randomUUID(), text: command.text, ...(attachments?.length ? { attachments } : {}), createdAt: new Date().toISOString() });
				}
				if (task.title === "New task") task.title = command.text.slice(0, 80);
				break;
			case "fork": {
				if (task.status === "running" || task.status === "waiting") throw new Error("Stop this task before forking it.");
				const fork: Task = { ...task, id: randomUUID(), title: `${task.title} (fork)`, parentId: task.id, status: "idle", queue: [], pinned: false, archived: false, nativeSessionId: undefined, nativeForkFrom: task.nativeSessionId, approvals: [], questions: [], forms: [], error: undefined, createdAt: new Date().toISOString() };
				this.saveTask(fork); return fork;
			}
			case "queue-remove": task.queue = task.queue.filter(message => message.id !== command.messageId); break;
			case "queue-edit": {
				const message = task.queue.find(message => message.id === command.messageId);
				if (!message) throw new Error("This message is no longer queued.");
				message.text = command.text; break;
			}
			case "queue-move": {
				const index = task.queue.findIndex(message => message.id === command.messageId);
				const next = index + (command.direction === "up" ? -1 : 1);
				if (index >= 0 && next >= 0 && next < task.queue.length) [task.queue[index], task.queue[next]] = [task.queue[next], task.queue[index]];
				break;
			}
			case "cancel": task.status = "interrupted"; break;
			case "resume":
				if (task.status === "running" || task.status === "waiting") throw new Error("This task is already running.");
				if (!task.queue.length && task.nativeSessionId) task.queue.push({ id: randomUUID(), text: "Continue from where you stopped.", createdAt: new Date().toISOString() });
				task.error = undefined; break;
		}
		this.saveTask(task); return task;
	}
	close() { this.db.close(); }
}
