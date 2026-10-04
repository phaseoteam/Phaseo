import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import type { AgentActivity, AgentConnection, WorkspaceCommand } from "../shared/workspace";
import { CodexAdapter } from "./codexAdapter";
import { WorkspaceStore } from "./workspaceStore";
import type { WorkspaceOverview } from "../shared/workspaceOverview";
import { ClaudeAdapter } from "./claudeAdapter";
import { AgentInputRejectedError, type AgentAdapter } from "./agentAdapter";
import type { Harness } from "../shared/workspace";
import type { SecretVault } from "./secretVault";
import { PhaseoAdapter } from "./phaseoAdapter";
import { PhaseoCodingAdapter } from "./phaseoCodingAdapter";
import { OpenCodeAdapter } from "./openCodeAdapter";
import { AcpAdapter } from "./acpAdapter";
import { PiAdapter } from "./piAdapter";
import { handoffPrompt } from "./handoffPrompt";
import { AttachmentService } from "./attachments";
import type { FormAnswer } from "../shared/agentForms";
import { formAnswerError } from "../shared/agentForms";
import { OpenCodeService } from "./openCodeService";
import { CursorAdapter } from "./cursorAdapter";
import type { ImportedConversation } from "./taskImport";
import type { Attachment } from "../shared/workspace";
import type { McpCommand, McpConnection } from "../shared/mcp";
import type { TerminalAuthentication, TerminalAuthRequest } from "./terminalAuth";
import { createGitWorktree, removeGitWorktree } from "./gitWorktrees";
import { GrokAdapter } from "./grokAdapter";

const hasRequests = (task: { approvals?: unknown[]; questions?: unknown[]; forms?: unknown[] }) => Boolean(task.approvals?.length || task.questions?.length || task.forms?.length);

function createAdapter(harness: Harness, agent?: AgentConnection, openCode?: OpenCodeService, mcp: McpConnection[] = [], projectId?: string): AgentAdapter {
	const active = mcp.filter(connection => connection.enabled && !connection.archived && (!connection.projectId || connection.projectId === projectId));
	if (harness === "codex") return new CodexAdapter(mcp);
	if (harness === "claude") return new ClaudeAdapter(active);
	if (harness === "opencode") return new OpenCodeAdapter(openCode ? signal => openCode.connect(signal) : undefined, mcp, openCode?.mcp);
	if (harness === "pi") return new PiAdapter();
	if (harness === "grok") return new GrokAdapter(active);
	if (harness === "acp" && agent) return new AcpAdapter(agent, active);
	throw new Error(`${harness} execution is not connected yet. Your message remains queued.`);
}

