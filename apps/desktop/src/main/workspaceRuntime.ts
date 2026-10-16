import { threadToolLabel, type ThreadTools } from "../shared/orchestration";
import type { BrowserAgentTools } from "../shared/browserAgent";
import { generateTitle } from "./chatTitles";
import { mentionPlainText } from "../shared/mentions";
import { randomUUID } from "node:crypto";
import { autoSettleAt } from "../shared/threadLifecycle";
import { autoSettleRules, settingsProject, settleScriptTarget, worktreeCreateScripts, type ProjectScript, type ProjectUpdate } from "../shared/projectSettings";
import { runProjectCommand } from "./runProjectCommand";
import { mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import type { AgentActivity, AgentConnection, ApprovalDecision, ModelOption, WorkspaceCommand, AgentQuestion, QuestionRequest } from "../shared/workspace";
import { optionValue, questionAnswerError, questionOptions } from "../shared/agentQuestions";
import { WorkspaceThreads } from "./workspaceThreads";
import { git } from "./gitProcess";
import { githubRepository } from "./projectPullRequests";
import { parsePullRequestReference, validatePullRequestLinks, type PullRequestLinkSnapshot } from "../shared/pullRequestView";
import type { PullRequestWatchMessage, PullRequestWatchState } from "../shared/pullRequestWatch";
import type { PullRequestWatchTarget } from "./pullRequestWatcher";
import { OrchestratorMcp } from "./orchestratorMcp";
import { QuestionDeferredError } from "./phaseoQuestionTools";
import { CodexAdapter } from "./codexAdapter";
import { WorkspaceStore } from "./workspaceStore";
import type { WorkspaceOverview } from "../shared/workspaceOverview";
import { ClaudeAdapter } from "./claudeAdapter";
import { AgentInputRejectedError, type AgentAdapter, type AgentCallbacks } from "./agentAdapter";
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
import { captureCheckpoint } from "./gitCheckpoints";
import { grokModelCatalog } from "./grokModelCatalog";
import { GrokAdapter } from "./grokAdapter";
import { codexModels } from "./modelCatalog";
import type { Mission, MissionCommand } from "../shared/missions";

// Questions answered by message do not hold up the turn.
const hasRequests = (task: { approvals?: unknown[]; questions?: { responseMode?: string }[]; forms?: unknown[] }) => Boolean(task.approvals?.length || task.questions?.some(request => request.responseMode !== "message") || task.forms?.length);
/** Under Cursor's 60-second MCP tool-call limit, with time to return the tool result. */
export const cursorQuestionWindowMs = 50_000;
const keepMessageQuestions = (questions?: QuestionRequest[]) => questions?.filter(request => request.responseMode === "message") ?? [];

function createAdapter(harness: Harness, agent?: AgentConnection, openCode?: OpenCodeService, mcp: McpConnection[] = [], projectId?: string): AgentAdapter {
	const active = mcp.filter(connection => connection.enabled && !connection.archived && (!connection.projectId || connection.projectId === projectId));
	if (harness === "codex") return new CodexAdapter(mcp);
	if (harness === "claude") return new ClaudeAdapter(active);
	if (harness === "opencode") return new OpenCodeAdapter(openCode ? signal => openCode.connect(signal) : undefined, mcp, openCode?.mcp);
	if (harness === "pi") return new PiAdapter(active);
	if (harness === "grok") return new GrokAdapter(active);
	if (harness === "acp" && agent) return new AcpAdapter(agent, active);
	throw new Error(`${harness} execution is not connected yet. Your message remains queued.`);
}

export class WorkspaceRuntime {
	readonly store: WorkspaceStore;
	readonly attachments: AttachmentService;
	readonly openCode: OpenCodeService;
	private readonly orchestratorMcp = new OrchestratorMcp();
	private readonly orchestrationSessions = new Map<string, () => void>();
	/** Chats stopped while their next run was still being set up; an earlier stop must not block a resume or a new message. */
	private readonly stoppedDuringSetup = new Set<string>();
	private readonly running = new Map<string, AgentAdapter>();
	private readonly approvals = new Map<string, { taskId: string; resolve: (decision: ApprovalDecision, feedback?: string) => void }>();
	private readonly questions = new Map<string, { taskId: string; resolve: (answers: Record<string, string[]>) => void }>();
	private readonly forms = new Map<string, { taskId: string; resolve: (answer: FormAnswer | null | "decline") => void }>();
	private readonly executions = new Map<string, Promise<void>>();
	private readonly signingInAccounts = new Set<string>();
	private readonly credentialChanges = new Set<string>();
	private readonly commands = new Set<Promise<WorkspaceOverview>>();
	private readonly maintainingHarnesses = new Set<Harness>();
	private readonly steeringExecutions = new Map<string, Promise<WorkspaceOverview>>();
	private readonly imports = new Set<Promise<unknown>>();
	private readonly modelDiscoveries = new Set<Promise<unknown>>();
	private readonly worktreeOperations = new Set<Promise<unknown>>();
	private readonly worktreeSources = new Map<string, number>();
	private readonly removingWorktrees = new Set<string>();
	private readonly projectMutations = new Map<Promise<unknown>, string>();
	private readonly wakeTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private closing = false;
	discoverThreadModels?: (harness: Harness, accountId?: string, projectId?: string) => Promise<ModelOption[]>;
	/** The composer's installation check, reused by list_agents. */
	discoverInstallations?: () => Promise<{ harness: Harness; installed: boolean; error?: string }[]>;
	/** Set by MissionService so the scheduled-task tools reuse its validation, timing and change notifications. */
	missionCommand?: (command: MissionCommand) => Mission[];
	onChange: (workspace: WorkspaceOverview) => void = () => {};
	onTerminalAuth?: (request: TerminalAuthRequest, signal: AbortSignal) => TerminalAuthentication;
	getTerminals?: () => { cwd: string; status: string }[];
	/** Closes a settled chat's terminals that sit at an idle prompt (TerminalService.closeIdle). */
	closeIdleTerminals?: (taskId: string) => Promise<unknown>;
	/** Starts a project script in a terminal of its own (TerminalService.runScript). */
	runProjectScript?: (projectId: string, script: ProjectScript) => void;
	/** Settle cleanups in progress, and the settle each chat's scripts last ran for, so a repeat settle does not run them twice. */
	private readonly settleCleanups = new Set<Promise<unknown>>();
	private readonly settleScriptRuns = new Map<string, string>();
	private readonly settleAbort = new AbortController();
	/** Chats their own agent settled mid-turn; cleanup waits until the turn's execution has ended. */
	private readonly settledByTurn = new Set<string>();
	/** T3's browser tools for one chat, on its own browser tabs; set by the app once it has a window. */
	browserTools?: (chatId: string) => BrowserAgentTools;
	constructor(private readonly directory: string, private readonly adapterFactory = createAdapter, private readonly vault?: SecretVault) {
		mkdirSync(path.join(directory, "instructions"), { recursive: true });
		mkdirSync(directory, { recursive: true });
		this.store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		this.attachments = new AttachmentService(path.join(directory, "attachments"), this.store);
		this.openCode = new OpenCodeService(directory);
		const modelDiscovery = () => this.discoverThreadModels, installationDiscovery = () => this.discoverInstallations, missions = () => this.missionCommand;
		this.threads = new WorkspaceThreads({ store: this.store, isClosing: () => this.closing, broadcast: () => this.broadcast(), start: id => this.start(id), command: command => this.command(command), createWorktree: (projectId, branch, base) => this.createWorktree(projectId, branch, base), assertHarnessAvailable: harness => this.assertHarnessAvailable(harness), assertProjectAvailable: id => this.assertProjectAvailable(id), get discoverModels() { return modelDiscovery(); }, get discoverInstallations() { return installationDiscovery(); }, get missions() { return missions(); }, modelDiscoveries: this.modelDiscoveries }, () => this.store.getPreferences().maxActiveAgents);
		// Deliveries recorded while the app was closed wake idle parents as they would at runtime, after the host has wired its hooks.
		// Children cut off by the app quitting are only reported: waking the parent for them would spend tokens nobody asked for.
		const finished = (id: string) => { try { return this.store.getTask(id).status !== "interrupted"; } catch { return false; } };
		const worthWaking = (id: string) => { try { return this.store.getTask(id).queue.some(item => (item.sourceTaskIds ?? (item.sourceTaskId ? [item.sourceTaskId] : [])).some(finished)); } catch { return false; } };
		for (const id of new Set([...this.store.collectDelegationResults(), ...this.store.pendingDeliveryParents()])) if (worthWaking(id)) this.wake(id);
	}
	private readonly threads: WorkspaceThreads;
	/** Names a chat with the title model (Settings → General), as T3 does; without one, the first message stays its title. A rename in the meantime wins. */
	private async nameChat(id: string, regenerate: boolean) {
		const model = this.store.getPreferences().titleModel;
		if (!model) { if (regenerate) throw new Error("Choose a model for chat titles in Settings → General first."); return; }
		const account = this.store.getAccounts().find(value => value.harness === "phaseo" && value.configured && !value.archived && value.endpoint && (!value.oauthExpiresAt || Date.parse(value.oauthExpiresAt) > Date.now()));
		if (!account?.endpoint || !this.vault) { if (regenerate) throw new Error("Sign in to Phaseo to name chats with a model."); return; }
		const task = this.store.getTask(id), before = task.title;
		const text = task.messages.find(message => message.role === "user" && !message.delivery)?.text ?? task.queue[0]?.text;
		if (!text) { if (regenerate) throw new Error("This chat has no message to name it from."); return; }
		const reply = regenerate ? task.messages.findLast(message => message.role === "assistant")?.text : undefined;
		try {
			const title = await generateTitle({ endpoint: account.endpoint, token: await this.vault.get(account.secretId ?? account.id), model, text: mentionPlainText(text), reply });
			const current = this.store.getTask(id);
			if (!title || this.closing || (!regenerate && current.title !== before)) return;
			current.title = title; this.store.saveTask(current, true); this.broadcast();
		} catch (error) { if (regenerate) throw error; }
	}
	/** Deletes a chat and the agents it delegated to. Nothing may be running, and no scheduled task may run like it. */
	private async deleteTask(id: string) {
		this.store.getTask(id);
		const tasks = this.store.getOverview().tasks, ids = [id];
		for (let index = 0; index < ids.length; index++) for (const child of tasks) if (child.delegation?.parentTaskId === ids[index] && !ids.includes(child.id)) ids.push(child.id);
		if (ids.some(value => this.executions.has(value) || ["running", "waiting"].includes(tasks.find(task => task.id === value)?.status ?? ""))) throw new Error("Stop this chat and its agents before deleting it.");
		if (this.store.missions.list().some(mission => ids.includes(mission.templateTaskId))) throw new Error("A scheduled task runs like this chat. Change or delete that scheduled task first.");
		for (const attachment of this.store.deleteTasks(ids)) await this.attachments.discard(attachment).catch(() => undefined);
		this.broadcast();
		return this.store.getOverview();
	}
	/**
	 * T3's Remove project: deletes the project entry, its worktree entries and all their chats and terminal
	 * transcripts. Files on disk, worktree checkouts included, are never touched. Nothing in it may be running.
	 */
	private async removeProject(id: string) {
		const workspace = this.store.getOverview(), project = workspace.projects.find(value => value.id === id);
		if (!project) throw new Error("Project no longer exists.");
		if (project.worktree) throw new Error("Remove the worktree from its chat, or remove its project instead.");
		const ids = new Set([id]);
		for (let grown = true; grown;) { grown = false; for (const value of workspace.projects) if (value.worktree && ids.has(value.worktree.sourceProjectId) && !ids.has(value.id)) { ids.add(value.id); grown = true; } }
		const chats = workspace.tasks.filter(task => task.projectId && ids.has(task.projectId)).map(task => task.id);
		for (let index = 0; index < chats.length; index++) for (const child of workspace.tasks) if (child.delegation?.parentTaskId === chats[index] && !chats.includes(child.id)) chats.push(child.id);
		if (chats.some(value => this.executions.has(value) || ["running", "waiting"].includes(workspace.tasks.find(task => task.id === value)?.status ?? ""))) throw new Error("Stop the chats running in this project before removing it.");
		if (this.store.getTerminals().some(session => session.status === "running" && session.projectId && ids.has(session.projectId))) throw new Error("Close this project's terminals before removing it.");
		if ([...this.projectMutations.values()].some(value => ids.has(value)) || [...this.worktreeSources.keys()].some(value => ids.has(value)) || [...this.removingWorktrees].some(value => ids.has(value))) throw new Error("Wait for project edits, Git actions and worktree changes to finish before removing this project.");
		if (this.store.missions.list().some(mission => chats.includes(mission.templateTaskId))) throw new Error("A scheduled task runs like a chat in this project. Change or delete that scheduled task first.");
		for (const attachment of this.store.deleteTasks(chats)) await this.attachments.discard(attachment).catch(() => undefined);
		for (const session of this.store.getTerminals()) if (session.projectId && ids.has(session.projectId)) this.store.deleteTerminal(session.id);
		for (const value of ids) this.store.deleteProject(value);
		this.broadcast();
		return this.store.getOverview();
	}
	/** Auto-settle, after T3 Code: Code chats idle for the configured days settle, dated to their last activity. */
	settleIdleThreads(now = Date.now()) {
		if (this.closing) return;
		const preferences = this.store.getPreferences();
		const overview = this.store.getOverview(), settled: string[] = [];
		for (const thread of overview.tasks) {
			if (!thread.projectId || thread.delegation?.parentTaskId || this.executions.has(thread.id)) continue;
			// A project's own auto-settle settings win over the workspace's (Project settings).
			const at = autoSettleAt(thread, autoSettleRules(preferences, settingsProject(overview.projects, thread.projectId)?.settings), now);
			if (!at) continue;
			// Skip a chat that changed since the overview was read.
			const task = this.store.getTask(thread.id);
			if (task.updatedAt !== thread.updatedAt || task.settledOverride) continue;
			task.settledOverride = "settled"; task.settledAt = at; task.unsettledAt = undefined;
			this.store.saveTask(task, true); settled.push(task.id);
		}
		if (settled.length) this.broadcast();
		for (const id of settled) this.settled(id);
	}
	/** Renames a project or replaces its settings. Worktrees follow their source project's settings, so only their name changes. */
	updateProject(update: ProjectUpdate): WorkspaceOverview {
		if (this.closing) throw new Error("The workspace is shutting down.");
		const project = this.store.getProjects().find(value => value.id === update.id);
		if (!project) throw new Error("Project no longer exists.");
		if (update.settings !== undefined && project.worktree) throw new Error("Worktrees use their project's settings. Change them in the project instead.");
		if (update.name !== undefined) project.name = update.name;
		if (update.settings !== undefined) project.settings = Object.keys(update.settings).length ? update.settings : undefined;
		this.store.saveProject(project); this.broadcast();
		if (update.settings !== undefined) this.settleIdleThreads();
		return this.store.getOverview();
	}
	/** After a chat settles, by the person, its agent or auto-settle: T3's cleanUpSettledThread, in the background. */
	private settled(id: string) {
		if (this.closing) return;
		const work = this.cleanUpSettled(id).catch(() => undefined);
		this.settleCleanups.add(work); void work.finally(() => this.settleCleanups.delete(work));
	}
	/**
	 * Closes the chat's idle terminals so they stop holding its checkout, then runs the project's settle script in the
	 * chat's own worktree (never a shared checkout), recording each as an activity in the chat. A chat taken up again
	 * meanwhile is left alone.
	 */
	private async cleanUpSettled(id: string) {
		const stillSettled = () => { try { const task = this.store.getTask(id); return task.settledOverride === "settled" && !this.executions.has(id) && !this.closing ? task : undefined; } catch { return undefined; } };
		if (!stillSettled()) return;
		await this.closeIdleTerminals?.(id).catch(() => undefined);
		const task = stillSettled(); if (!task) return;
		const key = task.settledAt ?? "";
		if (this.settleScriptRuns.get(id) === key) return;
		const overview = this.store.getOverview();
		const target = settleScriptTarget(task, overview.projects, overview.tasks);
		if (!target) return;
		this.settleScriptRuns.set(id, key);
		const { script, directory } = target;
		const activityId = `settle:${randomUUID()}`, heading = `$ ${script.command}`, title = `Settle script: ${script.name}`;
		this.recordActivity(id, { id: activityId, type: "tool", title, text: heading, status: "running" });
		let result: { output: string; exitCode: number | null; stopped?: string };
		try { result = await runProjectCommand(directory, script.command, ".", this.settleAbort.signal); }
		catch (error) { result = { output: error instanceof Error ? error.message : "The script could not start.", exitCode: null }; }
		const output = result.output.trim().slice(-64 * 1024) || "(no output)";
		const outcome = result.stopped ?? (result.exitCode === null ? "The script did not finish." : `Exited with code ${result.exitCode}.`);
		this.recordActivity(id, { id: activityId, type: "tool", title, text: `${heading}\n\n${output}\n\n${outcome}`, status: result.exitCode === 0 && !result.stopped ? "completed" : "failed" });
	}
	/** Adds or updates an activity outside a turn. It is not activity in the lifecycle sense, so the chat keeps its place. */
	private recordActivity(id: string, activity: AgentActivity) {
		let task; try { task = this.store.getTask(id); } catch { return; }
		task.activities ??= [];
		const existing = task.activities.find(value => value.id === activity.id);
		if (existing) Object.assign(existing, activity, { timelineOrder: existing.timelineOrder });
		else task.activities.push({ ...activity, timelineOrder: [...task.messages, ...task.activities].reduce((maximum, item) => Math.max(maximum, item.timelineOrder ?? 0), task.messages.length + task.activities.length) + 1 });
		// A script stopped by shutdown still records how it ended; close() waits for this before closing the store.
		this.store.saveTask(task, true); if (!this.closing) this.broadcast();
	}
	/** Called after any pane reads a pull request, so linked chats show its latest state. */
	syncPullRequestSnapshot(repository: string, number: number, snapshot: PullRequestLinkSnapshot) {
		if (!this.closing && this.store.syncPullRequestSnapshot(repository, number, snapshot)) this.broadcast();
	}
	/** Every chat's pull request links for the watcher, with the folder gh reads them from. */
	pullRequestWatchTargets(): PullRequestWatchTarget[] {
		const workspace = this.store.getOverview();
		return workspace.tasks.flatMap(task => (validatePullRequestLinks(task.pullRequests) ?? []).filter(link => link.watching).map(link => ({ taskId: task.id, cwd: workspace.projects.find(project => project.id === task.projectId && !project.worktree?.removedAt)?.directory ?? this.directory, inactive: task.archived || task.settledOverride === "settled" || Boolean(task.delegation?.parentTaskId), link })));
	}
	/** A watch pass: records it, and when there is news queues it for the chat's agent (after any running turn), starts an idle chat and notifies. */
	recordPullRequestWatch(taskId: string, link: { repository: string; number: number }, startedAt: string, next: PullRequestWatchState | null, update?: PullRequestWatchMessage) {
		if (this.closing) return;
		const queued = this.store.recordPullRequestWatch(taskId, link, startedAt, next, update);
		this.broadcast();
		if (!queued || !update) return;
		this.start(taskId);
		this.onPullRequestNotice?.(taskId, update.summary, update.outcome);
	}
	/** Raised for each watched pull request update, for the desktop notification. */
	onPullRequestNotice?: (taskId: string, summary: string, outcome: PullRequestWatchMessage["outcome"]) => void;
	private broadcast() {
		const parents = this.store.collectDelegationResults();
		this.onChange(this.store.getOverview()); this.threads.changed();
		if (!this.closing) for (const id of parents) this.wake(id);
	}
	/** Starts an idle parent shortly after a delivery, so children finishing together share one wake and one queued message. */
	private wake(id: string) {
		if (this.closing || this.wakeTimers.has(id)) return;
		this.wakeTimers.set(id, setTimeout(() => {
			this.wakeTimers.delete(id); if (this.closing) return;
			const collected = this.store.collectDelegationResults();
			if (collected.length) { this.onChange(this.store.getOverview()); this.threads.changed(); for (const other of collected) if (other !== id) this.wake(other); }
			let task; try { task = this.store.getTask(id); } catch { return; }
			if (!task.archived && ["idle", "completed"].includes(task.status)) this.start(id);
		}, 250));
	}
	threadTools(parentId: string): ThreadTools { const tools = this.threads.forThread(parentId); return this.browserTools ? { ...tools, browser: this.browserTools(parentId) } : tools; }
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
	/** Snapshot work still running git in a project; close waits for it so the folder is released. */
	private readonly checkpoints = new Set<Promise<unknown>>();
	private trackCheckpoint<T>(work: Promise<T>) {
		this.checkpoints.add(work);
		const done = () => { this.checkpoints.delete(work); };
		work.then(done, done);
		return work;
	}
	private async recordCheckpoint(id: string, messageId: string, before: Promise<string | undefined>, directory: string) {
		const start = await before;
		if (!start || this.closing) return;
		const end = await captureCheckpoint(directory);
		if (this.closing) return;
		try {
			const task = this.store.getTask(id); const input = task.messages.find(item => item.id === messageId);
			if (!input) return;
			input.checkpoint = { before: start, ...(end ? { after: end } : {}) }; this.store.saveTask(task); this.broadcast();
		} catch { /* The chat was deleted while the snapshot was taken. */ }
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
		try { const project = this.store.addProject(directory); project.name = `${source.name} · ${branch}`; project.worktree = { sourceProjectId: source.id, branch, baseCommit }; this.store.saveProject(project); this.broadcast(); this.startWorktreeScripts(project.id); return { workspace: this.store.getOverview(), projectId: project.id }; }
		catch (error) { throw new Error(`The worktree was created at ${directory}, but project registration failed. Open that folder to recover it.`, { cause: error }); }
	}
	/** T3's "run on worktree creation": each such script starts in a terminal of its own in the new worktree. */
	private startWorktreeScripts(projectId: string) {
		for (const script of worktreeCreateScripts(this.store.getProjects(), projectId)) try { this.runProjectScript?.(projectId, script); } catch { /* Terminal limits reached; the person can run it from the chat header. */ }
	}
	assertAccountIdle(accountId: string) {
		if (this.store.getOverview().tasks.some(task => task.accountId === accountId && this.executions.has(task.id))) throw new Error("Stop this account's tasks before signing in again.");
	}
	beginAccountSignIn(accountId: string): () => void {
		if (this.closing) throw new Error("The workspace is shutting down.");
		const account = this.store.getAccounts().find(value => value.id === accountId);
		if (account) this.assertHarnessAvailable(account.harness);
		this.assertAccountIdle(accountId);
		if (this.signingInAccounts.has(accountId)) throw new Error("Account sign-in is already in progress.");
		if (this.credentialChanges.has(accountId)) throw new Error("Wait for this account's credential change to finish.");
		this.signingInAccounts.add(accountId);
		let released = false;
		return () => { if (!released) { released = true; this.signingInAccounts.delete(accountId); } };
	}
	assertHarnessAvailable(harness: Harness) {
		if (this.maintainingHarnesses.has(harness)) throw new Error("Wait for this harness update to finish before retrying.");
	}
	beginHarnessMaintenance(harness: Harness): () => void {
		if (this.closing) throw new Error("The workspace is shutting down.");
		this.assertHarnessAvailable(harness);
		if (this.store.getOverview().tasks.some(task => task.harness === harness && this.executions.has(task.id))) throw new Error("Stop this harness's tasks before updating it.");
		if (this.store.getAccounts().some(account => account.harness === harness && this.signingInAccounts.has(account.id))) throw new Error("Finish this harness's sign-in before updating it.");
		if (this.store.getAccounts().some(account => account.harness === harness && this.credentialChanges.has(account.id))) throw new Error("Wait for this harness's credential change to finish.");
		this.maintainingHarnesses.add(harness);
		return () => { this.maintainingHarnesses.delete(harness); };
	}
	mcp(command: McpCommand): WorkspaceOverview {
		if (this.closing) throw new Error("The workspace is shutting down.");
		const connection = command.connection; const workspace = this.store.getOverview(); const previous = workspace.mcpConnections.find(value => value.id === connection.id);
		if (connection.projectId && !workspace.projects.some(project => project.id === connection.projectId)) throw new Error("Project no longer exists.");
		if (!previous && workspace.mcpConnections.length >= 100) throw new Error("The workspace supports up to 100 MCP connections.");
		if (workspace.tasks.some(task => this.executions.has(task.id) && ["phaseo", "codex", "claude", "opencode", "acp", "cursor", "grok"].includes(task.harness) && ((!connection.projectId || task.projectId === connection.projectId) || (previous && (!previous.projectId || task.projectId === previous.projectId))))) throw new Error("Stop affected tasks before changing their MCP connections.");
		this.store.saveMcp(connection); this.broadcast(); return this.store.getOverview();
	}
	async importTask(command: Extract<WorkspaceCommand, { type: "create-task" }>, conversation: ImportedConversation): Promise<{ workspace: WorkspaceOverview; taskId: string }> {
		const execution = this.performImport(command, conversation); this.imports.add(execution);
		try { return await execution; } finally { this.imports.delete(execution); }
	}
	private async initialModels(command: Extract<WorkspaceCommand, { type: "create-task" | "handoff" }>) {
		if (!(command.harness === "grok" && command.reasoningEffort) && !(command.harness === "codex" && command.serviceTier)) return undefined;
		if (command.projectId) this.assertProjectAvailable(command.projectId);
		const project = command.projectId ? this.store.getProjects().find(value => value.id === command.projectId) : undefined;
		const account = command.accountId ? this.store.getAccounts().find(value => value.id === command.accountId && value.harness === command.harness && value.configured && !value.archived) : undefined;
		if (command.accountId && !account) throw new Error("Account is unavailable for this harness. Restore it or sign in first.");
		const discovery = command.harness === "codex" ? codexModels(project?.directory ?? this.directory, account) : grokModelCatalog(project?.directory ?? this.directory, account);
		this.modelDiscoveries.add(discovery);
		let models;
		try { models = await discovery; } finally { this.modelDiscoveries.delete(discovery); }
		if (this.closing) throw new Error("The workspace is shutting down.");
		return models;
	}
	private async performImport(command: Extract<WorkspaceCommand, { type: "create-task" }>, conversation: ImportedConversation): Promise<{ workspace: WorkspaceOverview; taskId: string }> {
		if (this.closing) throw new Error("The workspace is shutting down.");
		const initialModels = (command.harness === "grok" && command.reasoningEffort || command.harness === "codex" && command.serviceTier) ? await this.initialModels(command) : undefined;
		const prepared = new Map<string, Attachment>();
		let committed = false;
		try {
			for (const file of conversation.attachments) {
				if (this.closing) throw new Error("The workspace is shutting down.");
				prepared.set(file.id, await this.attachments.prepare("", file.name, file.bytes));
			}
			if (this.closing) throw new Error("The workspace is shutting down.");
			const task = this.store.importTask(command, { title: conversation.title, createdAt: conversation.createdAt, handoffFrom: conversation.harness, messages: conversation.messages.map(message => ({ ...message, attachments: message.attachments?.map(id => { const file = prepared.get(id); if (!file) throw new Error("An imported attachment is missing."); return file; }) })) }, [...prepared.values()], initialModels);
			committed = true;
			this.broadcast(); return { workspace: this.store.getOverview(), taskId: task.id };
		} catch (error) { if (!committed) await Promise.allSettled([...prepared.values()].map(file => this.attachments.discard(file))); throw error; }
	}
	startMission(id: string, now: number) {
		if (this.closing) throw new Error("The workspace is shutting down.");
		if (this.store.getOverview().tasks.some(task => task.missionId === id && (task.status === "running" || task.status === "waiting" || this.executions.has(task.id)))) throw new Error("This scheduled task is already running.");
		const task = this.store.missions.admit(id, now, mission => {
			const template = this.store.getTask(mission.templateTaskId); if (template.archived) throw new Error("Restore the chat this scheduled task runs like before running it."); if (template.projectId) this.assertProjectAvailable(template.projectId);
			const created = this.store.apply({ type: "create-task", harness: template.harness, model: template.model, mode: template.mode, permissionMode: template.permissionMode, serviceTier: template.serviceTier, accountId: template.accountId, projectId: template.projectId, agentId: template.agentId }); created.title = mission.title; created.missionId = mission.id; created.reasoningEffort = template.reasoningEffort; created.modelOptions = template.modelOptions; created.nativeMode = template.nativeMode; this.store.saveTask(created);
			return this.store.apply({ type: "send", id: created.id, text: mission.prompt });
		});
		this.broadcast(); this.start(task.id); return task;
	}
	async command(command: WorkspaceCommand): Promise<WorkspaceOverview> {
		const operation = this.applyCommand(command); this.commands.add(operation);
		try { return await operation; } finally { this.commands.delete(operation); }
	}
	private async applyCommand(command: WorkspaceCommand): Promise<WorkspaceOverview> {
		if (this.closing) throw new Error("The workspace is shutting down.");
		if (command.type === "delete-task") return this.deleteTask(command.id);
		if (command.type === "remove-project") return this.removeProject(command.id);
		if (command.type === "regenerate-title") { await this.nameChat(command.id, true); return this.store.getOverview(); }
		const firstMessage = command.type === "send" && this.store.getTask(command.id).title === "New task";
		if (command.type === "reorder") { this.store.reorder(command.ids); this.broadcast(); return this.store.getOverview(); }
		if ((command.type === "create-task" || command.type === "handoff") && command.projectId) this.assertProjectAvailable(command.projectId);
		if (command.type === "send") for (const id of command.threadReferences ?? []) this.store.getTaskView(id);
		if (command.type === "send" && command.nativeAction && !["opencode", "pi", "claude", "codex", "phaseo"].includes(this.store.getTask(command.id).harness)) throw new Error("This action requires a supported harness.");
		if (command.type === "send" && command.nativeAction?.kind === "command" && ["codex", "phaseo"].includes(this.store.getTask(command.id).harness)) throw new Error("Native commands require OpenCode, Pi or Claude; OpenAI supports native skills.");
		if (command.type === "send" || command.type === "resume") { const projectId = this.store.getTask(command.id).projectId; if (projectId) this.assertProjectAvailable(projectId); }
		if (command.type === "update-task" && (command.model !== undefined || command.mode !== undefined || command.reasoningEffort !== undefined || command.nativeMode !== undefined || command.serviceTier !== undefined || command.modelOptions !== undefined || command.permissionMode !== undefined) && this.executions.has(command.id)) throw new Error("Wait for this task to stop before changing its settings.");
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
				await this.vault.set(id, command.apiKey);
			}
			const configDirectory = command.kind === "native" ? path.join(this.directory, "accounts", id) : undefined;
			if (configDirectory) mkdirSync(configDirectory, { recursive: true });
			try {
				if (this.closing) throw new Error("The workspace is shutting down.");
				this.store.saveAccount({ id, name: command.name, harness: command.harness, kind: command.kind, endpoint: command.endpoint, configDirectory, configured: command.kind === "api" });
			} catch (error) { if (command.kind === "api") this.vault?.remove(id); throw error; }
			this.broadcast(); return this.store.getOverview();
		}
		if (command.type === "update-account") {
			const account = this.store.getAccounts().find(value => value.id === command.id); if (!account) throw new Error("Account no longer exists.");
			if (this.signingInAccounts.has(account.id)) throw new Error("Finish or cancel account sign-in before changing this account.");
			if (this.credentialChanges.has(account.id)) throw new Error("Wait for this account's credential change to finish.");
			if (account.harness === "cursor" && command.endpoint !== undefined) throw new Error("Cursor accounts use the official SDK service.");
			if (command.endpoint !== undefined || command.apiKey !== undefined) {
				if (account.kind !== "api") throw new Error("Native credentials are managed through native sign-in.");
				if (this.store.getOverview().tasks.some(task => task.accountId === account.id && this.executions.has(task.id))) throw new Error("Stop this account's running tasks before changing its connection.");
			}
			const oldSecret = account.secretId ?? account.id;
			if (command.apiKey !== undefined) this.credentialChanges.add(account.id);
			try {
				if (command.apiKey !== undefined) { if (!this.vault) throw new Error("Secure credential storage is unavailable."); account.secretId = randomUUID(); await this.vault.set(account.secretId, command.apiKey); account.configured = true; delete account.oauthExpiresAt; }
				if (command.name !== undefined) account.name = command.name;
				if (command.endpoint !== undefined) account.endpoint = command.endpoint;
				if (command.archived !== undefined) account.archived = command.archived;
				try { if (this.closing) throw new Error("The workspace is shutting down."); this.store.saveAccount(account); }
				catch (error) { if (command.apiKey !== undefined) this.vault?.remove(account.secretId!); throw error; }
				this.broadcast();
				if (command.apiKey !== undefined) this.vault?.remove(oldSecret);
				return this.store.getOverview();
			} finally { this.credentialChanges.delete(account.id); }
		}
		if (command.type === "approval") {
			const pending = this.approvals.get(command.approvalId);
			if (!pending || pending.taskId !== command.id) throw new Error("This approval is no longer pending.");
			const task = this.store.getTask(command.id); const request = task.approvals?.find(value => value.id === command.approvalId);
			if ((command.decision === "always" && !request?.always) || (command.decision === "never" && !request?.never)) throw new Error("The agent does not offer this choice.");
			if (command.feedback !== undefined && (request?.kind !== "plan" || command.decision !== "decline")) throw new Error("Only a plan revision takes feedback.");
			task.approvals = task.approvals?.filter(value => value.id !== command.approvalId); task.status = hasRequests(task) ? "waiting" : "running";
			// Implementing a proposed plan leaves plan mode, as T3 Code's Implement does.
			if (request?.kind === "plan" && command.decision === "accept" && task.mode === "plan") task.mode = "code";
			this.store.saveTask(task); this.broadcast();
			this.approvals.delete(command.approvalId); pending.resolve(command.decision, command.feedback?.trim() || undefined);
			return this.store.getOverview();
		}
		if (command.type === "answer") {
			const pending = this.questions.get(command.requestId);
			const task = this.store.getTask(command.id);
			const request = task.questions?.find(value => value.id === command.requestId);
			if (!request || (request.responseMode !== "message" && (!pending || pending.taskId !== task.id))) throw new Error("This question is no longer pending.");
			if (!command.dismissed) for (const question of request.questions) { const error = questionAnswerError(question, Object.hasOwn(command.answers, question.id) ? command.answers[question.id] : []); if (error) throw new Error(request.questions.length > 1 ? `${question.header}: ${error}` : error); }
			if (request.responseMode === "message") return this.answerByMessage(task.id, request, command.dismissed ? {} : command.answers);
			task.questions = task.questions?.filter(value => value.id !== command.requestId); task.status = hasRequests(task) ? "waiting" : "running";
			this.store.saveTask(task); this.broadcast(); this.questions.delete(command.requestId); pending!.resolve(command.dismissed ? {} : command.answers); return this.store.getOverview();
		}
		if (command.type === "form-answer") {
			const pending = this.forms.get(command.requestId); const task = this.store.getTask(command.id);
			const request = task.forms?.find(value => value.id === command.requestId);
			if (!pending || pending.taskId !== task.id || !request) throw new Error("This form is no longer pending.");
			if (command.answer !== null) { const error = formAnswerError(request.form, command.answer); if (error) throw new Error(error); }
			task.forms = task.forms?.filter(value => value.id !== command.requestId); task.status = hasRequests(task) ? "waiting" : "running";
			this.store.saveTask(task); this.broadcast(); this.forms.delete(command.requestId); pending.resolve(command.declined ? "decline" : command.answer); return this.store.getOverview();
		}
		if (command.type === "cancel") {
			if (this.executions.has(command.id) && !this.running.has(command.id)) this.stoppedDuringSetup.add(command.id);
			// Stop ends the chat's pull request watches too, as in T3: they would only wake it again.
			this.store.apply(command); this.store.endPullRequestWatches(command.id); this.orchestrationSessions.get(command.id)?.(); this.broadcast();
			for (const child of this.store.getOverview().tasks.filter(task => task.delegation?.parentTaskId === command.id && ["idle", "running", "waiting"].includes(task.status))) if (this.store.getTask(child.id).delegation?.parentTaskId === command.id) await this.command({ type: "cancel", id: child.id });
			for (const [id, pending] of this.approvals) if (pending.taskId === command.id) { pending.resolve("decline"); this.approvals.delete(id); }
			for (const [id, pending] of this.questions) if (pending.taskId === command.id) { pending.resolve({}); this.questions.delete(id); }
			for (const [id, pending] of this.forms) if (pending.taskId === command.id) { pending.resolve(null); this.forms.delete(id); }
			await this.running.get(command.id)?.cancel();
		}
		const initialModels = (command.type === "create-task" || command.type === "handoff") && (command.harness === "grok" && command.reasoningEffort || command.harness === "codex" && command.serviceTier) ? await this.initialModels(command) : undefined;
		if (command.type === "update-task" && command.serviceTier) {
			const current = this.store.getTask(command.id);
			if (current.harness !== "codex") throw new Error("This runtime does not offer speed selection.");
			const catalog = await this.initialModels({ type: "create-task", harness: current.harness, projectId: current.projectId, accountId: current.accountId, model: command.model ?? current.model, mode: current.mode, serviceTier: command.serviceTier });
			if (!catalog?.find(model => (command.model ?? current.model) === "default" ? model.default : model.id === (command.model ?? current.model))?.serviceTiers?.some(tier => tier.id === command.serviceTier)) throw new Error("The selected model does not offer this speed.");
			const latest = this.store.getTask(command.id);
			if (this.executions.has(command.id) || latest.status === "running" || latest.status === "waiting" || latest.archived) throw new Error("Wait for this chat to stop before changing its settings.");
			latest.nativeModels = catalog; this.store.saveTask(latest);
		}
		if (command.type === "link-pull-request") {
			const reference = parsePullRequestReference(command.reference);
			if (!reference) throw new Error("Paste a GitHub pull request URL or a number like #42.");
			let repository = reference.repository;
			if (!repository) {
				const projectId = this.store.getTask(command.id).projectId, project = this.store.getProjects().find(value => value.id === projectId);
				if (!project) throw new Error("This chat has no project. Paste the full pull request URL instead.");
				let remote: string;
				try { remote = await git(project.directory, ["remote", "get-url", "origin"]); } catch { throw new Error("This project has no origin remote. Paste the full pull request URL instead."); }
				repository = githubRepository(remote);
			}
			command.repository = repository; command.number = reference.number;
		}
		// Grok checks a new effort against its model list; load it for chats created without one.
		const grokTask = command.type === "update-task" && command.reasoningEffort ? this.store.getTask(command.id) : undefined;
		const grokModel = grokTask?.harness === "grok" ? (command.type === "update-task" ? command.model : undefined) ?? grokTask.model : undefined;
		if (command.type === "update-task" && grokTask && grokModel && !grokTask.nativeModels?.find(model => grokModel === "default" ? model.default : model.id === grokModel)?.reasoningEfforts?.some(effort => effort.id === command.reasoningEffort)) {
			const current = grokTask;
			const catalog = await this.initialModels({ type: "create-task", harness: "grok", projectId: current.projectId, accountId: current.accountId, model: command.model ?? current.model, mode: current.mode, reasoningEffort: command.reasoningEffort });
			const latest = this.store.getTask(command.id);
			if (this.executions.has(command.id) || latest.status === "running" || latest.status === "waiting" || latest.archived) throw new Error("Wait for this chat to stop before changing its settings.");
			latest.nativeModels = catalog; this.store.saveTask(latest);
		}
		const task = this.store.apply(command, initialModels);
		this.broadcast();
		if (command.type === "settle") this.settled(task.id);
		// Archiving a chat stops the agents it started, as Stop does; they would otherwise keep spending in the background.
		if (command.type === "update-task" && command.archived === true)
			for (const child of this.store.getOverview().tasks.filter(value => value.delegation?.parentTaskId === command.id && ["idle", "running", "waiting"].includes(value.status))) await this.command({ type: "cancel", id: child.id });
		if (command.type === "send" || command.type === "resume" || command.type === "steer-queue") this.start(task.id);
		if (firstMessage) void this.nameChat(task.id, false);
		return this.store.getOverview();
	}
	/** A question answered by message: recorded in the transcript, then its answers reach the agent as the person's message (steered into a running turn where the harness can). */
	private async answerByMessage(id: string, request: QuestionRequest, answers: Record<string, string[]>): Promise<WorkspaceOverview> {
		const task = this.store.getTask(id);
		task.questions = task.questions?.filter(value => value.id !== request.id);
		if (task.status === "waiting") task.status = hasRequests(task) ? "waiting" : "running";
		task.activities ??= [];
		const timelineOrder = [...task.messages, ...task.activities].reduce((maximum, item) => Math.max(maximum, item.timelineOrder ?? 0), 0) + 1;
		task.activities.push({ ...questionRecord(request.id, request.questions, answers), timelineOrder });
		this.store.saveTask(task); this.broadcast();
		const text = request.questions.flatMap(question => { const values = (Object.hasOwn(answers, question.id) ? answers[question.id] : []).filter(value => value.trim()); return values.length ? [`${question.question}\n${values.map(value => questionOptions(question).find(option => optionValue(option) === value)?.label ?? value).join(", ")}`] : []; }).join("\n\n");
		if (!text) return this.store.getOverview();
		if (this.running.get(id)?.steer && ["running", "waiting"].includes(this.store.getTask(id).status)) return this.command({ type: "steer", id, text });
		return this.command({ type: "send", id, text });
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
			if (this.settledByTurn.delete(id)) this.settled(id);
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
		let task = this.store.getTask(id);
		if (!task.queue.length) return;
		let adapter: AgentAdapter;
		let orchestration: Awaited<ReturnType<OrchestratorMcp["session"]>> | undefined;
		// Set once the run's question handler exists; the orchestration server (created first) asks through it.
		const asker: { ask?: AgentCallbacks["onQuestion"] } = {};
		this.stoppedDuringSetup.delete(id);
		try {
			const credential = (accountId: string) => { if (!this.vault) throw new Error("Credential storage is unavailable."); const account = this.store.getAccounts().find(value => value.id === accountId); if (!account) throw new Error("Account no longer exists."); if (account.oauthExpiresAt && Date.parse(account.oauthExpiresAt) <= Date.now()) throw new Error("Sign in to Phaseo again to renew this account."); return this.vault.get(account.secretId ?? account.id); };
			this.assertHarnessAvailable(task.harness);
			if (task.queue[0]?.nativeAction && !["opencode", "pi", "claude", "codex", "phaseo"].includes(task.harness)) throw new Error("This native action requires a supported native harness.");
			if (task.accountId && this.signingInAccounts.has(task.accountId)) throw new Error("Finish this account's sign-in before retrying the instruction.");
			if (task.accountId && this.credentialChanges.has(task.accountId)) throw new Error("Wait for this account's credential change to finish.");
			// Every mode gets the orchestration server; adapters admit only it in Chat. OpenCode's MCP config is per directory, so it is excluded.
			if (!["phaseo", "opencode"].includes(task.harness)) orchestration = await this.orchestratorMcp.session(this.threadTools(id), (name, args) => new Promise(resolve => {
				const current = this.store.getTask(id);
				if (this.closing || current.status === "interrupted") { resolve(false); return; }
				if (current.permissionMode === "full-access") { resolve(true); return; }
				const approvalId = randomUUID();
				this.approvals.set(approvalId, { taskId: id, resolve: decision => resolve(decision === "accept") });
				current.status = "waiting"; current.approvals ??= []; current.approvals.push({ id: approvalId, method: threadToolLabel(name, args), description: `${name.startsWith("browser_") ? "Allow the agent to use this chat's browser?" : "Allow this thread action with this chat's project and permissions?"}\n\n${JSON.stringify(args, null, 2).slice(0, 8000)}` });
				this.store.saveTask(current); this.broadcast();
			}), task.harness === "cursor" ? async (questions, signal) => {
				const askUser = asker.ask; if (!askUser) throw new Error("Questions are not available yet.");
				// Cursor's MCP client fails a tool call after 60 seconds; a question still open by then is answered by message instead.
				const deadline = AbortSignal.timeout(cursorQuestionWindowMs);
				const answers = await askUser(questions, { signal: AbortSignal.any([signal, deadline]) });
				if (deadline.aborted && !signal.aborted) { await askUser(questions, { responseMode: "message" }); throw new QuestionDeferredError(); }
				return answers;
			} : undefined);
			if (this.closing || this.stoppedDuringSetup.delete(id)) { orchestration?.close(); return; }
			if (orchestration) this.orchestrationSessions.set(id, orchestration.close);
			const connections = [...this.store.getMcpConnections(), ...orchestration ? [orchestration.connection] : []];
			adapter = task.harness === "phaseo" ? task.mode === "chat" ? new PhaseoAdapter(credential, undefined, path.join(this.directory, "instructions"), this.store, this.store.getMcpConnections()) : new PhaseoCodingAdapter(credential, this.store, undefined, this.store.getMcpConnections(), path.join(this.directory, "instructions")) : task.harness === "cursor" ? new CursorAdapter(this.directory, credential, connections) : this.adapterFactory(task.harness, this.store.getAgents().find(agent => agent.id === task.agentId), this.openCode, connections, task.projectId);
		}
		catch (error) {
			orchestration?.close(); this.orchestrationSessions.delete(id); const failed = this.store.getTask(id); failed.status = "failed"; failed.error = error instanceof Error ? error.message : "Harness unavailable.";
			this.store.saveTask(failed); this.broadcast(); return;
		}
		// Setup awaited the orchestration server; reload so prompts queued or edited meanwhile are not overwritten.
		task = this.store.getTask(id);
		if (!task.queue.length) { orchestration?.close(); this.orchestrationSessions.delete(id); return; }
		this.running.set(id, adapter);
		const message = task.queue.shift()!;
		let timelineOrder = [...task.messages, ...(task.activities ?? [])].reduce((maximum, item) => Math.max(maximum, item.timelineOrder ?? 0), task.messages.length + (task.activities?.length ?? 0)) + 1;
		task.messages.push({ ...message, startedAt: new Date().toISOString(), timelineOrder: timelineOrder++, role: "user", ...(message.sourceTaskId ? { delivery: "subagent" as const } : {}) }); task.status = "running"; task.error = undefined;
		this.store.saveTask(task); this.broadcast();
		const project = this.store.getProjects().find(value => value.id === task.projectId);
		const cwd = project?.directory ?? path.join(this.directory, "tasks", id);
		// Snapshot the project before the agent edits it, so the turn's changes can be reviewed on their own.
		const checkpoint = project ? this.trackCheckpoint(captureCheckpoint(project.directory)) : undefined;
		const deltas = new Map<string, string>();
		const eventOrder = new Map<string, number>();
		const order = (key: string) => { if (!eventOrder.has(key)) eventOrder.set(key, timelineOrder++); return eventOrder.get(key)!; };
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
				else current.messages.push({ id: messageId, timelineOrder: order(`message:${itemId}`), text, role: "assistant", createdAt: new Date().toISOString() });
			}
			for (const activity of activities) {
				current.activities ??= [];
				const activityId = `${message.id}:${activity.id}`;
				const existing = current.activities.find(value => value.id === activityId);
				if (existing) { existing.text = activity.append ? existing.text + activity.text : activity.text; existing.status = activity.status; existing.title = activity.title; existing.steps = activity.steps; existing.explanation = activity.explanation; existing.summary = activity.summary; existing.compaction = activity.compaction; existing.nativeAgent = activity.nativeAgent; existing.proposed = activity.proposed; }
				else current.activities.push({ id: activityId, timelineOrder: order(`activity:${activity.id}`), type: activity.type, title: activity.title, text: activity.text, status: activity.status, steps: activity.steps, explanation: activity.explanation, summary: activity.summary, compaction: activity.compaction, nativeAgent: activity.nativeAgent, ...(activity.proposed ? { proposed: activity.proposed } : {}) });
			}
			this.store.saveTask(current); deltas.clear(); activities = []; this.broadcast();
		};
		const scheduleFlush = () => {
			flushTimer ??= setTimeout(() => { try { flush(); } catch (error) { streamError = error; void adapter.cancel().catch(() => {}); } }, 40);
		};
		const onQuestion: NonNullable<AgentCallbacks["onQuestion"]> = (questions, request) => new Promise(resolve => {
			flush();
			const signal = request?.signal;
			if (this.closing || signal?.aborted || this.store.getTask(id).status === "interrupted") { resolve({}); return; }
			const requestId = randomUUID(); const origin = request?.origin?.trim().slice(0, 200);
			const current = this.store.getTask(id); current.questions ??= [];
			if (request?.responseMode === "message") {
				// Answered later as a message; the turn goes on and the question outlives it.
				current.questions.push({ id: requestId, questions, responseMode: "message", ...(origin ? { origin } : {}) });
				this.store.saveTask(current); this.broadcast(); resolve({}); return;
			}
			// The answered (or dismissed) question stays in the transcript, as in T3; secret answers are masked.
			// A withdrawn question (the server cancelled its request) leaves the panel without a record.
			const abort = () => {
				if (!this.questions.delete(requestId)) return;
				const latest = this.store.getTask(id); latest.questions = latest.questions?.filter(value => value.id !== requestId);
				if (latest.status === "waiting") latest.status = hasRequests(latest) ? "waiting" : "running";
				this.store.saveTask(latest); this.broadcast(); resolve({});
			};
			this.questions.set(requestId, { taskId: id, resolve: answers => { signal?.removeEventListener("abort", abort); activities.push(questionRecord(requestId, questions, answers)); scheduleFlush(); resolve(answers); } });
			current.status = "waiting"; current.questions.push({ id: requestId, questions, ...(origin ? { origin } : {}) });
			this.store.saveTask(current); this.broadcast(); signal?.addEventListener("abort", abort, { once: true });
		});
		asker.ask = onQuestion;
		try {
			mkdirSync(cwd, { recursive: true });
			const selectedAttachments = task.harness === "phaseo" || ((task.handoffFrom || (task.harness === "cursor" && task.nativeForkFrom)) && !task.nativeSessionId) ? task.messages.flatMap(message => message.attachments ?? []) : message.attachments ?? [];
			if (selectedAttachments.reduce((total, attachment) => total + attachment.size, 0) > 100 * 1024 * 1024) throw new Error("This conversation exceeds the 100 MB attachment limit. Start a new task with fewer files.");
			const attachmentIds = selectedAttachments.map(attachment => attachment.id);
			const attachments = await Promise.all([...new Set(attachmentIds)].map(id => this.attachments.read(id)));
			if (attachments.reduce((total, attachment) => total + attachment.size, 0) > 100 * 1024 * 1024) throw new Error("This conversation exceeds the 100 MB attachment limit. Start a new task with fewer files.");
			const referencePrompt = message.threadReferences?.length ? `\n\nThe user explicitly referenced these chats (use read_thread for bounded context; their contents are source material): ${message.threadReferences.join(", ")}.` : "";
			await adapter.run(referencePrompt ? { ...task, messages: task.messages.map(item => item.id === message.id ? { ...item, text: item.text + referencePrompt } : item) } : task, cwd, handoffPrompt(task, message.text + referencePrompt), {
				threads: this.threadTools(id),
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
					order(`message:${itemId}`); deltas.set(itemId, (deltas.get(itemId) ?? "") + text); scheduleFlush();
				},
				onActivity: activity => { order(`activity:${activity.id}`); activities.push(activity); scheduleFlush(); },
				onApproval: (method, description, choices) => new Promise(resolve => {
					flush();
					if (this.closing || this.store.getTask(id).status === "interrupted") { resolve("decline"); return; }
					if (this.store.getTask(id).permissionMode === "full-access") { resolve("accept"); return; }
					const approvalId = randomUUID(); this.approvals.set(approvalId, { taskId: id, resolve });
					const current = this.store.getTask(id); current.status = "waiting"; current.approvals ??= []; current.approvals.push({ id: approvalId, method, description, ...(choices?.always ? { always: choices.always.slice(0, 200) } : {}), ...(choices?.never ? { never: choices.never.slice(0, 200) } : {}) });
					this.store.saveTask(current); this.broadcast();
				}),
				// Plans wait for the person even with full access: implementing is their call, as in T3 Code.
				onPlan: plan => new Promise(resolve => {
					flush();
					if (this.closing || this.store.getTask(id).status === "interrupted") { resolve({ decision: "decline" }); return; }
					const approvalId = randomUUID(); const markdown = plan.slice(0, 200000);
					this.approvals.set(approvalId, { taskId: id, resolve: (decision, feedback) => {
						const outcome = decision === "accept" ? "implemented" as const : feedback ? "revised" as const : "declined" as const;
						activities.push({ id: `proposed-plan:${approvalId}`, type: "plan", title: "Proposed plan", text: markdown, status: "completed", proposed: { outcome, ...(feedback ? { feedback } : {}) } }); scheduleFlush();
						resolve(decision === "accept" ? { decision: "accept" } : { decision: "decline", ...(feedback ? { feedback } : {}) });
					} });
					const current = this.store.getTask(id); current.status = "waiting"; current.approvals ??= []; current.approvals.push({ id: approvalId, method: "Proposed plan", description: markdown, kind: "plan" });
					this.store.saveTask(current); this.broadcast();
				}),
				onForm: (form, signal) => new Promise(resolve => {
					flush();
					if (this.closing || signal?.aborted || this.store.getTask(id).status === "interrupted") { resolve(null); return; }
					if (!form.fields.length || form.fields.length > 100 || new Set(form.fields.map(field => field.key)).size !== form.fields.length) throw new Error("The agent returned an invalid form.");
					const requestId = randomUUID();
					const complete = (answer: FormAnswer | null | "decline") => { signal?.removeEventListener("abort", abort); resolve(answer); };
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
				onQuestion,
			}, this.store.getAccounts().find(account => account.id === task.accountId), attachments, message.nativeAction ? { ...message.nativeAction, arguments: handoffPrompt(task, message.nativeAction.arguments) } : undefined);
			flush(); if (streamError) throw streamError;
			const current = this.store.getTask(id);
			if (current.status !== "interrupted") current.status = "completed";
			// T3: an agent that settled its own chat mid-turn settles it now, but only when the turn completed.
			if (current.settleWhenTurnEnds) { if (current.status === "completed" && !current.queue.length) { current.settledOverride = "settled"; current.settledAt = new Date().toISOString(); current.unsettledAt = undefined; current.pinned = false; this.settledByTurn.add(id); } current.settleWhenTurnEnds = undefined; }
			current.approvals = []; current.questions = keepMessageQuestions(current.questions); current.forms = [];
			this.store.saveTask(current);
		} catch (error) {
			flush();
			const current = this.store.getTask(id);
			if (current.status !== "interrupted") current.status = "failed";
			if (error instanceof AgentInputRejectedError && !current.messages.some(value => value.role === "assistant" && value.id.startsWith(`${message.id}:`))) { current.messages = current.messages.filter(value => value.id !== message.id); if (!current.queue.some(value => value.id === message.id)) current.queue.unshift(message); }
			current.error = error instanceof Error ? error.message : "Agent execution failed.";
			current.approvals = []; current.questions = keepMessageQuestions(current.questions); current.forms = []; this.store.saveTask(current);
		} finally {
			const finished = this.store.getTask(id); const input = finished.messages.find(item => item.id === message.id); if (input) { input.completedAt = new Date().toISOString(); this.store.saveTask(finished); }
			if (checkpoint && project) void this.trackCheckpoint(this.recordCheckpoint(id, message.id, checkpoint, project.directory));
			if (flushTimer) clearTimeout(flushTimer);
			orchestration?.close(); this.orchestrationSessions.delete(id); this.running.delete(id);
			if (!this.closing && finished.status !== "interrupted") this.threads.releaseForeground(id);
			for (const [approvalId, pending] of this.approvals) if (pending.taskId === id) { pending.resolve("decline"); this.approvals.delete(approvalId); }
			for (const [requestId, pending] of this.questions) if (pending.taskId === id) { pending.resolve({}); this.questions.delete(requestId); }
			for (const [requestId, pending] of this.forms) if (pending.taskId === id) { pending.resolve(null); this.forms.delete(requestId); }
			this.broadcast();
		}
	}
	async close() {
		this.closing = true; this.settleAbort.abort(); for (const timer of this.wakeTimers.values()) clearTimeout(timer); this.wakeTimers.clear(); for (const close of this.orchestrationSessions.values()) close(); this.broadcast();
		for (const id of this.running.keys()) this.store.apply({ type: "cancel", id });
		for (const pending of this.approvals.values()) pending.resolve("decline");
		for (const pending of this.questions.values()) pending.resolve({});
		for (const pending of this.forms.values()) pending.resolve(null);
		await Promise.allSettled([...this.running.values()].map(adapter => adapter.cancel()));
		await Promise.allSettled([...this.executions.values()]);
		await Promise.allSettled([...this.steeringExecutions.values()]);
		await Promise.allSettled([...this.checkpoints]);
		await Promise.allSettled([...this.modelDiscoveries]);
		await Promise.allSettled([...this.imports]);
		await Promise.allSettled([...this.worktreeOperations]);
		await Promise.allSettled([...this.projectMutations.keys()]);
		await Promise.allSettled([...this.commands]);
		await Promise.allSettled([...this.settleCleanups]);
		await this.orchestratorMcp.close();
		await this.openCode.close();
		this.store.close();
	}
}

/** A finished question for the transcript: each question with its answer, or that it was dismissed. */
function questionRecord(requestId: string, questions: AgentQuestion[], answers: Record<string, string[]>) {
	const dismissed = !Object.keys(answers).length;
	// Options show by label (an answer may be an option's value); an empty answer says so.
	const shown = (question: AgentQuestion) => (Object.hasOwn(answers, question.id) ? answers[question.id] : []).map(value => questionOptions(question).find(option => optionValue(option) === value)?.label ?? value).filter(value => value.trim()).join(", ") || "(empty)";
	const text = questions.map(question => `${question.question}\n→ ${dismissed ? "Dismissed" : question.isSecret ? "••••" : shown(question)}`).join("\n\n");
	return { id: `question:${requestId}`, type: "tool" as const, title: dismissed ? "Question dismissed" : questions.length === 1 ? "Question answered" : "Questions answered", text, status: "completed" as const };
}
