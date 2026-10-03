import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { AgentRunResult } from "@phaseo/agent-sdk";
import type { Account, AgentConnection, Attachment, Project, Task, TerminalSession, Workspace, WorkspaceCommand } from "../shared/workspace";
import type { McpConnection } from "../shared/mcp";
import { defaultPreferences, validatePreferences } from "../shared/preferences";
import type { WorkspacePreferences } from "../shared/preferences";
import { MissionStore } from "./missionStore";

export class WorkspaceStore {
	private readonly db: DatabaseSync;
	readonly missions: MissionStore;
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
			CREATE TABLE IF NOT EXISTS mcp_connections (id TEXT PRIMARY KEY, data TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS preferences (id TEXT PRIMARY KEY, data TEXT NOT NULL);
			PRAGMA user_version=1;`);
		this.missions = new MissionStore(this.db);
		for (const task of this.get().tasks) {
			let recovered = false;
			if (task.authTerminalId) {
				const input = task.messages.find(value => value.id === task.authInputId && value.role === "user");
				if (input && !task.messages.some(value => value.role === "assistant" && value.id.startsWith(`${input.id}:`))) { if (!task.queue.some(value => value.id === input.id)) task.queue.unshift({ id: input.id, text: input.text, attachments: input.attachments, createdAt: input.createdAt }); task.messages = task.messages.filter(value => value.id !== input.id); }
				task.authTerminalId = undefined; task.authInputId = undefined; recovered = true;
			}
			for (const message of task.steering ?? []) if (message.status === "sending") { message.status = "unconfirmed"; message.error = "The application stopped before delivery was confirmed."; recovered = true; }
			if (task.status === "running" || task.status === "waiting") {
				task.status = "interrupted";
				task.approvals = []; task.questions = []; task.forms = [];
				task.error = "The application stopped during this task. Resume to continue.";
				this.saveTask(task);
			}
			else if (recovered) this.saveTask(task);
		}
		for (const session of this.getTerminals()) if (session.status === "running") { session.status = "interrupted"; this.saveTerminal(session); }
	}
	getTerminals(): TerminalSession[] { return this.db.prepare("SELECT data FROM terminals").all().map(row => JSON.parse(row.data as string) as TerminalSession).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
	saveTerminal(session: TerminalSession) { session.updatedAt = new Date().toISOString(); this.db.prepare("INSERT INTO terminals (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(session.id, JSON.stringify(session)); }
	deleteTerminal(id: string) { this.db.prepare("DELETE FROM terminals WHERE id=?").run(id); }
	get(): Workspace {
		const rows = (table: "projects" | "tasks" | "accounts" | "agents" | "mcp_connections") => this.db.prepare(`SELECT data FROM ${table}`).all().map(row => JSON.parse(row.data as string));
		return { version: 1, projects: rows("projects"), accounts: rows("accounts"), agents: rows("agents"), mcpConnections: rows("mcp_connections"), tasks: rows("tasks").sort((a: Task, b: Task) => b.updatedAt.localeCompare(a.updatedAt)) };
	}
	saveMcp(connection: McpConnection) { this.db.prepare("INSERT INTO mcp_connections (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(connection.id, JSON.stringify(connection)); }
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
	saveTask(task: Task, preserveUpdatedAt = false) {
		if (!preserveUpdatedAt) task.updatedAt = new Date().toISOString();
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
	saveProject(project: Project) { this.db.prepare("INSERT INTO projects (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(project.id, JSON.stringify(project)); }
	saveAgent(agent: AgentConnection) { this.db.prepare("INSERT INTO agents (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(agent.id, JSON.stringify(agent)); }
	getAttachment(id: string): Attachment | undefined { const row = this.db.prepare("SELECT data FROM attachments WHERE id=?").get(id); return row ? JSON.parse(row.data as string) as Attachment : undefined; }
	saveAttachment(attachment: Attachment) { this.db.prepare("INSERT INTO attachments (id, data) VALUES (?, ?)").run(attachment.id, JSON.stringify(attachment)); }
	importTask(command: Extract<WorkspaceCommand, { type: "create-task" }>, conversation: Pick<Task, "title" | "messages" | "createdAt" | "handoffFrom">, attachments: Attachment[]): Task {
		this.db.exec("BEGIN");
		try {
			const task = this.apply(command);
			const files = new Map(attachments.map(attachment => [attachment.id, { ...attachment, taskId: task.id }]));
			for (const attachment of files.values()) this.saveAttachment(attachment);
			task.title = conversation.title; task.createdAt = conversation.createdAt; task.handoffFrom = conversation.handoffFrom;
			task.messages = conversation.messages.map(message => ({ ...message, attachments: message.attachments?.map(attachment => { const file = files.get(attachment.id); if (!file) throw new Error("An imported attachment is missing."); return file; }) }));
			this.saveTask(task); this.db.exec("COMMIT"); return task;
		} catch (error) { this.db.exec("ROLLBACK"); throw error; }
	}
	apply(command: Exclude<WorkspaceCommand, { type: "add-account" | "update-account" | "add-agent" | "update-agent" }>): Task {
		if (command.type === "handoff") {
			const source = this.getTask(command.id);
			if (source.status === "running" || source.status === "waiting") throw new Error("Stop this task before handing it off.");
			const destination = this.apply({ ...command, type: "create-task" });
			destination.title = `${source.title} (handoff)`; destination.parentId = source.id; destination.handoffFrom = source.harness;
			destination.messages = source.messages; this.saveTask(destination); return destination;
		}
		if (command.type === "create-task") {
			if (command.projectId && !this.get().projects.some(project => project.id === command.projectId && !project.worktree?.removedAt)) throw new Error("Project no longer exists or its worktree has been removed.");
			if (command.accountId && !this.get().accounts.some(account => account.id === command.accountId && account.harness === command.harness && account.configured && !account.archived)) throw new Error("Account is unavailable for this harness. Restore it or sign in first.");
			if (command.harness === "phaseo" && !command.accountId) throw new Error("Choose an API account for the Phaseo harness.");
			if (command.harness === "acp" && !this.get().agents.some(agent => agent.id === command.agentId && !agent.archived)) throw new Error("Choose an active connected ACP agent.");
			const now = new Date().toISOString();
			const task: Task = { id: randomUUID(), title: "New task", projectId: command.projectId, harness: command.harness, accountId: command.accountId, agentId: command.agentId, model: command.model, mode: command.mode, status: "idle", messages: [], queue: [], pinned: false, archived: false, createdAt: now, updatedAt: now };
			this.saveTask(task); return task;
		}
		const task = this.getTask(command.id);
		switch (command.type) {
			case "update-task":
				if (command.model !== undefined || command.mode !== undefined || command.reasoningEffort !== undefined || command.nativeMode !== undefined) {
					if (task.status === "running" || task.status === "waiting") throw new Error("Stop this task before changing its model or mode.");
					if (task.archived) throw new Error("Restore this task before changing its settings.");
					if (task.harness === "phaseo" && command.model === "default") throw new Error("Choose a model for the Phaseo harness.");
					if (command.reasoningEffort && task.harness !== "codex") throw new Error("This harness does not expose reasoning effort in the desktop yet.");
					if (command.nativeMode !== undefined && task.harness !== "acp") throw new Error("Native mode selection requires an ACP agent.");
					if (command.model !== undefined && command.model !== task.model) task.reasoningEffort = task.harness === "codex" ? "" : undefined;
					if (command.model !== undefined) task.model = command.model;
					if (command.mode !== undefined) task.mode = command.mode;
					if (command.reasoningEffort !== undefined) task.reasoningEffort = command.reasoningEffort;
					if (command.nativeMode !== undefined) task.nativeMode = command.nativeMode;
				}
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
				const fork: Task = { ...task, id: randomUUID(), title: `${task.title} (fork)`, parentId: task.id, missionId: undefined, status: "idle", queue: [], steering: [], pinned: false, archived: false, nativeSessionId: undefined, nativeForkFrom: task.nativeSessionId, approvals: [], questions: [], forms: [], error: undefined, createdAt: new Date().toISOString() };
				this.saveTask(fork); return fork;
			}
			case "queue-remove": task.queue = task.queue.filter(message => message.id !== command.messageId); break;
			case "inbox-read":
				if (task.updatedAt === command.revision) { task.inboxReadAt = command.revision; this.saveTask(task, true); }
				return task;
			case "steer-queue":
			case "steer-discard": {
				const message = task.steering?.find(value => value.id === command.messageId);
				if (!message || message.status === "sending") throw new Error("This instruction is still sending or is no longer pending.");
				if (command.type === "steer-queue") { if (task.archived) throw new Error("Restore this task before queueing a message."); task.queue.push({ id: message.id, text: message.text, attachments: message.attachments, createdAt: message.createdAt }); }
				task.steering = task.steering?.filter(value => value.id !== message.id); break;
			}
			case "steer": throw new Error("Live steering must be sent through the workspace runtime.");
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
	getPreferences(): WorkspacePreferences { const row = this.db.prepare("SELECT data FROM preferences WHERE id='workspace'").get(); return row ? validatePreferences(JSON.parse(row.data as string)) : { ...defaultPreferences }; }
	savePreferences(value: WorkspacePreferences) { const preferences = validatePreferences(value); this.db.prepare("INSERT INTO preferences (id, data) VALUES ('workspace', ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(JSON.stringify(preferences)); return preferences; }
	close() { this.db.close(); }
}