export class WorkspaceRuntime {
	readonly store: WorkspaceStore;
	readonly attachments: AttachmentService;
	readonly openCode: OpenCodeService;
	private readonly running = new Map<string, AgentAdapter>();
	private readonly approvals = new Map<string, { taskId: string; resolve: (decision: "accept" | "decline") => void }>();
	private readonly questions = new Map<string, { taskId: string; resolve: (answers: Record<string, string[]>) => void }>();
	private readonly forms = new Map<string, { taskId: string; resolve: (answer: FormAnswer | null) => void }>();
	private readonly executions = new Map<string, Promise<void>>();
	private readonly signingInAccounts = new Set<string>();
	private readonly steeringExecutions = new Map<string, Promise<WorkspaceOverview>>();
	private readonly imports = new Set<Promise<unknown>>();
	private readonly worktreeOperations = new Set<Promise<unknown>>();
	private readonly worktreeSources = new Map<string, number>();
	private readonly removingWorktrees = new Set<string>();
	private readonly projectMutations = new Map<Promise<unknown>, string>();
	private closing = false;
	onChange: (workspace: WorkspaceOverview) => void = () => {};
	onTerminalAuth?: (request: TerminalAuthRequest, signal: AbortSignal) => TerminalAuthentication;
	getTerminals?: () => { cwd: string; status: string }[];
	constructor(private readonly directory: string, private readonly adapterFactory = createAdapter, private readonly vault?: SecretVault) {
		mkdirSync(directory, { recursive: true });
		this.store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		this.attachments = new AttachmentService(path.join(directory, "attachments"), this.store);
		this.openCode = new OpenCodeService(directory);
	}
	private broadcast() { this.onChange(this.store.getOverview()); }
	async createWorktree(projectId: string, branch: string, base: string) {
		if (this.closing) throw new Error("The workspace is shutting down.");
		this.assertProjectAvailable(projectId); this.worktreeSources.set(projectId, (this.worktreeSources.get(projectId) ?? 0) + 1);
		const operation = this.performCreateWorktree(projectId, branch, base); this.worktreeOperations.add(operation);
		try { return await operation; } finally { this.worktreeOperations.delete(operation); const count = this.worktreeSources.get(projectId)! - 1; if (count) this.worktreeSources.set(projectId, count); else this.worktreeSources.delete(projectId); }
	}
	assertProjectAvailable(projectId: string) {
		const project = this.store.getProjects().find(value => value.id === projectId);
		if (!project || project.worktree?.removedAt) throw new Error("This project is unavailable. Use Handoff to continue in another project.");
		try { realpathSync(project.directory); } catch { throw new Error("The project folder is unavailable. Open its current location or use Handoff."); }
		if ([...this.removingWorktrees].some(id => { const removing = this.store.getProjects().find(value => value.id === id); if (!removing) return false; try { return !path.relative(realpathSync(removing.directory), realpathSync(project.directory)); } catch { return !path.relative(removing.directory, project.directory); } })) throw new Error("Worktree removal is in progress.");
	}
	async mutateProject<T>(projectId: string, run: () => Promise<T>): Promise<T> {
		if (this.closing) throw new Error("The workspace is shutting down."); this.assertProjectAvailable(projectId);
		const operation = run(); this.projectMutations.set(operation, projectId);
		try { return await operation; } finally { this.projectMutations.delete(operation); }
	}
	async removeWorktree(projectId: string) {
		if (this.closing) throw new Error("The workspace is shutting down."); this.assertProjectAvailable(projectId);
		const workspace = this.store.getOverview(); const project = workspace.projects.find(value => value.id === projectId)!;
		if (!project.worktree) throw new Error("Only desktop-managed worktrees can be removed.");
		const sameDirectory = (directory: string) => { try { const value = realpathSync(directory); return !path.relative(realpathSync(project.directory), value); } catch { return false; } };
		if (workspace.tasks.some(task => this.executions.has(task.id) && workspace.projects.some(value => value.id === task.projectId && sameDirectory(value.directory)))) throw new Error("Stop worktree tasks before removing their checkout.");
		if (this.getTerminals?.().some(value => value.status === "running" && sameDirectory(value.cwd))) throw new Error("Close worktree terminals before removing their checkout.");
		if ([...this.projectMutations.values()].some(id => workspace.projects.some(value => value.id === id && sameDirectory(value.directory)))) throw new Error("Wait for project edits and Git actions to finish before removing this worktree.");
		if (workspace.projects.some(value => value.worktree && !value.worktree.removedAt && workspace.projects.some(source => source.id === value.worktree!.sourceProjectId && sameDirectory(source.directory))) || [...this.worktreeSources.keys()].some(id => workspace.projects.some(value => value.id === id && sameDirectory(value.directory)))) throw new Error("Remove dependent worktrees or wait for creation to finish first.");
		const source = workspace.projects.find(value => value.id === project.worktree!.sourceProjectId); if (!source || source.worktree?.removedAt) throw new Error("The source project is unavailable.");
		this.removingWorktrees.add(projectId);
		const operation = (async () => { await removeGitWorktree(source.directory, path.join(this.directory, "worktrees"), project.directory, () => this.openCode.releaseMcp(project.directory, projectId, workspace.mcpConnections)); project.worktree!.removedAt = new Date().toISOString(); this.store.saveProject(project); this.broadcast(); return this.store.getOverview(); })(); this.worktreeOperations.add(operation);
		try { return await operation; } finally { this.removingWorktrees.delete(projectId); this.worktreeOperations.delete(operation); }
	}
	private async performCreateWorktree(projectId: string, branch: string, base: string) {
		const source = this.store.getProjects().find(value => value.id === projectId); if (!source) throw new Error("Project no longer exists.");
		const root = path.join(this.directory, "worktrees"); mkdirSync(root, { recursive: true }); const directory = path.join(realpathSync(root), randomUUID());
		const baseCommit = await createGitWorktree(source.directory, directory, branch, base);
		try { const project = this.store.addProject(directory); project.name = `${source.name} · ${branch}`; project.worktree = { sourceProjectId: source.id, branch, baseCommit }; this.store.saveProject(project); this.broadcast(); return { workspace: this.store.getOverview(), projectId: project.id }; }
		catch (error) { throw new Error(`The worktree was created at ${directory}, but project registration failed. Open that folder to recover it.`, { cause: error }); }
	}
	assertAccountIdle(accountId: string) {
		if (this.store.getOverview().tasks.some(task => task.accountId === accountId && this.executions.has(task.id))) throw new Error("Stop this account's tasks before signing in again.");
	}
	beginAccountSignIn(accountId: string): () => void {
		if (this.closing) throw new Error("The workspace is shutting down.");
		this.assertAccountIdle(accountId);
		if (this.signingInAccounts.has(accountId)) throw new Error("Account sign-in is already in progress.");
		this.signingInAccounts.add(accountId);
		let released = false;
		return () => { if (!released) { released = true; this.signingInAccounts.delete(accountId); } };
	}
	mcp(command: McpCommand): WorkspaceOverview {
		if (this.closing) throw new Error("The workspace is shutting down.");
		const connection = command.connection; const workspace = this.store.getOverview(); const previous = workspace.mcpConnections.find(value => value.id === connection.id);
		if (connection.projectId && !workspace.projects.some(project => project.id === connection.projectId)) throw new Error("Project no longer exists.");
		if (!previous && workspace.mcpConnections.length >= 100) throw new Error("The workspace supports up to 100 MCP connections.");
		if (workspace.tasks.some(task => this.executions.has(task.id) && ["codex", "claude", "opencode", "acp", "cursor", "grok"].includes(task.harness) && ((!connection.projectId || task.projectId === connection.projectId) || (previous && (!previous.projectId || task.projectId === previous.projectId))))) throw new Error("Stop affected tasks before changing their MCP connections.");
		this.store.saveMcp(connection); this.broadcast(); return this.store.getOverview();
	}
	async importTask(command: Extract<WorkspaceCommand, { type: "create-task" }>, conversation: ImportedConversation): Promise<{ workspace: WorkspaceOverview; taskId: string }> {
		const execution = this.performImport(command, conversation); this.imports.add(execution);
		try { return await execution; } finally { this.imports.delete(execution); }
	}
	private async performImport(command: Extract<WorkspaceCommand, { type: "create-task" }>, conversation: ImportedConversation): Promise<{ workspace: WorkspaceOverview; taskId: string }> {
		if (this.closing) throw new Error("The workspace is shutting down.");
		const prepared = new Map<string, Attachment>();
		let committed = false;
		try {
			for (const file of conversation.attachments) {
				if (this.closing) throw new Error("The workspace is shutting down.");
				prepared.set(file.id, await this.attachments.prepare("", file.name, file.bytes));
			}
			if (this.closing) throw new Error("The workspace is shutting down.");
			const task = this.store.importTask(command, { title: conversation.title, createdAt: conversation.createdAt, handoffFrom: conversation.harness, messages: conversation.messages.map(message => ({ ...message, attachments: message.attachments?.map(id => { const file = prepared.get(id); if (!file) throw new Error("An imported attachment is missing."); return file; }) })) }, [...prepared.values()]);
			committed = true;
			this.broadcast(); return { workspace: this.store.getOverview(), taskId: task.id };
		} catch (error) { if (!committed) await Promise.allSettled([...prepared.values()].map(file => this.attachments.discard(file))); throw error; }
	}
	startMission(id: string, now: number) {
		if (this.closing) throw new Error("The workspace is shutting down.");
		if (this.store.getOverview().tasks.some(task => task.missionId === id && (task.status === "running" || task.status === "waiting" || this.executions.has(task.id)))) throw new Error("This mission already has an active task.");
		const task = this.store.missions.admit(id, now, mission => {
			const template = this.store.getTask(mission.templateTaskId); if (template.archived) throw new Error("Restore this mission's template task before running it."); if (template.projectId) this.assertProjectAvailable(template.projectId);
			const created = this.store.apply({ type: "create-task", harness: template.harness, model: template.model, mode: template.mode, accountId: template.accountId, projectId: template.projectId, agentId: template.agentId }); created.title = mission.title; created.missionId = mission.id; created.reasoningEffort = template.reasoningEffort; created.nativeMode = template.nativeMode; this.store.saveTask(created);
			return this.store.apply({ type: "send", id: created.id, text: mission.prompt });
		});
		this.broadcast(); this.start(task.id); return task;
	}
	async command(command: WorkspaceCommand): Promise<WorkspaceOverview> {
		if (this.closing) throw new Error("The workspace is shutting down.");
		if ((command.type === "create-task" || command.type === "handoff") && command.projectId) this.assertProjectAvailable(command.projectId);
		if (command.type === "send" || command.type === "resume") { const projectId = this.store.getTask(command.id).projectId; if (projectId) this.assertProjectAvailable(projectId); }
		if (command.type === "update-task" && (command.model !== undefined || command.mode !== undefined || command.reasoningEffort !== undefined || command.nativeMode !== undefined) && this.executions.has(command.id)) throw new Error("Wait for this task to stop before changing its settings.");
		if (command.type === "steer") {
			if (this.steeringExecutions.has(command.id)) throw new Error("Wait for the current steering instruction to finish sending.");
			const execution = this.steer(command).finally(() => this.steeringExecutions.delete(command.id));
			this.steeringExecutions.set(command.id, execution); return execution;
		}
		if (command.type === "add-agent") {
			this.store.saveAgent({ id: randomUUID(), name: command.name, executable: command.executable, arguments: command.arguments });
			this.broadcast(); return this.store.getOverview();
		}
		if (command.type === "update-agent") {
			const agent = this.store.getAgents().find(value => value.id === command.id); if (!agent) throw new Error("Agent no longer exists.");
			if ((command.executable !== undefined || command.arguments !== undefined) && this.store.getOverview().tasks.some(task => task.agentId === agent.id && this.running.has(task.id))) throw new Error("Stop this agent's running tasks before changing its command.");
			if (command.name !== undefined) agent.name = command.name;
			if (command.executable !== undefined) agent.executable = command.executable;
			if (command.arguments !== undefined) agent.arguments = command.arguments;
			if (command.archived !== undefined) agent.archived = command.archived;
			this.store.saveAgent(agent); this.broadcast(); return this.store.getOverview();
		}
		if (command.type === "add-account") {
			const id = randomUUID();
			if (command.kind === "api") {
				if (!this.vault || !command.apiKey) throw new Error("Secure credential storage is unavailable.");
				this.vault.set(id, command.apiKey);
			}
			const configDirectory = command.kind === "native" ? path.join(this.directory, "accounts", id) : undefined;
			if (configDirectory) mkdirSync(configDirectory, { recursive: true });
			this.store.saveAccount({ id, name: command.name, harness: command.harness, kind: command.kind, endpoint: command.endpoint, configDirectory, configured: command.kind === "api" });
			this.broadcast(); return this.store.getOverview();
		}
		if (command.type === "update-account") {
			const account = this.store.getAccounts().find(value => value.id === command.id); if (!account) throw new Error("Account no longer exists.");
			if (this.signingInAccounts.has(account.id)) throw new Error("Finish or cancel account sign-in before changing this account.");
			if (account.harness === "cursor" && command.endpoint !== undefined) throw new Error("Cursor accounts use the official SDK service.");
			if (command.endpoint !== undefined || command.apiKey !== undefined) {
				if (account.kind !== "api") throw new Error("Native credentials are managed through native sign-in.");
				if (this.store.getOverview().tasks.some(task => task.accountId === account.id && this.executions.has(task.id))) throw new Error("Stop this account's running tasks before changing its connection.");
			}
			const oldSecret = account.secretId ?? account.id;
			if (command.apiKey !== undefined) { if (!this.vault) throw new Error("Secure credential storage is unavailable."); account.secretId = randomUUID(); this.vault.set(account.secretId, command.apiKey); account.configured = true; }
			if (command.name !== undefined) account.name = command.name;
			if (command.endpoint !== undefined) account.endpoint = command.endpoint;
			if (command.archived !== undefined) account.archived = command.archived;
			try { this.store.saveAccount(account); }
			catch (error) { if (command.apiKey !== undefined) this.vault?.remove(account.secretId!); throw error; }
			this.broadcast();
			if (command.apiKey !== undefined) this.vault?.remove(oldSecret);
			return this.store.getOverview();
		}
		if (command.type === "approval") {
			const pending = this.approvals.get(command.approvalId);
			if (!pending || pending.taskId !== command.id) throw new Error("This approval is no longer pending.");
			const task = this.store.getTask(command.id); task.approvals = task.approvals?.filter(value => value.id !== command.approvalId); task.status = hasRequests(task) ? "waiting" : "running";
			this.store.saveTask(task); this.broadcast();
			this.approvals.delete(command.approvalId); pending.resolve(command.decision);
			return this.store.getOverview();
		}
		if (command.type === "answer") {
			const pending = this.questions.get(command.requestId);
			const task = this.store.getTask(command.id);
			const request = task.questions?.find(value => value.id === command.requestId);
			if (!pending || pending.taskId !== task.id || !request) throw new Error("This question is no longer pending.");
			if (request.questions.some(question => !command.answers[question.id]?.length)) throw new Error("Answer every question.");
			task.questions = task.questions?.filter(value => value.id !== command.requestId); task.status = hasRequests(task) ? "waiting" : "running";
			this.store.saveTask(task); this.broadcast(); this.questions.delete(command.requestId); pending.resolve(command.answers); return this.store.getOverview();
		}
		if (command.type === "form-answer") {
			const pending = this.forms.get(command.requestId); const task = this.store.getTask(command.id);
			const request = task.forms?.find(value => value.id === command.requestId);
			if (!pending || pending.taskId !== task.id || !request) throw new Error("This form is no longer pending.");
			if (command.answer !== null) { const error = formAnswerError(request.form, command.answer); if (error) throw new Error(error); }
			task.forms = task.forms?.filter(value => value.id !== command.requestId); task.status = hasRequests(task) ? "waiting" : "running";
			this.store.saveTask(task); this.broadcast(); this.forms.delete(command.requestId); pending.resolve(command.answer); return this.store.getOverview();
		}
		if (command.type === "cancel") {
			this.store.apply(command);
			for (const [id, pending] of this.approvals) if (pending.taskId === command.id) { pending.resolve("decline"); this.approvals.delete(id); }
			for (const [id, pending] of this.questions) if (pending.taskId === command.id) { pending.resolve({}); this.questions.delete(id); }
			for (const [id, pending] of this.forms) if (pending.taskId === command.id) { pending.resolve(null); this.forms.delete(id); }
			await this.running.get(command.id)?.cancel();
		}
		const task = this.store.apply(command);
		this.broadcast();
		if (command.type === "send" || command.type === "resume" || command.type === "steer-queue") this.start(task.id);
		return this.store.getOverview();
	}
	private async steer(command: Extract<WorkspaceCommand, { type: "steer" }>): Promise<WorkspaceOverview> {
		const task = this.store.getTask(command.id); const adapter = this.running.get(task.id);
		if (task.archived || !adapter?.steer || !["running", "waiting"].includes(task.status)) throw new Error("This task is not ready for live steering.");
		if ((task.steering?.length ?? 0) >= 10) throw new Error("Resolve the outstanding steering instructions first.");
		const attachments = command.attachments?.map(id => { const value = this.store.getAttachment(id); if (!value || value.taskId !== task.id) throw new Error("This attachment belongs to another task or is unavailable."); return value; });
		const message = { id: randomUUID(), text: command.text, attachments, createdAt: new Date().toISOString() };
		task.steering ??= []; task.steering.push({ ...message, status: "sending" }); this.store.saveTask(task); this.broadcast();
		let sending = false;
		try {
			const contents = await Promise.all((attachments ?? []).map(value => this.attachments.read(value.id)));
			if (this.closing || this.running.get(task.id) !== adapter) throw new AgentInputRejectedError("The turn ended before this instruction was sent.");
			sending = true; await adapter.steer!(message, contents);
			const current = this.store.getTask(task.id); current.steering = current.steering?.filter(value => value.id !== message.id);
			current.messages.push({ ...message, role: "user", delivery: "steer" }); this.store.saveTask(current);
		} catch (error) {
			const current = this.store.getTask(task.id); const pending = current.steering?.find(value => value.id === message.id);
			if (pending) { pending.status = !sending || error instanceof AgentInputRejectedError ? "rejected" : "unconfirmed"; pending.error = error instanceof Error ? error.message : "Steering delivery failed."; this.store.saveTask(current); }
		}
		this.broadcast(); return this.store.getOverview();
	}
	private start(id: string) {
		if (this.closing || this.executions.has(id)) return;
		const execution = this.drain(id).finally(() => {
			this.executions.delete(id);
			if (!this.closing && this.store.getTask(id).status === "completed" && this.store.getTask(id).queue.length) this.start(id);
		});
		this.executions.set(id, execution);
		// Failures outside provider execution must be visible rather than unhandled.
		void execution.catch(error => {
			if (this.closing) return;
			const task = this.store.getTask(id); task.status = "failed";
			task.error = error instanceof Error ? error.message : "Workspace execution failed.";
			this.store.saveTask(task); this.broadcast();
		});
	}
	private async drain(id: string) {
		if (this.running.has(id)) return;
		const task = this.store.getTask(id);
		if (!task.queue.length) return;
		let adapter: AgentAdapter;
		try {
			const credential = (accountId: string) => { if (!this.vault) throw new Error("Credential storage is unavailable."); const account = this.store.getAccounts().find(value => value.id === accountId); if (!account) throw new Error("Account no longer exists."); return this.vault.get(account.secretId ?? account.id); };
			if (task.accountId && this.signingInAccounts.has(task.accountId)) throw new Error("Finish this account's sign-in before retrying the instruction.");
			adapter = task.harness === "phaseo" ? task.mode === "chat" ? new PhaseoAdapter(credential) : new PhaseoCodingAdapter(credential, this.store) : task.harness === "cursor" ? new CursorAdapter(this.directory, credential, this.store.getMcpConnections()) : this.adapterFactory(task.harness, this.store.getAgents().find(agent => agent.id === task.agentId), this.openCode, this.store.getMcpConnections(), task.projectId);
		}
		catch (error) {
			task.status = "failed"; task.error = error instanceof Error ? error.message : "Harness unavailable.";
			this.store.saveTask(task); this.broadcast(); return;
		}
		this.running.set(id, adapter);
		const message = task.queue.shift()!;
		task.messages.push({ ...message, role: "user" }); task.status = "running"; task.error = undefined;
		this.store.saveTask(task); this.broadcast();
		const project = this.store.getProjects().find(value => value.id === task.projectId);
		const cwd = project?.directory ?? path.join(this.directory, "tasks", id);
		const deltas = new Map<string, string>();
		let activities: (AgentActivity & { append?: boolean })[] = [];
		let flushTimer: ReturnType<typeof setTimeout> | undefined;
		let streamError: unknown;
		const flush = () => {
			if (flushTimer) clearTimeout(flushTimer); flushTimer = undefined;
			if (!deltas.size && !activities.length) return;
			const current = this.store.getTask(id);
			for (const [itemId, text] of deltas) {
				const messageId = `${message.id}:${itemId}`;
				const existing = current.messages.find(value => value.id === messageId);
				if (existing) existing.text += text;
				else current.messages.push({ id: messageId, text, role: "assistant", createdAt: new Date().toISOString() });
			}
			for (const activity of activities) {
				current.activities ??= [];
				const activityId = `${message.id}:${activity.id}`;
				const existing = current.activities.find(value => value.id === activityId);
				if (existing) { existing.text = activity.append ? existing.text + activity.text : activity.text; existing.status = activity.status; existing.title = activity.title; }
				else current.activities.push({ id: activityId, type: activity.type, title: activity.title, text: activity.text, status: activity.status });
			}
			this.store.saveTask(current); deltas.clear(); activities = []; this.broadcast();
		};
		const scheduleFlush = () => {
			flushTimer ??= setTimeout(() => { try { flush(); } catch (error) { streamError = error; void adapter.cancel().catch(() => {}); } }, 40);
		};
		try {
			mkdirSync(cwd, { recursive: true });
			const selectedAttachments = task.harness === "phaseo" || ((task.handoffFrom || (task.harness === "cursor" && task.nativeForkFrom)) && !task.nativeSessionId) ? task.messages.flatMap(message => message.attachments ?? []) : message.attachments ?? [];
			if (selectedAttachments.reduce((total, attachment) => total + attachment.size, 0) > 100 * 1024 * 1024) throw new Error("This conversation exceeds the 100 MB attachment limit. Start a new task with fewer files.");
			const attachmentIds = selectedAttachments.map(attachment => attachment.id);
			const attachments = await Promise.all([...new Set(attachmentIds)].map(id => this.attachments.read(id)));
			if (attachments.reduce((total, attachment) => total + attachment.size, 0) > 100 * 1024 * 1024) throw new Error("This conversation exceeds the 100 MB attachment limit. Start a new task with fewer files.");
			await adapter.run(task, cwd, handoffPrompt(task, message.text), {
				...(this.onTerminalAuth ? { onTerminalAuth: async (args: string[], env: Record<string, string>, title: string, signal: AbortSignal) => {
					const agent = this.store.getAgents().find(value => value.id === task.agentId); if (!agent || this.closing || signal.aborted) throw new Error("Native sign-in cancelled.");
					const auth = this.onTerminalAuth!({ agent, args, env, title, cwd, taskId: id, projectId: task.projectId }, signal);
					const current = this.store.getTask(id); current.authTerminalId = auth.session.id; current.authInputId = message.id; current.status = "waiting"; this.store.saveTask(current); this.broadcast();
					try { await auth.completed; } finally { const current = this.store.getTask(id); current.authTerminalId = undefined; current.authInputId = undefined; if (current.status === "waiting") current.status = hasRequests(current) ? "waiting" : "running"; this.store.saveTask(current); this.broadcast(); }
				} } : {}),
				onModels: nativeModels => { const current = this.store.getTask(id); current.nativeModels = nativeModels; this.store.saveTask(current); this.broadcast(); },
				onModes: nativeModes => { const current = this.store.getTask(id); current.nativeModes = nativeModes; this.store.saveTask(current); this.broadcast(); },
				onSession: nativeSessionId => { const current = this.store.getTask(id); if (current.nativeSessionId === nativeSessionId) return; current.nativeSessionId = nativeSessionId; this.store.saveTask(current); this.broadcast(); },
				onDelta: (itemId, text) => {
					deltas.set(itemId, (deltas.get(itemId) ?? "") + text); scheduleFlush();
				},
				onActivity: activity => { activities.push(activity); scheduleFlush(); },
				onApproval: (method, description) => new Promise(resolve => {
					flush();
					if (this.closing || this.store.getTask(id).status === "interrupted") { resolve("decline"); return; }
					const approvalId = randomUUID(); this.approvals.set(approvalId, { taskId: id, resolve });
					const current = this.store.getTask(id); current.status = "waiting"; current.approvals ??= []; current.approvals.push({ id: approvalId, method, description });
					this.store.saveTask(current); this.broadcast();
				}),
				onForm: (form, signal) => new Promise(resolve => {
					flush();
					if (this.closing || signal?.aborted || this.store.getTask(id).status === "interrupted") { resolve(null); return; }
					if (!form.fields.length || form.fields.length > 100 || new Set(form.fields.map(field => field.key)).size !== form.fields.length) throw new Error("The agent returned an invalid form.");
					const requestId = randomUUID();
					const complete = (answer: FormAnswer | null) => { signal?.removeEventListener("abort", abort); resolve(answer); };
					const abort = () => {
						this.forms.delete(requestId); const current = this.store.getTask(id);
						current.forms = current.forms?.filter(value => value.id !== requestId);
						if (current.status === "waiting") current.status = hasRequests(current) ? "waiting" : "running";
						this.store.saveTask(current); this.broadcast(); complete(null);
					};
					this.forms.set(requestId, { taskId: id, resolve: complete });
					const current = this.store.getTask(id); current.status = "waiting"; current.forms ??= []; current.forms.push({ id: requestId, form });
					this.store.saveTask(current); this.broadcast(); signal?.addEventListener("abort", abort, { once: true });
				}),
				onQuestion: questions => new Promise(resolve => {
					flush();
					if (this.closing || this.store.getTask(id).status === "interrupted") { resolve({}); return; }
					const requestId = randomUUID(); this.questions.set(requestId, { taskId: id, resolve });
					const current = this.store.getTask(id); current.status = "waiting"; current.questions ??= []; current.questions.push({ id: requestId, questions });
					this.store.saveTask(current); this.broadcast();
				}),
			}, this.store.getAccounts().find(account => account.id === task.accountId), attachments);
			flush(); if (streamError) throw streamError;
			const current = this.store.getTask(id);
			if (current.status !== "interrupted") current.status = "completed";
			current.approvals = []; current.questions = []; current.forms = [];
			this.store.saveTask(current);
		} catch (error) {
			flush();
			const current = this.store.getTask(id);
			if (current.status !== "interrupted") current.status = "failed";
			if (error instanceof AgentInputRejectedError && !current.messages.some(value => value.role === "assistant" && value.id.startsWith(`${message.id}:`))) { current.messages = current.messages.filter(value => value.id !== message.id); if (!current.queue.some(value => value.id === message.id)) current.queue.unshift(message); }
			current.error = error instanceof Error ? error.message : "Agent execution failed.";
			current.approvals = []; current.questions = []; current.forms = []; this.store.saveTask(current);
		} finally {
			if (flushTimer) clearTimeout(flushTimer);
			this.running.delete(id);
			for (const [approvalId, pending] of this.approvals) if (pending.taskId === id) { pending.resolve("decline"); this.approvals.delete(approvalId); }
			for (const [requestId, pending] of this.questions) if (pending.taskId === id) { pending.resolve({}); this.questions.delete(requestId); }
			for (const [requestId, pending] of this.forms) if (pending.taskId === id) { pending.resolve(null); this.forms.delete(requestId); }
			this.broadcast();
		}
	}
	async close() {
		this.closing = true;
		for (const id of this.running.keys()) this.store.apply({ type: "cancel", id });
		for (const pending of this.approvals.values()) pending.resolve("decline");
		for (const pending of this.questions.values()) pending.resolve({});
		for (const pending of this.forms.values()) pending.resolve(null);
		await Promise.allSettled([...this.running.values()].map(adapter => adapter.cancel()));
		await Promise.allSettled([...this.executions.values()]);
		await Promise.allSettled([...this.steeringExecutions.values()]);
		await Promise.allSettled([...this.imports]);
		await Promise.allSettled([...this.worktreeOperations]);
		await Promise.allSettled([...this.projectMutations.keys()]);
		await this.openCode.close();
		this.store.close();
	}
}
