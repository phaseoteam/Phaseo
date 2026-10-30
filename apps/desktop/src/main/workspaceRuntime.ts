import { threadToolLabel, type FactoryAgentTools, type ThreadTools } from "../shared/orchestration";
import type { BrowserAgentTools } from "../shared/browserAgent";
import { completeChat, generateTitle } from "./chatTitles";
import { mentionPlainText } from "../shared/mentions";
import { randomUUID } from "node:crypto";
import { autoSettleAt } from "../shared/threadLifecycle";
import { addUsage, formatSpend, isPhaseoUsageId } from "../shared/usageAmounts";
import { usageKind } from "../shared/usageLedger";
import { autopilotOwner, chatSpend } from "../shared/chatSpend";
import { answerForm, answerQuestions, autopilotBrief, autopilotModel, judgeTurn, reviewAction, reviewPlan, type AutopilotCall, type TurnVerdict } from "./autopilot";
import type { AgentForm } from "../shared/agentForms";
import { autoSettleRules, settingsProject, settleScriptTarget, worktreeCreateScripts, type ProjectScript, type ProjectUpdate } from "../shared/projectSettings";
import { runProjectCommand } from "./runProjectCommand";
import { mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AgentActivity, AgentConnection, ApprovalDecision, ModelOption, WorkspaceCommand, AgentQuestion, QuestionRequest } from "../shared/workspace";
import { optionValue, questionAnswerError, questionOptions } from "../shared/agentQuestions";
import { WorkspaceThreads } from "./workspaceThreads";
import { git } from "./gitProcess";
import { githubRepository } from "./projectPullRequests";
import { parsePullRequestReference, validatePullRequestLinks, type PullRequestLinkSnapshot } from "../shared/pullRequestView";
import type { PullRequestStack } from "../shared/pullRequestStacks";
import type { PullRequestGuideResult } from "../shared/pullRequestGuide";
import type { PullRequestWatchMessage, PullRequestWatchState } from "../shared/pullRequestWatch";
import type { PullRequestWatchTarget } from "./pullRequestWatcher";
import { issueLinkSnapshot, parseIssueReference, validateIssueLinks, type IssueDetails, type IssueLinkSnapshot } from "../shared/issueView";
import type { IssueWatchMessage, IssueWatchState } from "../shared/issueWatch";
import type { IssueWatchTarget } from "./issueWatcher";
import { githubReferenceContext, readIssue } from "./projectIssues";
import { runGh } from "./projectPullRequestView";
import { validateIssueDraft, type IssueDraft } from "../shared/triage";
import { OrchestratorMcp } from "./orchestratorMcp";
import { QuestionDeferredError } from "./phaseoQuestionTools";
import { CodexAdapter } from "./codexAdapter";
import { WorkspaceStore } from "./workspaceStore";
import type { WorkspaceOverview } from "../shared/workspaceOverview";
import { ClaudeAdapter } from "./claudeAdapter";
import { AgentInputRejectedError, type AgentAdapter, type AgentCallbacks } from "./agentAdapter";
import type { Harness } from "../shared/workspace";
import type { SecretVault } from "./secretVault";
import { McpHeaderSecrets } from "./mcpHeaders";
import { PhaseoAdapter } from "./phaseoAdapter";
import { PhaseoCodingAdapter, type PhaseoExtras } from "./phaseoCodingAdapter";
import { closePhaseoMcpConnection } from "./phaseoMcp";
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
import { captureCheckpoint, checkpointChanges, restoreCheckpoint } from "./gitCheckpoints";
import { gitBranches, withGitLock } from "./gitOperations";
import { runWorktreeSetup } from "./worktreeChat";
import { planWorktreeCleanup } from "./worktreeCleanup";
import type { WorktreeCleanupReport } from "../shared/worktreeCleanup";
import { usageLimitError } from "../shared/usageLimitRecovery";
import { secretLifetimeMs, secretRef, secretRefPattern, type SecretRequest, type SecretRequestInput, type SecretRequestResult } from "../shared/secretRequests";
import { branchNamePrompt, temporaryWorktreeBranch, type WorktreeChatRequest } from "../shared/worktreeChat";
import { grokModelCatalog } from "./grokModelCatalog";
import { GrokAdapter } from "./grokAdapter";
import { codexModels } from "./modelCatalog";
import type { Mission, MissionCommand } from "../shared/missions";
import { span, startSpan, type ActiveSpan } from "./diagnostics/tracer";

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
	/** Lent to Phaseo turns: model facts for context limits, and the long-running commands chats start. */
	phaseo: PhaseoExtras = { secrets: (taskId, refs) => this.resolveSecrets(taskId, refs) };
	private readonly imports = new Set<Promise<unknown>>();
	private readonly modelDiscoveries = new Set<Promise<unknown>>();
	private readonly worktreeOperations = new Set<Promise<unknown>>();
	private readonly worktreeSources = new Map<string, number>();
	private readonly removingWorktrees = new Set<string>();
	private readonly projectMutations = new Map<Promise<unknown>, string>();
	private readonly wakeTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private closing = false;
	private usageBackfill?: ReturnType<typeof setTimeout>;
	/** The last turn Autopilot judged in each chat (by the message that started it), so a turn is judged once. */
	private readonly autopilotJudged = new Map<string, string>();
	private autopilotCalls = 0;
	discoverThreadModels?: (harness: Harness, accountId?: string, projectId?: string) => Promise<ModelOption[]>;
	/** The composer's installation check, reused by list_agents. */
	discoverInstallations?: () => Promise<{ harness: Harness; installed: boolean; error?: string }[]>;
	/** Set by MissionService so the scheduled-task tools reuse its validation, timing and change notifications. */
	missionCommand?: (command: MissionCommand) => Mission[];
	onChange: (workspace: WorkspaceOverview) => void = () => {};
	onTerminalAuth?: (request: TerminalAuthRequest, signal: AbortSignal) => TerminalAuthentication;
	getTerminals?: () => { cwd: string; status: string }[];
	/** Autopilot logged a decision; the Inbox reads the log again. */
	onAutopilotLog?: () => void;
	/** Closes a settled chat's terminals that sit at an idle prompt (TerminalService.closeIdle). */
	closeIdleTerminals?: (taskId: string) => Promise<unknown>;
	/** Starts a project script in a terminal of its own (TerminalService.runScript). */
	runProjectScript?: (projectId: string, script: ProjectScript) => void;
	/** Runs a setup action to completion in a terminal of the chat (TerminalService.runSetup). */
	runSetupScript?: (projectId: string, script: ProjectScript, taskId: string) => { terminalId: string; exited: Promise<number | undefined> };
	/** When a Claude or Codex account's exhausted plan limit resets (ms), from the limits Settings → Usage reads. */
	usageLimitReset?: (harness: "claude" | "codex", accountId?: string) => Promise<number | undefined>;
	/** Secret requests waiting for the person, by request. */
	private readonly secretWaits = new Map<string, { taskId: string; resolve: (status: SecretRequest["status"]) => void }>();
	/** Scheduled resumes of limited chats, by chat. */
	private readonly limitTimers = new Map<string, ReturnType<typeof setTimeout>>();
	/** New worktree chats whose first turn waits for their setup (shared/worktreeChat.ts). */
	private readonly worktreeSetups = new Map<string, Promise<void>>();
	/** Settle cleanups in progress, and the settle each chat's scripts last ran for, so a repeat settle does not run them twice. */
	private readonly settleCleanups = new Set<Promise<unknown>>();
	private readonly settleScriptRuns = new Map<string, string>();
	private readonly settleAbort = new AbortController();
	/** Chats their own agent settled mid-turn; cleanup waits until the turn's execution has ended. */
	private readonly settledByTurn = new Set<string>();
	/** T3's browser tools for one chat, on its own browser tabs; set by the app once it has a window. */
	browserTools?: (chatId: string) => BrowserAgentTools;
	/** Review guides for the agent tools; set by the app once its guide store exists. */
	pullRequestGuideTools?: { write: (root: string, repository: string, number: number) => Promise<"started" | "running">; read: (root: string, repository: string, number: number) => Promise<PullRequestGuideResult> };
	/** GitHub issue reads through gh: linking and read_issue, and the context `#` references add to a prompt. Tests replace it. */
	github: { readIssue: (root: string, repository: string, number: number) => Promise<IssueDetails>; referenceContext: (root: string, urls: string[]) => Promise<string> } = { readIssue: (root, repository, number) => readIssue(root, repository, number), referenceContext: (root, urls) => githubReferenceContext(root, urls) };
	/** Files an issue through gh and returns what gh prints, ending with the issue's URL; the body goes in on stdin, so no file holds it. Tests replace it. */
	createIssue = (root: string, repository: string, title: string, body: string) => runGh(root, ["issue", "create", "--repo", repository, "--title", title, "--body-file", "-"], body);
	private readonly filingIssues = new Set<string>();
	constructor(private readonly directory: string, private readonly adapterFactory = createAdapter, private readonly vault?: SecretVault) {
		mkdirSync(path.join(directory, "instructions"), { recursive: true });
		mkdirSync(directory, { recursive: true });
		this.store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		// MCP header values move to the vault; until they can, they stay in settings and are still never broadcast.
		this.mcpHeaders = new McpHeaderSecrets(vault); void this.mcpHeaders.migrate(this.store).catch(() => {});
		this.attachments = new AttachmentService(path.join(directory, "attachments"), this.store);
		this.openCode = new OpenCodeService(directory);
		const modelDiscovery = () => this.discoverThreadModels, installationDiscovery = () => this.discoverInstallations, missions = () => this.missionCommand, guides = () => this.pullRequestGuideTools;
		this.threads = new WorkspaceThreads({ store: this.store, isClosing: () => this.closing, broadcast: () => this.broadcast(), start: id => this.start(id), command: command => this.command(command), createWorktree: (projectId, branch, base) => this.createWorktree(projectId, branch, base), assertHarnessAvailable: harness => this.assertHarnessAvailable(harness), assertProjectAvailable: id => this.assertProjectAvailable(id), readIssue: (root, repository, number) => this.github.readIssue(root, repository, number), get discoverModels() { return modelDiscovery(); }, get discoverInstallations() { return installationDiscovery(); }, get missions() { return missions(); }, get pullRequestGuides() { return guides(); }, modelDiscoveries: this.modelDiscoveries }, () => this.store.getPreferences().maxActiveAgents);
		// Deliveries recorded while the app was closed wake idle parents as they would at runtime, after the host has wired its hooks.
		// Children cut off by the app quitting are only reported: waking the parent for them would spend tokens nobody asked for.
		const finished = (id: string) => { try { return this.store.getTask(id).status !== "interrupted"; } catch { return false; } };
		const worthWaking = (id: string) => { try { return this.store.getTask(id).queue.some(item => (item.sourceTaskIds ?? (item.sourceTaskId ? [item.sourceTaskId] : [])).some(finished)); } catch { return false; } };
		for (const id of new Set([...this.store.collectDelegationResults(), ...this.store.pendingDeliveryParents()])) if (worthWaking(id)) this.wake(id);
		this.backfillUsageTotals();
		this.removeOldSecretFiles();
		// Resumes scheduled before the app last quit, once the host has wired its hooks.
		setTimeout(() => this.armLimitResumes(), 5000).unref?.();
		// The Usage page looks back 90 days, so the ledger is filled once from recent chats and kept that long.
		// It reads each recent chat once, so it waits until startup has settled.
		setTimeout(() => { if (this.closing) return; try { this.store.pruneUsageLedger(); this.store.backfillUsageLedger(); } catch { /* The Usage page starts from now instead. */ } }, 2000).unref?.();
	}
	/** Chats saved before usage totals were kept get them from their history, a few at a time so startup stays quick. */
	private backfillUsageTotals() {
		this.usageBackfill = setTimeout(() => {
			if (this.closing) return;
			try { if (!this.store.backfillUsageTotals(25)) return; } catch { return; }
			this.broadcastSoon(); this.backfillUsageTotals();
		}, 50);
		this.usageBackfill.unref?.();
	}
	private readonly threads: WorkspaceThreads;

	/** Whether Autopilot acts for this chat: the experimental setting is on, the chat is in Autopilot, and its spend cap has not stopped it. */
	private autopilotActive(id: string) {
		if (this.closing || !this.store.getPreferences().autopilot) return false;
		let task; try { task = this.store.getTask(id); } catch { return false; }
		if (!task.autopilot || task.archived || task.permissionMode !== "full-access") return false;
		const owner = autopilotOwner(this.store.getOverview().tasks, id);
		return Boolean(owner) && owner!.autopilot?.handback?.reason !== "cap";
	}
	/**
	 * The model Autopilot asks for this chat, through the person's Phaseo account, and what it is told. Each call's priced
	 * usage is recorded in the chat, so it counts towards the chat's total and cap.
	 */
	private autopilotCaller(id: string, record: (activity: AgentActivity) => void): { call: AutopilotCall; brief: ReturnType<typeof autopilotBrief> } | { missing: string } {
		const task = this.store.getTask(id), parentId = task.delegation?.parentTaskId;
		let parent; try { parent = parentId ? this.store.getTask(parentId) : undefined; } catch { parent = undefined; }
		const model = autopilotModel(task, parent, this.store.getPreferences());
		if (!model) return { missing: "Autopilot has no model to ask. Choose one in Settings → Experimental." };
		const call: AutopilotCall = request => this.askAutopilotModel(model, request, usage => record({ id: `autopilot:${Date.now() * 1000 + (this.autopilotCalls++ % 1000)}:usage`, type: "usage", title: "Autopilot usage", text: JSON.stringify(usage) }));
		return { call, brief: autopilotBrief(task, parent) };
	}
	/** One request to the Autopilot model through the person's Phaseo account; tests replace it. */
	askAutopilotModel = async (model: string, request: Parameters<AutopilotCall>[0], onUsage: (usage: Record<string, unknown>) => void) => {
		const account = this.phaseoAccount();
		if (!account || !this.vault) throw new Error("Autopilot needs a signed-in Phaseo account to ask its model.");
		return completeChat({ endpoint: account.endpoint, token: await this.vault.get(account.secretId), model, ...request, timeoutMs: 90_000, label: "The Autopilot model", onUsage });
	};
	/**
	 * Autopilot's answer to something the agent is waiting on. The request stays on screen meanwhile, so the person can still
	 * answer first; Autopilot answers through the same commands they would, so its answers are checked the same way.
	 */
	private async autopilotRespond(id: string, request: { kind: "question"; requestId: string; questions: AgentQuestion[] } | { kind: "form"; requestId: string; form: AgentForm } | { kind: "plan"; approvalId: string; plan: string } | { kind: "approval"; approvalId: string; title: string; details: string }, note: (activity: AgentActivity) => void) {
		if (!this.autopilotActive(id)) return;
		const say = (title: string, text: string) => { note({ id: `autopilot:${randomUUID()}`, type: "tool", title, text, status: "completed" }); this.logAutopilot(id, title, text); };
		const pending = () => request.kind === "question" ? this.questions.has(request.requestId) : request.kind === "form" ? this.forms.has(request.requestId) : this.approvals.has(request.approvalId);
		const caller = this.autopilotCaller(id, note);
		if ("missing" in caller) { say("Autopilot passed this to you", caller.missing); return; }
		try {
			if (request.kind === "question") {
				const result = await answerQuestions(caller.call, caller.brief, request.questions);
				if (!pending()) return;
				if (result.decision === "escalate") { say("Autopilot passed this to you", result.reason); return; }
				await this.command({ type: "answer", id, requestId: request.requestId, answers: result.answers });
				const answered = request.questions.filter(question => result.answers[question.id]?.length).map(question => `${question.header || question.question}: ${result.answers[question.id]!.join(", ")}`);
				say("Autopilot answered", [...answered, result.reason].join("\n"));
			} else if (request.kind === "form") {
				const result = await answerForm(caller.call, caller.brief, request.form);
				if (!pending()) return;
				if (result.decision === "escalate") { say("Autopilot passed this to you", result.reason); return; }
				await this.command({ type: "form-answer", id, requestId: request.requestId, answer: result.answer });
				say("Autopilot filled in the form", result.reason);
			} else if (request.kind === "plan") {
				const result = await reviewPlan(caller.call, caller.brief, request.plan);
				if (!pending()) return;
				if (result.decision === "escalate") { say("Autopilot passed this to you", result.reason); return; }
				await this.command({ type: "approval", id, approvalId: request.approvalId, decision: result.decision === "accept" ? "accept" : "decline", ...result.decision === "revise" ? { feedback: result.feedback } : {} });
				say(result.decision === "accept" ? "Autopilot approved the plan" : "Autopilot asked for changes to the plan", result.decision === "revise" ? `${result.feedback}\n\n${result.reason}` : result.reason);
			} else {
				const result = await reviewAction(caller.call, caller.brief, request);
				if (!pending()) return;
				if (result.decision === "escalate") { say("Autopilot passed this to you", result.reason); return; }
				await this.command({ type: "approval", id, approvalId: request.approvalId, decision: result.decision });
				say(result.decision === "accept" ? `Autopilot allowed: ${request.title}` : `Autopilot declined: ${request.title}`, result.reason);
			}
		} catch (error) {
			// An answer the checks reject, or a failed call, leaves the request with the person.
			if (pending()) say("Autopilot passed this to you", error instanceof Error ? error.message : "Autopilot could not answer.");
		}
	}
	/** Keeps a decision in the Inbox's Autopilot log. The chat's own activity is the record, so a failed write is not fatal. */
	private logAutopilot(id: string, title: string, text: string) {
		try { this.store.recordAutopilotDecision(id, title, text); } catch { return; }
		this.onAutopilotLog?.();
	}
	/** Adds an activity to a finished turn, counting it towards the chat's totals when it reports usage. */
	private appendActivity(id: string, messageId: string, activity: AgentActivity) {
		const task = this.store.getTaskTail(id, messageId);
		task.activities ??= [];
		const timelineOrder = [...task.messages, ...task.activities].reduce((maximum, item) => Math.max(maximum, item.timelineOrder ?? 0), 0) + 1;
		const stored = { ...activity, id: `${messageId}:${activity.id}`, timelineOrder };
		task.activities.push(stored);
		const usage = activity.type === "usage" && isPhaseoUsageId(stored.id);
		if (usage) addUsage(task.usageTotals ??= { tokens: 0, costNanos: 0 }, activity.text);
		if (usage) try { this.store.recordUsage(task, stored.id, activity.text, usageKind(stored.id) === "autopilot" || Boolean(task.autopilot && !task.autopilot.handback)); } catch { /* The Usage page misses this request; the chat still counts it. */ }
		this.store.saveTask(task, true); this.broadcastSoon();
		if (usage) this.enforceAutopilotCap(id);
	}
	/**
	 * When a turn ends in Autopilot, a model judges whether the task is done. If not, it sends the agent its next instruction;
	 * otherwise the chat goes back to the person, with a summary or what is needed from them. Two follow-ups in a row that
	 * use no tools also hand it back, so a run cannot spin.
	 */
	private async autopilotAfterTurn(id: string) {
		if (!this.autopilotActive(id)) return;
		const head = this.store.getTask(id);
		if (head.status !== "completed" || head.queue.length || head.autopilot?.handback) return;
		// Agents still working will wake the chat with their results; it is judged then.
		if (this.store.getOverview().tasks.some(task => task.delegation?.parentTaskId === id && !task.archived && (task.status === "running" || task.status === "waiting" || Boolean(task.queueCount)))) return;
		const task = this.store.getTask(id);
		const lastUser = task.messages.findLast(message => message.role === "user" && !message.notice);
		if (!lastUser || this.autopilotJudged.get(id) === lastUser.id) return;
		this.autopilotJudged.set(id, lastUser.id);
		const ofTurn = (value: { id: string }) => value.id.startsWith(`${lastUser.id}:`);
		const answer = task.messages.findLast(message => message.role === "assistant" && ofTurn(message))?.text ?? "";
		const usedTools = (task.activities ?? []).some(activity => ofTurn(activity) && activity.type === "tool" && !activity.id.includes(":autopilot:") && !activity.id.includes(":question:"));
		const person = task.messages.findLastIndex(message => message.role === "user" && !message.notice && !message.autopilot);
		const followUps = task.messages.slice(person + 1).filter(message => message.role === "user" && message.autopilot).length;
		const record = (activity: AgentActivity) => this.appendActivity(id, lastUser.id, activity);
		const caller = this.autopilotCaller(id, record);
		let verdict: TurnVerdict;
		if ("missing" in caller) verdict = { status: "blocked", summary: caller.missing };
		else try { verdict = await judgeTurn(caller.call, caller.brief, { answer, usedTools, followUps }); }
		catch (error) { verdict = { status: "blocked", summary: `Autopilot could not check this turn: ${error instanceof Error ? error.message : "the model request failed"}` }; }
		// The chat may have moved on while the model thought: the person replied, stopped it, or turned Autopilot off.
		const current = this.store.getTask(id);
		if (!this.autopilotActive(id) || current.status !== "completed" || current.queue.length || current.autopilot?.handback || current.messages.findLast(message => message.role === "user" && !message.notice)?.id !== lastUser.id) return;
		const stalls = verdict.status === "continue" && lastUser.autopilot && !usedTools ? (current.autopilot!.stalls ?? 0) + 1 : 0;
		const at = new Date().toISOString();
		if (verdict.status === "continue" && stalls < 2) {
			current.autopilot = { ...current.autopilot!, stalls };
			current.queue.push({ id: randomUUID(), text: verdict.message, createdAt: at, autopilot: true });
			this.store.saveTask(current, true);
			record({ id: `autopilot:${randomUUID()}`, type: "tool", title: "Autopilot: keep going", text: verdict.reason, status: "completed" });
			this.logAutopilot(id, "Autopilot: keep going", `${verdict.message}\n${verdict.reason}`);
			this.start(id); return;
		}
		const handback = verdict.status === "continue" ? { reason: "stalled" as const, summary: "Autopilot stopped: its last two follow-ups made no progress." } : { reason: verdict.status, summary: verdict.summary };
		current.autopilot = { ...current.autopilot!, stalls: undefined, handback: { ...handback, at } };
		this.store.saveTask(current, true);
		const title = handback.reason === "done" ? "Autopilot finished" : "Autopilot needs you";
		record({ id: `autopilot:${randomUUID()}`, type: "tool", title, text: handback.summary, status: "completed" });
		this.logAutopilot(id, title, handback.summary);
		this.broadcast();
	}
	/** At its spend cap, Autopilot stops the chat that set the cap and its agents, and hands the chat back. */
	private enforceAutopilotCap(id: string) {
		if (!this.store.getPreferences().autopilot) return;
		const tasks = this.store.getOverview().tasks, owner = autopilotOwner(tasks, id), cap = owner?.autopilot?.capNanos;
		if (!owner || cap === null || cap === undefined || owner.autopilot?.handback?.reason === "cap") return;
		const { own, agents } = chatSpend(tasks, owner.id);
		if ((own?.costNanos ?? 0) + agents.costNanos < cap) return;
		const task = this.store.getTask(owner.id);
		task.autopilot = { ...task.autopilot!, stalls: undefined, handback: { reason: "cap", summary: `Autopilot paused at its ${formatSpend(cap)} spend cap. Raise the cap or turn Autopilot off to carry on.`, at: new Date().toISOString() } };
		this.store.saveTask(task, true); this.broadcastSoon();
		this.logAutopilot(owner.id, "Autopilot reached its spend cap", task.autopilot.handback!.summary);
		// Stopping a chat flushes and saves it, so it happens after the flush that noticed the cap.
		const busy = (value: { status: string }) => value.status === "running" || value.status === "waiting";
		const stop = tasks.filter(value => busy(value) && autopilotOwner(tasks, value.id)?.id === owner.id).map(value => value.id);
		setTimeout(() => { for (const value of stop) void this.command({ type: "cancel", id: value }).catch(() => {}); }, 0);
	}
	/** Names a chat with the title model (Settings → General), as T3 does; without one, the first message stays its title. A rename in the meantime wins. */
	/** The title model (Settings → General) and the Phaseo account it runs through, or which of the two is missing. */
	titleModelAccount(): { model: string; endpoint: string; secretId: string } | { missing: "model" | "account" } {
		const model = this.store.getPreferences().titleModel;
		if (!model) return { missing: "model" };
		const account = this.phaseoAccount();
		if (!account || !this.vault) return { missing: "account" };
		return { model, ...account };
	}
	/** The person's signed-in Phaseo account, for requests the app makes on their behalf. */
	private phaseoAccount() {
		const account = this.store.getAccounts().find(value => value.harness === "phaseo" && value.configured && !value.archived && value.endpoint && (!value.oauthExpiresAt || Date.parse(value.oauthExpiresAt) > Date.now()));
		return account?.endpoint ? { endpoint: account.endpoint, secretId: account.secretId ?? account.id } : undefined;
	}
	/** Runs a prompt on the title model through the person's Phaseo account (pull request guides use it). */
	async completeWithTitleModel(input: { system: string; user: string; maxTokens: number; timeoutMs: number; signal?: AbortSignal; label: string }) {
		const access = this.titleModelAccount();
		if ("missing" in access) throw new Error(access.missing === "model" ? "Choose a model for chat titles in Settings → General first." : "Sign in to Phaseo to use a model here.");
		const reply = await completeChat({ endpoint: access.endpoint, token: await this.vault!.get(access.secretId), model: access.model, ...input });
		return { reply, model: access.model };
	}
	private async nameChat(id: string, regenerate: boolean) {
		const access = this.titleModelAccount();
		if ("missing" in access) { if (regenerate) throw new Error(access.missing === "model" ? "Choose a model for chat titles in Settings → General first." : "Sign in to Phaseo to name chats with a model."); return; }
		const { model } = access;
		const task = this.store.getTask(id), before = task.title;
		const text = task.messages.find(message => message.role === "user" && !message.delivery)?.text ?? task.queue[0]?.text;
		if (!text) { if (regenerate) throw new Error("This chat has no message to name it from."); return; }
		const reply = regenerate ? task.messages.findLast(message => message.role === "assistant")?.text : undefined;
		try {
			const title = await span("chat.title", { model, regenerate }, async () => generateTitle({ endpoint: access.endpoint, token: await this.vault!.get(access.secretId), model, text: mentionPlainText(text), reply }));
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
		for (const value of ids) this.phaseo.background?.stopTask(value);
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
		for (const value of chats) this.phaseo.background?.stopTask(value);
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
		// Settle scripts run only in a chat's own worktree; most chats settle elsewhere, and auto-settle can settle hundreds at once.
		const projects = this.store.getProjects();
		if (!projects.find(project => project.id === task.projectId)?.worktree) return;
		const target = settleScriptTarget(task, projects, this.store.getOverview().tasks);
		if (!target) return;
		this.settleScriptRuns.set(id, key);
		const { script, directory } = target;
		const activityId = `settle:${randomUUID()}`, heading = `$ ${script.command}`, title = `Settle script: ${script.name}`;
		this.recordActivity(id, { id: activityId, type: "tool", title, text: heading, status: "running" });
		let result: { output: string; exitCode: number | null; stopped?: string };
		try { result = await runProjectCommand(directory, script.command, ".", { signal: this.settleAbort.signal }); }
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
	/** Called after a native stack read, so every chat linking a layer groups the stack and gains its other layers. */
	syncPullRequestStack(repository: string, number: number, stack: PullRequestStack | null) {
		if (!this.closing && this.store.syncPullRequestStack(repository, number, stack)) this.broadcast();
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
	/** Called after any read of an issue, so linked chats show its latest state. */
	syncIssueSnapshot(repository: string, number: number, snapshot: IssueLinkSnapshot) {
		if (!this.closing && this.store.syncIssueSnapshot(repository, number, snapshot)) this.broadcast();
	}
	/** Every chat's watched issue links for the issue watcher, with the folder gh reads them from. */
	issueWatchTargets(): IssueWatchTarget[] {
		const workspace = this.store.getOverview();
		return workspace.tasks.flatMap(task => (validateIssueLinks(task.issues) ?? []).filter(link => link.watching).map(link => ({ taskId: task.id, cwd: workspace.projects.find(project => project.id === task.projectId && !project.worktree?.removedAt)?.directory ?? this.directory, inactive: task.archived || task.settledOverride === "settled" || Boolean(task.delegation?.parentTaskId), link })));
	}
	/** An issue watch pass: records it, and when there is news queues it for the chat's agent, starts an idle chat and notifies. */
	recordIssueWatch(taskId: string, link: { repository: string; number: number }, startedAt: string, next: IssueWatchState | null, update?: IssueWatchMessage) {
		if (this.closing) return;
		const queued = this.store.recordIssueWatch(taskId, link, startedAt, next, update);
		this.broadcast();
		if (!queued || !update) return;
		this.start(taskId);
		this.onIssueNotice?.(taskId, update.summary, update.outcome);
	}
	/** Raised for each watched issue update, for the desktop notification. */
	onIssueNotice?: (taskId: string, summary: string, outcome: IssueWatchMessage["outcome"]) => void;
	/**
	 * Streaming flushes from every running chat share one clock: those due run together in one transaction, so fifty
	 * chats streaming commit a few dozen times a second rather than a thousand. Due times fall on a 20 ms grid to group.
	 */
	private readonly streamFlushes = new Map<string, { due: number; run: () => void }>();
	private flushClock: ReturnType<typeof setTimeout> | undefined;
	private queueStreamFlush(id: string, delay: number, run: () => void) {
		if (this.closing || this.streamFlushes.has(id)) return;
		this.streamFlushes.set(id, { due: Math.ceil((Date.now() + delay) / 20) * 20, run });
		this.armFlushClock();
	}
	private armFlushClock() {
		if (this.flushClock || !this.streamFlushes.size || this.closing) return;
		const next = Math.min(...[...this.streamFlushes.values()].map(flush => flush.due));
		this.flushClock = setTimeout(() => {
			this.flushClock = undefined;
			const now = Date.now(), due = [...this.streamFlushes.values()].filter(flush => flush.due <= now);
			// Each flush catches its own failure; its savepoint undoes only its writes.
			if (due.length) this.store.batch(() => { for (const flush of due) flush.run(); });
			this.armFlushClock();
		}, Math.max(0, next - Date.now()));
	}
	private broadcastTimer: ReturnType<typeof setTimeout> | undefined;
	/** Streaming flushes from every running chat share one chat-list update per 100 ms instead of one each. */
	private broadcastSoon() {
		if (this.closing || this.broadcastTimer) return;
		this.broadcastTimer = setTimeout(() => { this.broadcastTimer = undefined; if (!this.closing) this.broadcast(); }, 100);
	}
	private broadcast() {
		const parents = this.store.collectDelegationResults();
		this.onChange(this.store.getOverview()); this.threads.changed();
		for (const listener of [...this.threadListeners]) try { listener(); } catch { /* A listener's failure is its own. */ }
		if (!this.closing) for (const id of parents) this.wake(id);
	}
	/** Factory follows its stage threads through these, called after every change the renderer hears about. */
	private readonly threadListeners = new Set<() => void>();
	onThreadsChange(listener: () => void) { this.threadListeners.add(listener); return () => { this.threadListeners.delete(listener); }; }
	/** Factory: an item's thread, made outside the composer and started only when someone sends to it. */
	createThread(command: Extract<WorkspaceCommand, { type: "create-task" }>, title: string) {
		if (this.closing) throw new Error("The workspace is shutting down.");
		if (command.projectId) this.assertProjectAvailable(command.projectId);
		const task = this.store.apply(command); task.title = title; this.store.saveTask(task); this.broadcast();
		return task;
	}
	/**
	 * Factory: a stage run as a child of its item's thread, started now. Stage children count towards the agent limit like
	 * any delegated agent, but never deliver their results into the parent (see WorkspaceThreads.releaseForeground).
	 */
	startStageThread(parentId: string, command: Extract<WorkspaceCommand, { type: "create-task" }>, requestId: string, prompt: string, title: string) {
		if (this.closing) throw new Error("The workspace is shutting down.");
		if (command.projectId) this.assertProjectAvailable(command.projectId);
		this.assertHarnessAvailable(command.harness);
		const child = this.store.createDelegatedTask(command, { parentTaskId: parentId, requestId, kind: "stage" }, prompt, title, this.store.getPreferences().maxActiveAgents);
		this.broadcast(); this.start(child.id); return child;
	}
	/** Factory's agent tools (list_work_items, read_work_item, run_stage), set once the Factory service runs. */
	factoryTools?: (threadId: string) => FactoryAgentTools;
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
	threadTools(parentId: string): ThreadTools {
		// Only Code chats run commands, so a Chat-mode secret would have nothing to use it.
		const code = this.store.getTask(parentId)?.mode !== "chat";
		const tools = { ...this.threads.forThread(parentId), ...code ? { requestSecret: (input: SecretRequestInput, signal?: AbortSignal) => this.requestSecret(parentId, input, signal) } : {}, ...this.factoryTools ? { factory: this.factoryTools(parentId) } : {}, ...this.triageProject(parentId) ? { draftIssue: (draft: unknown) => this.draftIssue(parentId, draft) } : {} };
		return this.browserTools ? { ...tools, browser: this.browserTools(parentId) } : tools; }
	/** The triage project of a top-level chat working in one; delegated agents report to their parent instead of drafting. */
	private triageProject(id: string) {
		const task = this.store.getTask(id);
		if (task.delegation?.parentTaskId) return undefined;
		return this.store.getProjects().find(project => project.id === task.projectId && !project.worktree)?.triage;
	}
	/** draft_issue: keeps the agent's draft on the chat for the person to read, edit and file, or discard. A newer draft replaces an unfiled one. */
	draftIssue(id: string, value: unknown) {
		const triage = this.triageProject(id);
		if (!triage) throw new Error("Only a triage chat can draft issues.");
		const { title, body } = validateIssueDraft(value), task = this.store.getTask(id);
		task.issueDraft = { repository: triage.repository, title, body, draftedAt: new Date().toISOString(), status: "draft" };
		this.store.saveTask(task); this.broadcast();
		return { saved: true as const, repository: triage.repository, message: "The draft is shown beside this chat. The person reads it and decides whether to file it; do not file it yourself. If they file it, it is linked to this chat." };
	}
	/** The person's choice on a drafted issue: file it (with their edits) through gh and link it to the chat, or discard it. */
	async issueDraftAction(id: string, action: "file" | "discard", edit?: unknown): Promise<IssueDraft> {
		const task = this.store.getTask(id), draft = task.issueDraft;
		if (!draft || draft.status !== "draft") throw new Error("This chat has no issue draft waiting.");
		if (this.filingIssues.has(id)) throw new Error("This issue is already being filed.");
		if (action === "discard") { task.issueDraft = { ...draft, status: "discarded" }; this.store.saveTask(task); this.broadcast(); return task.issueDraft; }
		const { title, body } = validateIssueDraft(edit ?? draft);
		this.filingIssues.add(id);
		let url: string;
		try {
			const project = this.store.getProjects().find(value => value.id === task.projectId && !value.worktree?.removedAt);
			url = (await this.createIssue(project?.directory ?? this.directory, draft.repository, title, body)).trim().split("\n").at(-1)?.trim() ?? "";
		} finally { this.filingIssues.delete(id); }
		const number = Number(url.match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)$/)?.[1]);
		if (!number) throw new Error(`GitHub did not return an issue: ${url.slice(0, 200)}`);
		const filed = this.store.getTask(id);
		filed.issueDraft = { ...draft, title, body, status: "filed", number, url, filedAt: new Date().toISOString() };
		this.store.saveTask(filed); this.broadcast();
		// The issue exists either way; a failed link only leaves it off the chat's issue list, and the draft still shows its link.
		await this.command({ type: "link-issue", id, reference: `${draft.repository}#${number}` }).catch(() => undefined);
		return filed.issueDraft;
	}
	async createWorktree(projectId: string, branch: string, base: string, runScripts = true) {
		if (this.closing) throw new Error("The workspace is shutting down.");
		this.assertProjectAvailable(projectId); this.worktreeSources.set(projectId, (this.worktreeSources.get(projectId) ?? 0) + 1);
		const operation = this.performCreateWorktree(projectId, branch, base, runScripts); this.worktreeOperations.add(operation);
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
	private async performCreateWorktree(projectId: string, branch: string, base: string, runScripts: boolean) {
		const source = this.store.getProjects().find(value => value.id === projectId); if (!source) throw new Error("Project no longer exists.");
		const root = path.join(this.directory, "worktrees"); mkdirSync(root, { recursive: true }); const directory = path.join(realpathSync(root), randomUUID());
		const baseCommit = await createGitWorktree(source.directory, directory, branch, base);
		try { const project = this.store.addProject(directory); project.name = `${source.name} · ${branch}`; project.worktree = { sourceProjectId: source.id, branch, baseCommit }; this.store.saveProject(project); this.broadcast(); if (runScripts) this.startWorktreeScripts(project.id); return { workspace: this.store.getOverview(), projectId: project.id }; }
		catch (error) { throw new Error(`The worktree was created at ${directory}, but project registration failed. Open that folder to recover it.`, { cause: error }); }
	}
	/** Reads the reset time from the account's limits; the limits data is more exact than an error's text. */
	private async readLimitReset(id: string) {
		let task; try { task = this.store.getTask(id); } catch { return; }
		if (task.harness !== "claude" && task.harness !== "codex") return;
		const resetsAt = await this.usageLimitReset?.(task.harness, task.accountId).catch(() => undefined);
		if (!resetsAt || this.closing) return;
		try { task = this.store.getTask(id); } catch { return; }
		if (task.status !== "limited" || !task.usageLimit) return;
		task.usageLimit.resetsAt = new Date(resetsAt).toISOString(); this.store.saveTask(task, true); this.broadcast();
	}
	/** T3's Resume at reset: resumes a limited chat a minute after its limit resets; `cancel` drops that. */
	private async resumeAtReset(id: string, cancel: boolean) {
		const task = this.store.getTask(id);
		if (cancel) { clearTimeout(this.limitTimers.get(id)); this.limitTimers.delete(id); if (task.usageLimit) { task.usageLimit.resumeAt = undefined; this.store.saveTask(task, true); this.broadcast(); } return this.store.getOverview(); }
		if (task.status !== "limited" || !task.usageLimit) throw new Error("This chat is not paused on a usage limit.");
		if (!task.usageLimit.resetsAt || Date.parse(task.usageLimit.resetsAt) <= Date.now()) await this.readLimitReset(id);
		const latest = this.store.getTask(id), resetsAt = latest.usageLimit?.resetsAt;
		if (!latest.usageLimit || !resetsAt) throw new Error("The reset time is not known yet. Check Settings → Usage, or use Continue now.");
		latest.usageLimit.resumeAt = new Date(Math.max(Date.parse(resetsAt), Date.now()) + 60_000).toISOString();
		this.store.saveTask(latest, true); this.broadcast(); this.armLimitResume(id, latest.usageLimit.resumeAt);
		return this.store.getOverview();
	}
	private armLimitResume(id: string, resumeAt: string) {
		clearTimeout(this.limitTimers.get(id));
		// Timers longer than about 24 days overflow, so long waits check again in a day.
		const wait = Math.min(Math.max(0, Date.parse(resumeAt) - Date.now()), 86_400_000);
		const timer = setTimeout(() => {
			this.limitTimers.delete(id);
			if (this.closing) return;
			let task; try { task = this.store.getTask(id); } catch { return; }
			if (task.status !== "limited" || task.usageLimit?.resumeAt !== resumeAt) return;
			if (Date.parse(resumeAt) > Date.now()) { this.armLimitResume(id, resumeAt); return; }
			void this.command({ type: "resume", id }).catch(() => {});
		}, wait);
		timer.unref?.(); this.limitTimers.set(id, timer);
	}
	private armLimitResumes() {
		if (this.closing) return;
		for (const overview of this.store.getOverview().tasks) {
			if (overview.status !== "limited") continue;
			try { const resumeAt = this.store.getTask(overview.id).usageLimit?.resumeAt; if (resumeAt) this.armLimitResume(overview.id, resumeAt); } catch { /* Deleted meanwhile. */ }
		}
	}
	/**
	 * T3's request_secret: a masked field in the chat, then the value in the vault behind a reference for this chat, or
	 * (delivery "file") also in an owner-only file for another harness's shell. The chat records only the outcome.
	 */
	async requestSecret(taskId: string, input: SecretRequestInput, signal?: AbortSignal): Promise<SecretRequestResult> {
		if (!this.vault || !await this.vault.available()) throw new Error("Secure credential storage is unavailable on this device, so secrets cannot be requested. Ask the user to set the secret up themselves.");
		const task = this.store.getTask(taskId);
		if (task.archived) throw new Error("This chat is archived.");
		const delivery = input.delivery ?? (task.harness === "phaseo" ? "secretRef" : "file");
		const request: SecretRequest = { id: randomUUID().replaceAll("-", ""), label: input.label, reason: input.reason, ...input.placeholder ? { placeholder: input.placeholder } : {}, delivery, status: "pending", createdAt: new Date().toISOString() };
		task.secretRequests = [...(task.secretRequests ?? []).slice(-19), request];
		if (task.status === "running") task.status = "waiting";
		this.store.saveTask(task); this.broadcast();
		const status = await new Promise<SecretRequest["status"]>(resolve => {
			const finish = (value: SecretRequest["status"]) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); this.secretWaits.delete(request.id); resolve(value); };
			const timer = setTimeout(() => finish("timed_out"), input.timeoutMs), abort = () => finish("cancelled");
			this.secretWaits.set(request.id, { taskId, resolve: finish });
			signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
		});
		if (status !== "saved" && status !== "declined") this.settleSecretRequest(taskId, request.id, status);
		if (status !== "saved") return { status: status === "pending" ? "cancelled" : status };
		const expiresAt = new Date(Date.now() + secretLifetimeMs).toISOString();
		if (delivery === "secretRef") return { status: "saved", secretRef: secretRef(request.id), expiresAt };
		const directory = path.join(this.directory, "secrets"); mkdirSync(directory, { recursive: true, mode: 0o700 });
		const file = path.join(directory, request.id);
		writeFileSync(file, (JSON.parse(await this.vault.get(`secret-request-${request.id}`)) as { value: string }).value, { mode: 0o600 });
		setTimeout(() => rmSync(file, { force: true }), secretLifetimeMs).unref?.();
		return { status: "saved", file, expiresAt };
	}
	/** The person's answer to a secret request: the value goes to the vault, the chat records only "saved" or "declined". */
	async answerSecret(taskId: string, requestId: string, value: string | null) {
		const wait = this.secretWaits.get(requestId), request = this.store.getTask(taskId).secretRequests?.find(item => item.id === requestId);
		if (!wait || wait.taskId !== taskId || request?.status !== "pending") throw new Error("This request is no longer waiting for an answer.");
		if (value !== null) {
			await this.vault!.set(`secret-request-${requestId}`, JSON.stringify({ taskId, value, savedAt: Date.now() }));
			setTimeout(() => this.vault?.remove(`secret-request-${requestId}`), secretLifetimeMs).unref?.();
		}
		this.settleSecretRequest(taskId, requestId, value === null ? "declined" : "saved");
		wait.resolve(value === null ? "declined" : "saved");
		return this.store.getOverview();
	}
	private settleSecretRequest(taskId: string, requestId: string, status: SecretRequest["status"]) {
		let task; try { task = this.store.getTask(taskId); } catch { return; }
		const request = task.secretRequests?.find(item => item.id === requestId);
		if (!request || request.status !== "pending") return;
		request.status = status; request.answeredAt = new Date().toISOString();
		if (task.status === "waiting" && !task.secretRequests!.some(item => item.status === "pending")) task.status = hasRequests(task) ? "waiting" : "running";
		this.store.saveTask(task); this.broadcast();
	}
	/** run_command's secrets: each secretRef must be this chat's and under a day old. */
	async resolveSecrets(taskId: string, refs: Record<string, string>) {
		if (!this.vault) throw new Error("Secure credential storage is unavailable.");
		const values: Record<string, string> = {};
		for (const [name, ref] of Object.entries(refs)) {
			const id = secretRefPattern.exec(ref)?.[1];
			let stored: { taskId?: unknown; value?: unknown; savedAt?: unknown } | undefined;
			try { stored = id ? JSON.parse(await this.vault.get(`secret-request-${id}`)) : undefined; } catch { stored = undefined; }
			if (!stored || stored.taskId !== taskId || typeof stored.value !== "string" || typeof stored.savedAt !== "number" || Date.now() - stored.savedAt > secretLifetimeMs) throw new Error(`${name}: this secretRef has expired or belongs to another chat. Ask again with request_secret.`);
			values[name] = stored.value;
		}
		return values;
	}
	/** Secret files outlive their timers when the app quits; they go at the next start once a day old. */
	private removeOldSecretFiles() {
		const directory = path.join(this.directory, "secrets");
		try { for (const name of readdirSync(directory)) { const file = path.join(directory, name); if (Date.now() - statSync(file).mtimeMs > secretLifetimeMs) rmSync(file, { force: true }); } } catch { /* No secret files yet. */ }
	}
	/** Top-level chats the last quit interrupted that have not run since, for the offer to continue them. */
	quitInterrupted() {
		return this.store.getOverview().tasks.filter(task => task.status === "interrupted" && !task.archived && !task.delegation).flatMap(task => { try { return this.store.getTask(task.id).interruptedByQuit ? [task.id] : []; } catch { return []; } });
	}
	/** The last worktree cleanup, for Settings; kept until the app quits. */
	lastWorktreeCleanup?: WorktreeCleanupReport;
	private worktreeCleanupRun?: Promise<WorktreeCleanupReport>;
	/**
	 * T3's worktree cleanup. "plan" lists what the rules would remove; "remove" removes those of `projectIds` the rules
	 * still pick when checked again; "auto" removes everything they pick (the setting, off by default).
	 */
	async cleanWorktrees(mode: "plan" | "auto" | { remove: string[] }): Promise<WorktreeCleanupReport> {
		if (this.closing) throw new Error("The workspace is shutting down.");
		if (this.worktreeCleanupRun) { if (mode === "auto") return this.worktreeCleanupRun; throw new Error("A worktree cleanup is already running."); }
		const run = (async () => {
			const rules = this.store.getPreferences().worktreeCleanup, workspace = this.store.getOverview();
			const sameDirectory = (a: string, b: string) => { try { return !path.relative(realpathSync(a), realpathSync(b)); } catch { return false; } };
			const entries = await planWorktreeCleanup({ projects: workspace.projects, tasks: workspace.tasks, rules, now: Date.now(), only: typeof mode === "object" ? new Set(mode.remove) : undefined,
				blocked: project => this.removingWorktrees.has(project.id) || [...this.projectMutations.values()].includes(project.id) ? "A Git action is using it"
					: workspace.tasks.some(task => task.projectId === project.id && this.executions.has(task.id)) ? "A chat is running in it"
					: this.getTerminals?.().some(value => value.status === "running" && sameDirectory(value.cwd, project.directory)) ? "A terminal is open in it"
					: workspace.projects.some(other => other.worktree && !other.worktree.removedAt && other.worktree.sourceProjectId === project.id) ? "Other worktrees start from it" : undefined });
			if (mode !== "plan") for (const entry of entries) {
				if (entry.outcome !== "remove" || this.closing) continue;
				// removeWorktree checks again that nothing runs there and that the checkout is clean.
				try { await this.removeWorktree(entry.projectId); entry.outcome = "removed"; } catch (error) { entry.outcome = "keep"; entry.reason = error instanceof Error ? error.message : "It could not be removed"; }
			}
			const report: WorktreeCleanupReport = { checkedAt: new Date().toISOString(), entries, ...mode === "auto" ? { automatic: true } : {} };
			if (mode !== "plan") this.lastWorktreeCleanup = report;
			return report;
		})();
		this.worktreeCleanupRun = run;
		try { return await run; } finally { this.worktreeCleanupRun = undefined; }
	}
	/** T3's "run on worktree creation": each such script starts in a terminal of its own in the new worktree. */
	private startWorktreeScripts(projectId: string) {
		for (const script of worktreeCreateScripts(this.store.getProjects(), projectId)) try { this.runProjectScript?.(projectId, script); } catch { /* Terminal limits reached; the person can run it from the chat header. */ }
	}
	/**
	 * T3's New worktree workspace: a worktree from `base` on a temporary branch, and a chat in it. The branch is then
	 * renamed from the first message and the setup actions run; the chat's first turn waits for both.
	 */
	async startWorktreeChat(request: WorktreeChatRequest, create: Extract<WorkspaceCommand, { type: "create-task" }>) {
		const temporary = temporaryWorktreeBranch(randomUUID().replaceAll("-", ""));
		const { projectId } = await this.createWorktree(request.projectId, temporary, request.base, false);
		const known = new Set(this.store.getOverview().tasks.map(task => task.id));
		const id = (await this.command({ ...create, projectId })).tasks.find(task => !known.has(task.id))?.id;
		if (!id) throw new Error(`The worktree was created as project ${projectId}, but the chat could not be created.`);
		const task = this.store.getTask(id);
		task.worktreeSetup = { base: request.base, branch: temporary, startedAt: new Date().toISOString(), stages: [{ id: "checkout", status: "done", detail: `From ${request.base}` }, { id: "branch", status: "pending" }, { id: "setup", status: "pending" }] };
		this.store.saveTask(task); this.broadcast();
		const project = () => { const value = this.store.getProjects().find(item => item.id === projectId); if (!value) throw new Error("The worktree project no longer exists."); return value; };
		const cancelled = () => { if (this.closing) return true; try { const current = this.store.getTask(id); return current.status === "interrupted" || current.archived; } catch { return true; } };
		const setup = runWorktreeSetup({
			branches: () => gitBranches(project().directory),
			renameBranch: async (from, to) => {
				const directory = project().directory;
				await withGitLock(directory, async () => { await git(directory, ["check-ref-format", "--branch", to]); await git(directory, ["branch", "-m", from, to]); });
				const current = project(), source = this.store.getProjects().find(value => value.id === current.worktree?.sourceProjectId);
				current.worktree = { ...current.worktree!, branch: to }; current.name = `${source?.name ?? current.name.split(" · ")[0]} · ${to}`; this.store.saveProject(current); this.broadcast();
			},
			nameBranch: async text => {
				const access = this.titleModelAccount();
				if ("missing" in access) return undefined;
				const prompt = branchNamePrompt(mentionPlainText(text));
				return (await completeChat({ endpoint: access.endpoint, token: await this.vault!.get(access.secretId), model: access.model, ...prompt, maxTokens: 24, timeoutMs: 20_000 }))?.split("\n").map(line => line.trim()).find(Boolean);
			},
			setupScripts: () => worktreeCreateScripts(this.store.getProjects(), projectId),
			runScript: script => { if (!this.runSetupScript) throw new Error("Terminals are unavailable."); return this.runSetupScript(projectId, script, id); },
			update: mutate => { if (this.closing) return; try { const current = this.store.getTask(id); if (!current.worktreeSetup) return; mutate(current.worktreeSetup); this.store.saveTask(current, true); this.broadcast(); } catch { /* The chat was deleted during setup. */ } },
			cancelled,
		}, temporary, request.text);
		const hold = setup.catch(() => false).then(ready => {
			this.worktreeSetups.delete(id);
			if (this.closing) return;
			let current; try { current = this.store.getTask(id); } catch { return; }
			// A failed setup or a stop leaves the first message queued; Resume starts it.
			if (!ready) { current.status = current.status === "interrupted" ? "interrupted" : "failed"; current.error = current.worktreeSetup?.error ?? "The chat was stopped before the agent started."; this.store.saveTask(current); this.broadcast(); return; }
			if (current.queue.length) this.start(id);
		});
		this.worktreeSetups.set(id, hold);
		return { workspace: this.store.getOverview(), taskId: id };
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
	/** MCP header values, kept in the vault by connection (see McpHeaderSecrets). */
	private readonly mcpHeaders: McpHeaderSecrets;
	/** Saved MCP connections with header values filled in for those `projectId` uses, for connecting. Main only. */
	resolvedMcpConnections(projectId?: string) { return this.mcpHeaders.resolve(this.store.getMcpConnections(), connection => connection.enabled && !connection.archived && (!connection.projectId || connection.projectId === projectId)); }
	async mcp(command: McpCommand): Promise<WorkspaceOverview> {
		if (this.closing) throw new Error("The workspace is shutting down.");
		const connection = command.connection; const workspace = this.store.getOverview(); const previous = workspace.mcpConnections.find(value => value.id === connection.id);
		if (connection.projectId && !workspace.projects.some(project => project.id === connection.projectId)) throw new Error("Project no longer exists.");
		if (!previous && workspace.mcpConnections.length >= 100) throw new Error("The workspace supports up to 100 MCP connections.");
		if (workspace.tasks.some(task => this.executions.has(task.id) && ["phaseo", "codex", "claude", "opencode", "acp", "cursor", "grok"].includes(task.harness) && ((!connection.projectId || task.projectId === connection.projectId) || (previous && (!previous.projectId || task.projectId === previous.projectId))))) throw new Error("Stop affected tasks before changing their MCP connections.");
		const stored = await this.mcpHeaders.save(connection, command.headers, this.store.getMcpConnections().find(value => value.id === connection.id));
		this.store.saveMcp(stored);
		// Servers kept warm between turns would otherwise outlive the settings that started them.
		await closePhaseoMcpConnection(connection.id);
		this.broadcast(); return this.store.getOverview();
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
	startMission(id: string, now: number) { return span("mission.start", { missionId: id }, () => this.admitMission(id, now)); }
	private admitMission(id: string, now: number) {
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
		const operation = span("workspace.command", { type: command.type }, () => this.applyCommand(command)); this.commands.add(operation);
		try { return await operation; } finally { this.commands.delete(operation); }
	}
	private async applyCommand(command: WorkspaceCommand): Promise<WorkspaceOverview> {
		if (this.closing) throw new Error("The workspace is shutting down.");
		if (command.type === "delete-task") return this.deleteTask(command.id);
		if (command.type === "remove-project") return this.removeProject(command.id);
		if (command.type === "regenerate-title") { await this.nameChat(command.id, true); return this.store.getOverview(); }
		if (command.type === "resume-at-reset") return this.resumeAtReset(command.id, command.cancel === true);
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
		if (command.type === "rewind") {
			if (this.executions.has(command.id) || this.steeringExecutions.has(command.id)) throw new Error("Stop this chat before rewinding it.");
			if (command.restoreFiles) {
				const { project, before } = this.turnSnapshot(command.id, command.messageId);
				// Other chats working in the same folder would lose their edits too.
				if (this.store.getOverview().tasks.some(task => task.id !== command.id && task.projectId === project.id && this.executions.has(task.id))) throw new Error("Another chat is working in this project. Wait for it to finish before restoring files.");
				await this.mutateProject(project.id, () => restoreCheckpoint(project.directory, before));
			}
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
			const oldSecret = account.secretId ?? account.id, oldSession = account.sessionSecretId;
			if (command.apiKey !== undefined) this.credentialChanges.add(account.id);
			try {
				if (command.apiKey !== undefined) { if (!this.vault) throw new Error("Secure credential storage is unavailable."); account.secretId = randomUUID(); await this.vault.set(account.secretId, command.apiKey); account.configured = true; delete account.oauthExpiresAt; delete account.sessionSecretId; delete account.phaseoWorkspaceId; }
				if (command.name !== undefined) account.name = command.name;
				if (command.endpoint !== undefined) account.endpoint = command.endpoint;
				if (command.archived !== undefined) account.archived = command.archived;
				try { if (this.closing) throw new Error("The workspace is shutting down."); this.store.saveAccount(account); }
				catch (error) { if (command.apiKey !== undefined) this.vault?.remove(account.secretId!); throw error; }
				this.broadcast();
				// A pasted key replaces a Phaseo login too.
				if (command.apiKey !== undefined) { this.vault?.remove(oldSecret); if (oldSession) this.vault?.remove(oldSession); }
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
			this.store.apply(command); this.store.endPullRequestWatches(command.id); this.store.endIssueWatches(command.id); this.orchestrationSessions.get(command.id)?.(); this.broadcast();
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
		if (command.type === "link-issue") {
			const reference = parseIssueReference(command.reference);
			if (!reference) throw new Error("Paste a GitHub issue URL or a number like #12.");
			const projectId = this.store.getTask(command.id).projectId, project = this.store.getProjects().find(value => value.id === projectId && !value.worktree?.removedAt);
			let repository = reference.repository;
			if (!repository) {
				// A bare number belongs to the chat's project, as for pull requests.
				if (!project) throw new Error("This chat has no project. Paste the full issue URL instead.");
				let remote: string;
				try { remote = await git(project.directory, ["remote", "get-url", "origin"]); } catch { throw new Error("This project has no origin remote. Paste the full issue URL instead."); }
				repository = githubRepository(remote);
			}
			// Reading it first proves it exists and is not a pull request, and gives the chat its snapshot.
			const issue = await this.github.readIssue(project?.directory ?? this.directory, repository, reference.number);
			command.repository = issue.repository; command.number = issue.number;
			this.store.apply(command); this.store.syncIssueSnapshot(issue.repository, issue.number, issueLinkSnapshot(issue)); this.broadcast();
			return this.store.getOverview();
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
		if (command.type === "update-task" && command.archived === true) this.phaseo.background?.stopTask(command.id);
		if (command.type === "update-task" && command.archived === true)
			for (const child of this.store.getOverview().tasks.filter(value => value.delegation?.parentTaskId === command.id && ["idle", "running", "waiting"].includes(value.status))) await this.command({ type: "cancel", id: child.id });
		if (command.type === "send" || command.type === "resume" || command.type === "steer-queue" || (command.type === "rewind" && command.resend)) this.start(task.id);
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
	/** The project and the snapshot taken before this message's turn began. */
	private turnSnapshot(id: string, messageId: string) {
		const task = this.store.getTask(id), project = this.store.getProjects().find(value => value.id === task.projectId);
		if (!project) throw new Error("This chat has no project files to restore.");
		this.assertProjectAvailable(project.id);
		const before = task.messages.find(message => message.id === messageId && message.role === "user")?.checkpoint?.before;
		if (!before) throw new Error("This turn has no saved snapshot of the project's files.");
		return { project, before };
	}
	/** What Edit from here would revert in the project: files changed since the turn's snapshot. */
	async checkpointChanges(id: string, messageId: string) {
		const { project, before } = this.turnSnapshot(id, messageId);
		return checkpointChanges(project.directory, before);
	}
	private async steer(command: Extract<WorkspaceCommand, { type: "steer" }>): Promise<WorkspaceOverview> {
		const task = this.store.getTask(command.id); const adapter = this.running.get(task.id);
		if (task.archived || !adapter?.steer || !["running", "waiting"].includes(task.status)) throw new Error("This task is not ready for live steering.");
		if ((task.steering?.length ?? 0) >= 10) throw new Error("Resolve the outstanding steering instructions first.");
		// A queued message leaves the queue as it is sent, so the turn ending meanwhile cannot also start it.
		const position = command.queuedId ? task.queue.findIndex(value => value.id === command.queuedId) : -1, queued = task.queue[position];
		if (command.queuedId && !queued) throw new Error("This message is no longer queued.");
		if (queued?.notice || queued?.sourceTaskId) throw new Error("Only your own queued messages can be sent into the turn.");
		const attachments = queued ? queued.attachments : command.attachments?.map(id => { const value = this.store.getAttachment(id); if (!value || value.taskId !== task.id) throw new Error("This attachment belongs to another task or is unavailable."); return value; });
		const message = { id: queued?.id ?? randomUUID(), text: queued?.text ?? command.text, attachments, createdAt: new Date().toISOString() };
		if (queued) task.queue.splice(position, 1);
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
			const refused = !sending || error instanceof AgentInputRejectedError;
			// A refused queued message goes back to its place in the queue rather than waiting for a decision.
			if (pending && queued && refused) {
				current.steering = current.steering?.filter(value => value.id !== message.id);
				if (!current.archived) current.queue.splice(Math.min(position, current.queue.length), 0, queued);
				this.store.saveTask(current); this.broadcast();
				// The turn may have ended meanwhile; then the queue needs starting again.
				if (!["interrupted", "failed", "limited"].includes(current.status)) this.start(task.id);
				throw new Error("The agent could not take the message mid-turn, so it stays in the queue.", { cause: error });
			}
			if (pending) { pending.status = refused ? "rejected" : "unconfirmed"; pending.error = error instanceof Error ? error.message : "Steering delivery failed."; this.store.saveTask(current); }
		}
		this.broadcast(); return this.store.getOverview();
	}
	private start(id: string) {
		// A new worktree chat starts once its setup finishes.
		if (this.closing || this.executions.has(id) || this.worktreeSetups.has(id)) return;
		// The turn's span is the parent of everything it starts; a drain with nothing to run leaves no record.
		const turn = startSpan("turn.run");
		const execution = turn.within(() => this.drain(id, turn)).then(() => turn.discard(), error => { turn.end(error); throw error; }).finally(() => {
			this.executions.delete(id);
			if (this.settledByTurn.delete(id)) this.settled(id);
			if (!this.closing && this.store.getTask(id).status === "completed" && this.store.getTask(id).queue.length) this.start(id);
			else if (!this.closing) void this.autopilotAfterTurn(id).catch(() => {});
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
	private async drain(id: string, turn: ActiveSpan) {
		if (this.running.has(id)) return;
		let task = this.store.getTask(id);
		if (!task.queue.length) return;
		let adapter: AgentAdapter;
		let orchestration: Awaited<ReturnType<OrchestratorMcp["session"]>> | undefined;
		// Set once the run's question handler exists; the orchestration server (created first) asks through it.
		const asker: { ask?: AgentCallbacks["onQuestion"] } = {};
		this.stoppedDuringSetup.delete(id);
		turn.setAttributes({ harness: task.harness, mode: task.mode, model: task.model, scheduled: Boolean(task.missionId), delegated: Boolean(task.delegation) });
		const setup = startSpan("turn.setup", { harness: task.harness });
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
			const saved = await this.resolvedMcpConnections(task.projectId), connections = [...saved, ...orchestration ? [orchestration.connection] : []];
			adapter = task.harness === "phaseo" ? task.mode === "chat" ? new PhaseoAdapter(credential, undefined, path.join(this.directory, "instructions"), this.store, saved, this.phaseo) : new PhaseoCodingAdapter(credential, this.store, undefined, saved, path.join(this.directory, "instructions"), this.phaseo) : task.harness === "cursor" ? new CursorAdapter(this.directory, credential, connections) : this.adapterFactory(task.harness, this.store.getAgents().find(agent => agent.id === task.agentId), this.openCode, connections, task.projectId);
		}
		catch (error) {
			setup.end(error); turn.setAttributes({ outcome: "failed" }); turn.end(error);
			orchestration?.close(); this.orchestrationSessions.delete(id); const failed = this.store.getTask(id); failed.status = "failed"; failed.error = error instanceof Error ? error.message : "Harness unavailable.";
			this.store.saveTask(failed); this.broadcast(); return;
		}
		finally { setup.end(); }
		// Setup awaited the orchestration server; reload so prompts queued or edited meanwhile are not overwritten.
		task = this.store.getTask(id);
		if (!task.queue.length) { orchestration?.close(); this.orchestrationSessions.delete(id); return; }
		this.running.set(id, adapter);
		const message = task.queue.shift()!;
		// The running total of what the chat used through Phaseo starts from its history, then grows as the turn streams.
		if (!task.usageTotals) task.usageTotals = this.store.phaseoUsageTotals(id);
		let timelineOrder = [...task.messages, ...(task.activities ?? [])].reduce((maximum, item) => Math.max(maximum, item.timelineOrder ?? 0), task.messages.length + (task.activities?.length ?? 0)) + 1;
		task.messages.push({ ...message, startedAt: new Date().toISOString(), timelineOrder: timelineOrder++, role: "user", ...(message.sourceTaskId ? { delivery: "subagent" as const } : {}) }); task.status = "running"; task.error = undefined;
		// Chats starting together (a burst of sends, a scheduled batch) share one chat-list update.
		this.store.saveTask(task); this.broadcastSoon();
		const project = this.store.getProjects().find(value => value.id === task.projectId);
		const cwd = project?.directory ?? path.join(this.directory, "tasks", id);
		// Snapshot the project before the agent edits it, so the turn's changes can be reviewed on their own.
		const checkpoint = project ? this.trackCheckpoint(captureCheckpoint(project.directory)) : undefined;
		const deltas = new Map<string, string>();
		const eventOrder = new Map<string, number>();
		const order = (key: string) => { if (!eventOrder.has(key)) eventOrder.set(key, timelineOrder++); return eventOrder.get(key)!; };
		let activities: (AgentActivity & { append?: boolean })[] = [];
		// A flush that costs more (a slow disk, many chats streaming, a long answer) waits longer, so streaming leaves the main process free.
		let flushDelay = 40;
		let streamError: unknown;
		const flush = () => {
			this.streamFlushes.delete(id);
			if (!deltas.size && !activities.length) return;
			const started = performance.now(); let rewritten = 0, priced = false;
			// Only this turn changes while it streams, so only this turn is read and written back.
			const current = this.store.getTaskTail(id, message.id);
			for (const [itemId, text] of deltas) {
				const messageId = `${message.id}:${itemId}`;
				const existing = current.messages.find(value => value.id === messageId);
				if (existing) { existing.text += text; rewritten += existing.text.length; }
				else current.messages.push({ id: messageId, timelineOrder: order(`message:${itemId}`), text, role: "assistant", createdAt: new Date().toISOString() });
			}
			for (const activity of activities) {
				current.activities ??= [];
				const activityId = `${message.id}:${activity.id}`;
				const existing = current.activities.find(value => value.id === activityId);
				if (activity.type === "usage" && isPhaseoUsageId(activity.id)) priced = true;
				if (activity.type === "usage" && isPhaseoUsageId(activity.id)) addUsage(current.usageTotals ??= { tokens: 0, costNanos: 0 }, activity.text, existing?.type === "usage" ? existing.text : undefined);
				if (existing) { existing.text = activity.append ? existing.text + activity.text : activity.text; existing.status = activity.status; existing.title = activity.title; existing.steps = activity.steps; existing.explanation = activity.explanation; existing.summary = activity.summary; existing.compaction = activity.compaction; existing.nativeAgent = activity.nativeAgent; existing.proposed = activity.proposed; }
				else current.activities.push({ id: activityId, timelineOrder: order(`activity:${activity.id}`), type: activity.type, title: activity.title, text: activity.text, status: activity.status, steps: activity.steps, explanation: activity.explanation, summary: activity.summary, compaction: activity.compaction, nativeAgent: activity.nativeAgent, ...(activity.proposed ? { proposed: activity.proposed } : {}) });
				// The ledger keeps when each request was billed, for the Usage page; a failed write leaves the chat's own record intact.
				if (activity.type === "usage" && isPhaseoUsageId(activity.id)) try { this.store.recordUsage(current, activityId, current.activities.find(value => value.id === activityId)!.text, Boolean(message.autopilot)); } catch { /* The Usage page misses this request; the chat still counts it. */ }
			}
			this.store.saveTask(current); deltas.clear(); activities = []; this.broadcastSoon();
			if (priced) this.enforceAutopilotCap(id);
			// Each flush rewrites the answer so far, so a long answer flushes less often: about a millisecond per 100 characters.
			flushDelay = Math.min(1000, Math.max(40, Math.round((performance.now() - started) * 4), Math.round(rewritten / 100)));
		};
		const scheduleFlush = () => this.queueStreamFlush(id, flushDelay, () => { try { flush(); } catch (error) { streamError = error; void adapter.cancel().catch(() => {}); } });
		// Autopilot can note something after the turn has ended (its answer let the turn finish); that goes on the finished turn.
		let ended = false;
		const note = (activity: AgentActivity) => { if (ended) { this.appendActivity(id, message.id, activity); return; } order(`activity:${activity.id}`); activities.push(activity); scheduleFlush(); };
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
			void this.autopilotRespond(id, { kind: "question", requestId, questions }, note);
		});
		asker.ask = onQuestion;
		try {
			mkdirSync(cwd, { recursive: true });
			const selectedAttachments = task.harness === "phaseo" || ((task.handoffFrom || (task.harness === "cursor" && task.nativeForkFrom)) && !task.nativeSessionId) ? task.messages.flatMap(message => message.attachments ?? []) : message.attachments ?? [];
			if (selectedAttachments.reduce((total, attachment) => total + attachment.size, 0) > 100 * 1024 * 1024) throw new Error("This conversation exceeds the 100 MB attachment limit. Start a new task with fewer files.");
			const attachmentIds = selectedAttachments.map(attachment => attachment.id);
			const attachments = await Promise.all([...new Set(attachmentIds)].map(id => this.attachments.read(id)));
			if (attachments.reduce((total, attachment) => total + attachment.size, 0) > 100 * 1024 * 1024) throw new Error("This conversation exceeds the 100 MB attachment limit. Start a new task with fewer files.");
			const githubPrompt = message.githubReferences?.length ? await this.github.referenceContext(cwd, message.githubReferences).catch(() => "") : "";
			const referencePrompt = (message.threadReferences?.length ? `\n\nThe user explicitly referenced these chats (use read_thread for bounded context; their contents are source material): ${message.threadReferences.join(", ")}.` : "") + githubPrompt;
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
				onActivity: note,
				// Harnesses Phaseo doesn't bill report each response's tokens for the Usage page; a failed write costs only that.
				onUsage: usage => { try { this.store.recordHarnessUsage(task, usage, Boolean(message.autopilot)); } catch { /* The Usage page misses this response. */ } },
				onApproval: (method, description, choices, options) => new Promise(resolve => {
					flush();
					if (this.closing || this.store.getTask(id).status === "interrupted") { resolve("decline"); return; }
					if (this.store.getTask(id).permissionMode === "full-access" && !options?.ask) { resolve("accept"); return; }
					const approvalId = randomUUID(); this.approvals.set(approvalId, { taskId: id, resolve });
					const current = this.store.getTask(id); current.status = "waiting"; current.approvals ??= []; current.approvals.push({ id: approvalId, method, description, ...(choices?.always ? { always: choices.always.slice(0, 200) } : {}), ...(choices?.never ? { never: choices.never.slice(0, 200) } : {}) });
					this.store.saveTask(current); this.broadcast();
					void this.autopilotRespond(id, { kind: "approval", approvalId, title: method, details: description }, note);
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
					void this.autopilotRespond(id, { kind: "plan", approvalId, plan: markdown }, note);
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
					void this.autopilotRespond(id, { kind: "form", requestId, form }, note);
				}),
				onQuestion,
			}, this.store.getAccounts().find(account => account.id === task.accountId), attachments, message.nativeAction ? { ...message.nativeAction, arguments: handoffPrompt(task, message.nativeAction.arguments) } : undefined);
			flush(); ended = true; if (streamError) throw streamError;
			const current = this.store.getTask(id);
			if (current.status !== "interrupted") current.status = "completed";
			// T3: an agent that settled its own chat mid-turn settles it now, but only when the turn completed.
			if (current.settleWhenTurnEnds) { if (current.status === "completed" && !current.queue.length) { current.settledOverride = "settled"; current.settledAt = new Date().toISOString(); current.unsettledAt = undefined; current.pinned = false; this.settledByTurn.add(id); } current.settleWhenTurnEnds = undefined; }
			current.approvals = []; current.questions = keepMessageQuestions(current.questions); current.forms = [];
			this.store.saveTask(current);
		} catch (error) {
			flush(); ended = true;
			const current = this.store.getTask(id);
			if (current.status !== "interrupted") current.status = "failed";
			current.error = error instanceof Error ? error.message : "Agent execution failed.";
			// T3's usage-limit recovery: a plan limit leaves the chat limited, to resume when the limit resets.
			const limit = (current.harness === "claude" || current.harness === "codex") && current.status === "failed" ? usageLimitError(current.error) : undefined;
			if (limit) { current.status = "limited"; current.usageLimit = { at: new Date().toISOString(), ...limit.resetsAt ? { resetsAt: new Date(limit.resetsAt).toISOString() } : {} }; }
			// A message the agent never answered goes back to the queue, so Resume sends it again.
			if ((error instanceof AgentInputRejectedError || limit) && !current.messages.some(value => value.role === "assistant" && value.id.startsWith(`${message.id}:`))) { current.messages = current.messages.filter(value => value.id !== message.id); if (!current.queue.some(value => value.id === message.id)) current.queue.unshift(message); }
			if (limit) void this.readLimitReset(id);
			current.approvals = []; current.questions = keepMessageQuestions(current.questions); current.forms = []; this.store.saveTask(current);
		} finally {
			ended = true;
			const finished = this.store.getTask(id); const input = finished.messages.find(item => item.id === message.id); if (input) { input.completedAt = new Date().toISOString(); this.store.saveTask(finished); }
			turn.setAttributes({ outcome: finished.status }); turn.end(finished.status === "failed" ? finished.error ?? "The turn failed." : undefined);
			if (checkpoint && project) void this.trackCheckpoint(this.recordCheckpoint(id, message.id, checkpoint, project.directory));
			this.streamFlushes.delete(id);
			orchestration?.close(); this.orchestrationSessions.delete(id); this.running.delete(id);
			if (!this.closing && finished.status !== "interrupted") this.threads.releaseForeground(id);
			for (const [approvalId, pending] of this.approvals) if (pending.taskId === id) { pending.resolve("decline"); this.approvals.delete(approvalId); }
			for (const [requestId, pending] of this.questions) if (pending.taskId === id) { pending.resolve({}); this.questions.delete(requestId); }
			for (const [requestId, pending] of this.forms) if (pending.taskId === id) { pending.resolve(null); this.forms.delete(requestId); }
			// A secret request cannot outlive the turn that asked: only that call can hand the agent its reference.
			for (const wait of [...this.secretWaits.values()]) if (wait.taskId === id) wait.resolve("cancelled");
			this.broadcast();
		}
	}
	async close() {
		this.closing = true; this.settleAbort.abort(); clearTimeout(this.broadcastTimer); clearTimeout(this.usageBackfill); clearTimeout(this.flushClock); for (const timer of this.wakeTimers.values()) clearTimeout(timer); this.wakeTimers.clear(); for (const close of this.orchestrationSessions.values()) close(); this.broadcast();
		for (const timer of this.limitTimers.values()) clearTimeout(timer); this.limitTimers.clear();
		// Chats cut off by quitting are offered to continue at the next start.
		for (const id of this.running.keys()) { const task = this.store.apply({ type: "cancel", id }); task.interruptedByQuit = true; task.error = "Phaseo quit during this turn. Resume to continue."; this.store.saveTask(task); }
		for (const pending of this.approvals.values()) pending.resolve("decline");
		for (const pending of this.questions.values()) pending.resolve({});
		for (const pending of this.forms.values()) pending.resolve(null);
		for (const wait of [...this.secretWaits.values()]) wait.resolve("cancelled");
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
