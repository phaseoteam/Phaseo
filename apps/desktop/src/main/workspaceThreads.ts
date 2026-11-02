import type { Account, Harness, ModelOption, Task, WorkspaceCommand } from "../shared/workspace";
import { agentLimitMessage, type AgentCatalog, type AgentCatalogAccount, type AgentCatalogModel, type DelegateRequest, type LaunchRequest, type LaunchResult, type LaunchWorkspace, type ScheduledTask, type ThreadTools, waitDefaultMs, waitMaximumMs } from "../shared/orchestration";
import { validateMissionCommand, type Mission, type MissionCommand } from "../shared/missions";
import { tagsInUse } from "../shared/tags";
import type { WorkspaceOverview } from "../shared/workspaceOverview";
import type { WorkspaceStore } from "./workspaceStore";
import { validateDelegate } from "./threadTools";
import { parsePullRequestReference, pullRequestUrl, samePullRequest, validatePullRequestLinks, type TaskPullRequestLink } from "../shared/pullRequestView";
import { pullRequestChains, visiblePullRequestLinks } from "../shared/pullRequestStacks";
import type { PullRequestGuideResult } from "../shared/pullRequestGuide";
import type { PullRequestGuideOutcome, PullRequestToolTarget, ThreadPullRequestEntry } from "../shared/orchestration";
import { git } from "./gitProcess";
import { githubRepository } from "./projectPullRequests";
import { isPullRequestUrl, issueUrl, parseIssueReference, sameIssue, validateIssueLinks, type IssueDetails, type TaskIssueLink } from "../shared/issueView";
import type { IssueRead, IssueToolTarget, ThreadIssueEntry } from "../shared/orchestration";
import { untrustedBlock, untrustedNotice } from "../shared/untrustedContent";
import { withoutHtmlComments } from "../shared/htmlText";

/** An issue tool's target: a URL, or a number with an optional repository. A pull request URL points at the pull request tools. */
function issueToolReference(target: IssueToolTarget) {
	if (target.url && (target.repository || target.number)) throw new Error("Pass either url, or repository and number, not both.");
	if (target.url && isPullRequestUrl(target.url)) throw new Error("This is a pull request, not an issue. Use the pull request tools (link_pull_request, watch_pull_request) for it.");
	const parsed = parseIssueReference(target.url ?? (target.repository ? `${target.repository}#${target.number}` : `#${target.number}`));
	if (!parsed) throw new Error("This is not a GitHub issue. Pass its URL, or repository and number.");
	return parsed;
}
const issueBodyLimit = 8000, issueCommentLimit = 2000;
const shorten = (value: string, limit: number) => value.length <= limit ? { text: value, truncated: false } : { text: `${value.slice(0, limit - 3)}...`, truncated: true };
/** read_issue's answer: GitHub's text fenced as third-party, long bodies and comments shortened. */
export function issueRead(issue: IssueDetails, linked: boolean): IssueRead {
	const body = shorten(withoutHtmlComments(issue.body).trim(), issueBodyLimit);
	return {
		repository: issue.repository, number: issue.number, url: issue.url, title: issue.title, state: issue.state, stateReason: issue.stateReason ?? null, author: issue.author,
		labels: issue.labels, assignees: issue.assignees, createdAt: issue.createdAt, updatedAt: issue.updatedAt, closedAt: issue.closedAt ?? null, linked, notice: untrustedNotice,
		body: body.text ? untrustedBlock(`issue #${issue.number} body`, body.text) : "", bodyTruncated: body.truncated,
		comments: issue.comments.map(comment => ({ author: comment.author, createdAt: comment.createdAt, url: comment.url ?? null, body: untrustedBlock(`issue comment by ${comment.author ?? "someone"}`, shorten(comment.body.trim(), issueCommentLimit).text) })),
		commentCount: issue.commentCount, commentsShown: issue.comments.length,
	};
}

type Host = {
	store: WorkspaceStore;
	isClosing: () => boolean;
	broadcast: () => void;
	start: (id: string) => void;
	command: (command: WorkspaceCommand) => Promise<WorkspaceOverview>;
	createWorktree?: (projectId: string, branch: string, base: string) => Promise<{ projectId: string }>;
	/** MissionService's command handler, once the scheduler is running. */
	missions?: (command: MissionCommand) => Mission[];
	assertHarnessAvailable: (harness: Harness) => void;
	assertProjectAvailable: (id: string) => void;
	discoverModels?: (harness: Harness, accountId?: string, projectId?: string) => Promise<ModelOption[]>;
	/** Same installation check as the composer; harnesses missing from the list are treated as installed. */
	discoverInstallations?: () => Promise<{ harness: Harness; installed: boolean; error?: string }[]>;
	modelDiscoveries: Set<Promise<unknown>>;
	/** Review guides, once the app has its guide store: write starts a run without waiting for it. */
	/** One GitHub issue with its latest comments, read through gh in `root`. */
	readIssue?: (root: string, repository: string, number: number) => Promise<IssueDetails>;
	pullRequestGuides?: { write: (root: string, repository: string, number: number) => Promise<"started" | "running">; read: (root: string, repository: string, number: number) => Promise<PullRequestGuideResult> };
};
const failure = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : "Could not write the guide.";

const active = (status: Task["status"]) => status === "idle" || status === "running" || status === "waiting";
const modeRank: Record<Task["mode"], number> = { chat: 0, plan: 1, code: 2 };
const permissionRank = (value?: Task["permissionMode"]) => value === "full-access" ? 2 : value === "accept-edits" ? 1 : 0;
/** T3's privilege ceiling: a child can be narrower than its parent, never broader. Chat has no tools, plan reads, code writes. */
export function childPrivileges(parent: Pick<Task, "mode" | "permissionMode">, request: { mode?: Task["mode"]; permissionMode?: Task["permissionMode"] } = {}) {
	if (request.mode && modeRank[request.mode] > modeRank[parent.mode]) throw new Error(`A child of a ${parent.mode} chat cannot use ${request.mode} mode.`);
	if (request.permissionMode && permissionRank(request.permissionMode) > permissionRank(parent.permissionMode)) throw new Error("A child cannot have broader permissions than this chat.");
	return { mode: request.mode ?? parent.mode, permissionMode: request.permissionMode ?? parent.permissionMode };
}
/** Harnesses an agent can target by name; ACP agents need a configured agent and are only reachable by inheritance. */
const delegationHarnesses = ["phaseo", "codex", "claude", "opencode", "pi", "cursor", "grok"] as const satisfies readonly Harness[];
const accountRequired = (harness: Harness) => harness === "phaseo" || harness === "cursor";
const harnessName: Partial<Record<Harness, string>> = { phaseo: "Phaseo", cursor: "Cursor" };
const catalogBytes = 60000;
type PreparedLaunch = { request: LaunchRequest; worktree?: { sourceId: string; branch: string; baseRef: string }; command: Extract<WorkspaceCommand, { type: "create-task" }> };
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const scheduledTask = ({ id, title, prompt, templateTaskId, schedule, enabled, nextRunAt, lastRunAt, lastTaskId, lastStatus, runCount, error }: Mission): ScheduledTask => ({ id, title, prompt: prompt.slice(0, 8000), templateTaskId, schedule, enabled, nextRunAt, lastRunAt, lastTaskId, lastStatus, runCount, error });

export class WorkspaceThreads {
	private readonly listeners = new Set<() => void>();
	private readonly modelCache = new Map<string, { models?: ModelOption[]; checkedAt: number; pending?: Promise<ModelOption[]> }>();
	/** In-flight launches by caller and requestId, so concurrent retries share one chat and one worktree. */
	private readonly launching = new Map<string, Promise<LaunchResult>>();
	private installations?: { checkedAt: number; value: Promise<{ harness: Harness; installed: boolean; error?: string }[]> };
	constructor(private readonly host: Host, private readonly maxActiveAgents: () => number = () => 32) {}
	changed() { for (const listener of [...this.listeners]) listener(); }
	/** Called when a parent's turn ends: foreground children it can no longer wait for deliver their results instead. Factory's stage runs never do: their results go to the work item. */
	releaseForeground(parentId: string) {
		for (const task of this.host.store.getOverview().tasks) if (task.delegation?.parentTaskId === parentId && !task.delegation.background && task.delegation.kind !== "stage" && active(task.status)) this.host.store.requestDelegationWake(task.id);
	}
	private usableAccounts(harness: Harness): Account[] {
		return this.host.store.getAccounts().filter(account => account.harness === harness && account.configured && !account.archived && !(account.oauthExpiresAt && Date.parse(account.oauthExpiresAt) <= Date.now()));
	}
	/** Explicit, then the parent's own account on the same harness, then the single usable account. Phaseo and Cursor require one. */
	private pickAccount(harness: Harness, parent: Task, requested?: string, required = false) {
		if (requested) return requested;
		if (harness === parent.harness && parent.accountId) return parent.accountId;
		const accounts = this.usableAccounts(harness);
		if (accounts.length === 1) return accounts[0].id;
		if (required && accountRequired(harness)) throw new Error(accounts.length ? `Several ${harnessName[harness]} accounts are connected. Pass accountId: ${accounts.map(account => `${account.id} (${account.name})`).join(", ")}.` : `No usable ${harnessName[harness]} account is connected. Ask the user to connect or renew one in Settings → Accounts.`);
		return undefined;
	}
	private assertCapacity() { const count = this.host.store.activeAgentCount(), maximum = this.maxActiveAgents(); if (count >= maximum) throw new Error(agentLimitMessage(count, maximum)); }
	private async discover(parent: Task, harness: Harness, accountId?: string, query?: string) {
		if (this.host.isClosing() || !this.host.discoverModels) throw new Error("Model discovery is unavailable.");
		this.host.assertHarnessAvailable(harness);
		const accounts = this.host.store.getAccounts().filter(account => account.harness === harness && account.configured && !account.archived);
		accountId = this.pickAccount(harness, parent, accountId);
		const account = accountId ? accounts.find(account => account.id === accountId) : undefined;
		if (accountId && !account) throw new Error("Choose a connected account for this harness.");
		if (account?.oauthExpiresAt && Date.parse(account.oauthExpiresAt) <= Date.now()) throw new Error("Sign in again to renew this account.");
		if (accountRequired(harness) && !accountId) return { models: [], total: 0, accounts: accounts.map(({ id, name }) => ({ id, name })) };
		const key = JSON.stringify([harness, accountId, account?.secretId, account?.endpoint, parent.projectId]);
		let cached = this.modelCache.get(key);
		if (!cached) { cached = { checkedAt: 0 }; if (this.modelCache.size >= 32) this.modelCache.delete(this.modelCache.keys().next().value!); this.modelCache.set(key, cached); }
		if (!cached.pending && (!cached.models || Date.now() - cached.checkedAt > 600000)) {
			const entry = cached;
			const discovery = this.host.discoverModels(harness, accountId, parent.projectId).then(models => { entry.models = models; entry.checkedAt = Date.now(); return models; }).finally(() => { entry.pending = undefined; this.host.modelDiscoveries.delete(discovery); });
			entry.pending = discovery; this.host.modelDiscoveries.add(discovery); void discovery.catch(() => {});
		}
		const models = cached.models ?? await cached.pending!;
		const matches = query ? models.filter(model => `${model.name} ${model.id}`.toLowerCase().includes(query.toLowerCase())) : models;
		return { models: matches.slice(0, 100), total: matches.length, accounts: accounts.map(({ id, name }) => ({ id, name })), accountId };
	}
	private installed() {
		if (!this.host.discoverInstallations) return Promise.resolve([]);
		if (!this.installations || Date.now() - this.installations.checkedAt > 300000) {
			const value = this.host.discoverInstallations(); this.installations = { checkedAt: Date.now(), value };
			this.host.modelDiscoveries.add(value); void value.finally(() => this.host.modelDiscoveries.delete(value)).catch(() => { if (this.installations?.value === value) this.installations = undefined; });
		}
		return this.installations.value;
	}
	/** orchestrator_capabilities: every usable harness with its accounts and models in one bounded response. */
	private async catalog(parent: Task, filter: { harness?: Harness; query?: string }): Promise<AgentCatalog> {
		if (this.host.isClosing() || !this.host.discoverModels) throw new Error("Agent discovery is unavailable.");
		const installations = await this.installed().catch(() => []);
		const unavailable: AgentCatalog["unavailable"] = [];
		const targets: { harness: Harness; account?: Account }[] = [];
		for (const harness of filter.harness ? [filter.harness] : delegationHarnesses) {
			const installation = installations.find(value => value.harness === harness);
			const accounts = this.usableAccounts(harness);
			try { this.host.assertHarnessAvailable(harness); } catch (error) { unavailable.push({ harness, reason: error instanceof Error ? error.message : "Unavailable." }); continue; }
			if (!(delegationHarnesses as readonly Harness[]).includes(harness)) unavailable.push({ harness, reason: "Agents can only delegate to this harness by inheriting it from this chat." });
			else if (installation && !installation.installed) unavailable.push({ harness, reason: installation.error ?? "Not installed." });
			else if (harness === "grok" && parent.mode === "chat") unavailable.push({ harness, reason: "Grok supports Code and Plan; children of this Chat run in Chat mode." });
			else if (accountRequired(harness) && !accounts.length) unavailable.push({ harness, reason: "No usable account is connected." });
			else for (const account of accountRequired(harness) || accounts.length ? accounts : [undefined]) targets.push({ harness, account });
		}
		const discovered: { harness: Harness; account: AgentCatalogAccount }[] = [];
		// Native discovery spawns processes; keep it to two at a time.
		for (let index = 0; index < targets.length; index += 2) discovered.push(...await Promise.all(targets.slice(index, index + 2).map(async ({ harness, account }) => {
			const name = account?.name ?? "Default sign-in";
			try {
				const result = await this.discover(parent, harness, account?.id, filter.query);
				const ranked = filter.query ? result.models : [...result.models.filter(model => !model.legacy), ...result.models.filter(model => model.legacy)];
				return { harness, account: { ...(account ? { id: account.id } : {}), name, total: result.total, models: ranked.map((model): AgentCatalogModel => ({ id: model.id, name: model.name, ...(model.legacy ? { legacy: true } : {}), ...(model.default ? { default: true } : {}), ...(model.options?.length ? { options: model.options.map(option => option.type === "select" ? { ...option, options: option.options.slice(0, 16).map(({ id, label, isDefault }) => ({ id, label, ...(isDefault ? { isDefault } : {}) })) } : option) } : {}) })) } };
			} catch (error) { return { harness, account: { ...(account ? { id: account.id } : {}), name, total: 0, models: [], error: error instanceof Error ? error.message.slice(0, 300) : "Discovery failed." } }; }
		})));
		const build = (perAccount: number, options: boolean): AgentCatalog => {
			const harnesses = new Map<Harness, AgentCatalog["harnesses"][number]>();
			for (const { harness, account } of discovered) {
				const entry = harnesses.get(harness) ?? { harness, accountRequired: accountRequired(harness), accounts: [] }; harnesses.set(harness, entry);
				entry.accounts.push({ ...account, models: account.models.slice(0, perAccount).map(model => options ? model : { ...model, options: undefined }) });
			}
			const truncated = !options || discovered.some(({ account }) => account.total > perAccount);
			return { harnesses: [...harnesses.values()], unavailable, limits: { activeAgents: this.host.store.activeAgentCount(), maxActiveAgents: this.maxActiveAgents() }, ...(truncated ? { truncated: true } : {}) };
		};
		for (const [perAccount, options] of [[40, true], [40, false], [20, false], [8, false]] as const) { const value = build(perAccount, options); if (JSON.stringify(value).length <= catalogBytes) return value; }
		return build(3, false);
	}
	/** Shared by delegate_task and launch_thread: an explicit model, account auto-pick, a free agent slot, and the model and its settings checked against the catalog. */
	private async agentSettings(parent: Task, request: Pick<DelegateRequest, "harness" | "model" | "accountId" | "modelOptions">, projectId = parent.projectId) {
		const harness = request.harness ?? parent.harness, inherited = harness === parent.harness;
		const model = request.model ?? (inherited ? parent.model : undefined);
		if (!model || model === "default") throw new Error("Choose an explicit model for delegated work (see list_agents).");
		this.host.assertHarnessAvailable(harness);
		const accountId = this.pickAccount(harness, parent, request.accountId, true);
		this.assertCapacity();
		let modelOptions = inherited && model === parent.model ? parent.modelOptions : undefined;
		if (this.host.discoverModels) {
			const selected = (await this.discover({ ...parent, projectId }, harness, accountId, model)).models.find(value => value.id === model);
			if (!selected) throw new Error("This model is not available for the selected account.");
			if (request.modelOptions) {
				for (const [id, value] of Object.entries(request.modelOptions)) {
					const option = selected.options?.find(option => option.id === id);
					if (!option || (option.type === "boolean" ? typeof value !== "boolean" : typeof value !== "string" || !option.options.some(choice => choice.id === value))) throw new Error(`This model does not offer ${id}=${String(value)}. Use the settings list_agents returns.`);
				}
				modelOptions = Object.keys(request.modelOptions).length ? request.modelOptions : undefined;
			}
		} else if (request.modelOptions) throw new Error("Model settings cannot be checked right now; omit modelOptions.");
		return { harness, model, accountId, modelOptions, agentId: inherited ? parent.agentId : undefined, reasoningEffort: inherited ? parent.reasoningEffort : undefined };
	}
	/** T3 lets an agent launch top-level threads and change schedules only with full access in its default (non-plan) interaction mode. */
	private launcher(callerId: string, action: string) {
		if (this.host.isClosing()) throw new Error("The workspace is shutting down.");
		const caller = this.host.store.getTask(callerId);
		if (caller.archived || caller.status === "interrupted") throw new Error("This chat is not accepting work.");
		if (caller.permissionMode !== "full-access" || caller.mode === "plan") throw new Error(`${action} needs this chat to have full access outside Plan mode. Ask the user to change its permissions.`);
		return caller;
	}
	private launchResult(task: Pick<Task, "id" | "title" | "projectId">): LaunchResult {
		const project = task.projectId ? this.host.store.getProjects().find(value => value.id === task.projectId) : undefined;
		return { id: task.id, title: task.title, ...(task.projectId ? { projectId: task.projectId } : {}), ...(project?.worktree ? { worktree: { branch: project.worktree.branch, directory: project.directory } } : {}) };
	}
	/** Resolves a workspace strategy without side effects; a new worktree is only created when the launch commits. */
	private launchTarget(caller: Task, workspace: LaunchWorkspace = { strategy: "same" }): { projectId?: string; worktree?: PreparedLaunch["worktree"] } {
		const project = (id: string) => { const value = this.host.store.getProjects().find(project => project.id === id); if (!value) throw new Error("Project no longer exists; see list_projects."); this.host.assertProjectAvailable(id); return value; };
		switch (workspace.strategy) {
			case "same": if (caller.projectId) project(caller.projectId); return { projectId: caller.projectId };
			case "none": return {};
			case "project": project(workspace.projectId); return { projectId: workspace.projectId };
			case "existing_worktree": if (!project(workspace.projectId).worktree) throw new Error("This project is not a worktree; use the project strategy."); return { projectId: workspace.projectId };
			case "worktree": {
				const sourceId = workspace.projectId ?? caller.projectId;
				if (!sourceId) throw new Error("This chat has no project; pass the projectId to create the worktree from.");
				project(sourceId); if (!this.host.createWorktree) throw new Error("Worktrees are unavailable.");
				return { projectId: sourceId, worktree: { sourceId, branch: workspace.branch, baseRef: workspace.baseRef ?? "HEAD" } };
			}
		}
	}
	/** Every check that can fail before anything is created, so launch_threads can fail fast. Returns an existing chat for a repeated requestId. */
	private async prepareLaunch(callerId: string, request: LaunchRequest): Promise<PreparedLaunch | { existing: LaunchResult }> {
		const caller = this.launcher(callerId, "Launching a chat");
		const existing = this.host.store.findLaunchedTask(callerId, request.requestId);
		if (existing) return { existing: this.launchResult(existing) };
		const { mode, permissionMode } = childPrivileges(caller, request);
		const target = this.launchTarget(caller, request.workspace);
		const settings = await this.agentSettings(caller, request, target.projectId);
		this.launcher(callerId, "Launching a chat");
		return { request, worktree: target.worktree, command: { type: "create-task", ...settings, projectId: target.projectId, mode, permissionMode } };
	}
	private commitLaunch(callerId: string, prepared: PreparedLaunch): Promise<LaunchResult> {
		const key = `${callerId}\n${prepared.request.requestId}`, pending = this.launching.get(key);
		if (pending) return pending;
		const operation = (async () => {
			const existing = this.host.store.findLaunchedTask(callerId, prepared.request.requestId);
			if (existing) return this.launchResult(existing);
			let projectId = prepared.command.projectId;
			if (prepared.worktree) { this.assertCapacity(); ({ projectId } = await this.host.createWorktree!(prepared.worktree.sourceId, prepared.worktree.branch, prepared.worktree.baseRef)); }
			let task: Task;
			try { this.launcher(callerId, "Launching a chat"); task = this.host.store.createLaunchedTask({ ...prepared.command, projectId }, { byTaskId: callerId, requestId: prepared.request.requestId }, prepared.request.prompt, prepared.request.title, this.maxActiveAgents()); }
			catch (error) { if (prepared.worktree) throw new Error(`${message(error, "The chat could not be created.")} Its worktree was created as project ${projectId}; retry with {strategy:"existing_worktree",projectId:"${projectId}"}.`, { cause: error }); throw error; }
			this.host.broadcast(); this.host.start(task.id); return this.launchResult(task);
		})().finally(() => this.launching.delete(key));
		this.launching.set(key, operation); return operation;
	}
	private async launchBatch(callerId: string, requests: LaunchRequest[]) {
		this.launcher(callerId, "Launching chats");
		if (!requests.length || requests.length > 20 || new Set(requests.map(request => request.requestId)).size !== requests.length) throw new Error("Launch 1 to 20 chats with distinct requestIds.");
		const prepared: (PreparedLaunch | { existing: LaunchResult })[] = [];
		for (const request of requests) { try { prepared.push(await this.prepareLaunch(callerId, request)); } catch (error) { throw new Error(`Nothing was launched. ${request.requestId}: ${message(error, "Invalid chat.")}`, { cause: error }); } }
		const fresh = prepared.filter((value): value is PreparedLaunch => !("existing" in value));
		const branches = fresh.flatMap(value => value.worktree ? [JSON.stringify([value.worktree.sourceId, value.worktree.branch])] : []);
		if (new Set(branches).size !== branches.length) throw new Error("Nothing was launched. Use a distinct branch for each new worktree.");
		const active = this.host.store.activeAgentCount(), maximum = this.maxActiveAgents();
		if (active + fresh.length > maximum) throw new Error(`Nothing was launched: ${fresh.length} new chats would exceed the limit. ${agentLimitMessage(active, maximum)}`);
		const results: (LaunchResult | { requestId: string; error: string })[] = [];
		for (const value of prepared) {
			if ("existing" in value) { results.push(value.existing); continue; }
			try { results.push(await this.commitLaunch(callerId, value)); } catch (error) { results.push({ requestId: value.request.requestId, error: message(error, "The chat could not be launched.") }); }
		}
		return { results };
	}
	/** A schedule's template can be any active chat whose mode and permissions do not exceed the caller's; runs copy its settings, never its history. */
	private assertTemplate(caller: Task, id: string, allowMissing = false) {
		let template: Task;
		try { template = this.host.store.getTask(id); } catch (error) { if (allowMissing) return; throw error; }
		if (template.archived && !allowMissing) throw new Error("Choose an active template chat.");
		if (modeRank[template.mode] > modeRank[caller.mode] || permissionRank(template.permissionMode) > permissionRank(caller.permissionMode)) throw new Error("A schedule's template chat cannot have a broader mode or permissions than this chat.");
		if (!allowMissing) this.host.assertHarnessAvailable(template.harness);
	}
	private scheduler(callerId: string, action: string) {
		const caller = this.launcher(callerId, action), command = this.host.missions;
		if (!command) throw new Error("Scheduling is unavailable.");
		return { caller, command };
	}
	forThread(parentId: string): ThreadTools {
		const summary = (task: Pick<Task, "id" | "title" | "harness" | "model" | "status" | "parentId"> & { error?: string; tags?: string[] }) => ({ id: task.id, title: task.title, harness: task.harness, model: task.model, status: task.status, parentId: task.parentId, error: task.error, ...(task.tags?.length ? { tags: task.tags } : {}) });
		/** Owned: a child this chat delegated, forked or handed off, plus, where `launched`, a top-level chat it launched. */
		const scoped = (id: string, childOnly = false, launched = false) => {
			const task = this.host.store.getTask(id);
			const owned = task.delegation?.parentTaskId === parentId || (launched && task.launch?.byTaskId === parentId);
			if ((childOnly || id !== parentId) && !owned && (childOnly || !this.host.store.getTask(parentId).messages.some(message => message.role === "user" && message.threadReferences?.includes(id)))) throw new Error("This chat is outside this agent's scope.");
			return task;
		};
		/** The project checkout a pull request is read through: the chat's own for a bare number, else one whose origin is its repository. */
		const guideTarget = async (target: PullRequestToolTarget) => {
			const parsed = parsePullRequestReference(target.url ?? (target.repository ? `${target.repository}#${target.number}` : `#${target.number}`));
			if (!parsed || (target.url && (target.repository || target.number))) throw new Error("Pass either url, or repository and number.");
			const projects = this.host.store.getProjects().filter(project => !project.worktree?.removedAt), own = this.host.store.getTask(parentId).projectId;
			const origin = async (directory: string) => { try { return githubRepository(await git(directory, ["remote", "get-url", "origin"])); } catch { return undefined; } };
			const ordered = [...projects.filter(project => project.id === own), ...projects.filter(project => project.id !== own)];
			const repository = parsed.repository ?? (ordered[0]?.id === own ? await origin(ordered[0].directory) : undefined);
			if (!repository) throw new Error("This chat's project has no GitHub origin. Pass the pull request's URL instead.");
			for (const project of ordered) if ((await origin(project.directory))?.toLowerCase() === repository.toLowerCase()) return { root: project.directory, identity: { repository, number: parsed.number, url: pullRequestUrl(repository, parsed.number) } };
			throw new Error(`No project in this workspace is a checkout of ${repository}, so its pull requests cannot be read here. Add one first.`);
		};
		const retry = (requestId: string) => this.host.store.getOverview().tasks.find(task => task.delegation?.parentTaskId === parentId && task.delegation.requestId === requestId);
		return {
			handoff: async (id, request) => {
				scoped(id); const parent = scoped(parentId);
				if (this.host.isClosing() || parent.archived || parent.status === "interrupted") throw new Error("This parent is not accepting work.");
				if (!request.requestId.trim() || request.requestId.length > 100 || !request.model.trim() || request.model === "default") throw new Error("Choose an explicit model and retry identifier.");
				const existing = retry(request.requestId);
				if (existing) return summary(this.host.store.getTaskView(existing.id));
				this.host.assertHarnessAvailable(request.harness);
				request = { ...request, accountId: this.pickAccount(request.harness, parent, request.accountId, true) };
				if (parent.projectId) this.host.assertProjectAvailable(parent.projectId);
				this.assertCapacity();
				if (this.host.discoverModels && !(await this.discover(parent, request.harness, request.accountId, request.model)).models.some(model => model.id === request.model)) throw new Error("This model is not available for the selected account.");
				if (this.host.isClosing()) throw new Error("Workspace is shutting down.");
				// The store copies this parent's mode and permission mode onto the continuation.
				const child = this.host.store.handoffDelegatedTask(parentId, id, request.requestId, request, this.maxActiveAgents());
				this.host.broadcast(); return summary(child);
			},
			rename: async (id, title) => { scoped(id, true); if (!title.trim() || title.length > 100) throw new Error("Invalid chat title."); await this.host.command({ type: "update-task", id, title }); return summary(scoped(id, true)); },
			steer: async (id, text) => { scoped(id, true, true); if (this.host.isClosing() || this.host.store.getTask(parentId).status === "interrupted") throw new Error("This parent is no longer accepting work."); if (!text.trim() || text.length > 100000) throw new Error("Invalid child prompt."); await this.host.command({ type: "steer", id, text }); return summary(scoped(id, true, true)); },
			queue: id => scoped(id, true).queue.map(({ id, text, createdAt }) => ({ id, text: text.slice(0, 8000), createdAt })),
			editQueue: async (id, messageId, text) => { const child = scoped(id, true); if (!child.queue.some(message => message.id === messageId)) throw new Error("Queued message was not found."); if (text !== undefined && (!text.trim() || text.length > 100000)) throw new Error("Invalid queued prompt."); await this.host.command(text === undefined ? { type: "queue-remove", id, messageId } : { type: "queue-edit", id, messageId, text }); return summary(scoped(id, true)); },
			fork: async (id, requestId, messageId) => {
				scoped(id); if (this.host.isClosing()) throw new Error("Workspace is shutting down.");
				const parent = this.host.store.getTask(parentId); if (parent.delegation) throw new Error("Fork from the parent chat to keep ownership explicit.");
				const existing = retry(requestId); if (existing) return summary(this.host.store.getTaskView(existing.id));
				// The store copies this parent's mode and permission mode onto the fork.
				const child = this.host.store.forkDelegatedTask(parentId, id, requestId, messageId, this.maxActiveAgents()); this.host.broadcast(); return summary(child);
			},
			send: async (id, text) => {
				const child = scoped(id, true, true); if (this.host.isClosing() || this.host.store.getTask(parentId).status === "interrupted") throw new Error("This parent is no longer accepting work."); if (!text.trim() || text.length > 100000) throw new Error("Invalid child prompt.");
				// Sending to a stopped child starts it, so it needs a free slot.
				if (!["running", "waiting"].includes(child.status) && !child.queue.length) this.assertCapacity();
				await this.host.command({ type: "send", id, text }); return summary(scoped(id, true, true));
			},
			merge: async (id, requestId) => { scoped(id, true); if (this.host.isClosing() || this.host.store.getTask(parentId).status === "interrupted") throw new Error("This parent is no longer accepting results."); const parent = this.host.store.mergeThreadContext(parentId, id, requestId); this.host.broadcast(); if (!parent.archived && ["idle", "completed"].includes(parent.status)) this.host.start(parentId); return summary(parent); },
			models: async (harness, accountId, query) => { const { models, total, accounts } = await this.discover(this.host.store.getTask(parentId), harness, accountId, query); return { models, total, accounts }; },
			agents: async (filter = {}) => this.catalog(this.host.store.getTask(parentId), filter),
			list: query => this.host.store.getOverview().tasks.filter(task => (task.id === parentId || task.delegation?.parentTaskId === parentId || task.launch?.byTaskId === parentId) && (!query || task.title.toLowerCase().includes(query.toLowerCase()))).slice(0, 50).map(summary),
			read: id => { scoped(id, false, true); const task = this.host.store.getTaskView(id); return { thread: summary(task), messages: task.messages.slice(-30).map(({ role, text, createdAt }) => ({ role, text: text.slice(0, 8000), createdAt })), truncated: (task.conversationCounts?.messages ?? task.messages.length) > 30 || task.messages.some(message => message.text.length > 8000) }; },
			delegate: async raw => {
				const request = validateDelegate(raw);
				if (this.host.isClosing()) throw new Error("The workspace is shutting down.");
				let parent = scoped(parentId);
				if (parent.archived || parent.status === "interrupted") throw new Error("This parent chat is not accepting delegated work.");
				const existing = retry(request.requestId);
				if (existing) return summary(this.host.store.getTask(existing.id));
				const { mode, permissionMode } = childPrivileges(parent, request);
				const settings = await this.agentSettings(parent, request);
				parent = scoped(parentId);
				if (this.host.isClosing() || parent.archived || parent.status === "interrupted") throw new Error("This parent chat is no longer accepting delegated work.");
				if (parent.projectId) this.host.assertProjectAvailable(parent.projectId);
				const child = this.host.store.createDelegatedTask({ type: "create-task", ...settings, projectId: parent.projectId, mode, permissionMode }, { parentTaskId: parentId, requestId: request.requestId, background: request.background, role: request.role }, request.role ? `Role: ${request.role}\n\n${request.prompt}` : request.prompt, request.title, this.maxActiveAgents());
				this.host.broadcast(); this.host.start(child.id); return summary(child);
			},
			wait: async (id, timeoutMs = waitDefaultMs, signal) => {
				if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > waitMaximumMs) throw new Error("Invalid wait timeout.");
				scoped(id, true, true);
				return new Promise(resolve => {
					const check = (abandoned = false) => {
						const child = scoped(id, true, true), parent = this.host.store.getTask(parentId);
						if (!abandoned && !this.host.isClosing() && parent.status !== "interrupted" && active(child.status)) return;
						clearTimeout(timer); this.listeners.delete(listener); signal?.removeEventListener("abort", abort);
						// Mirror T3's upgrade-to-always-wake: nobody is waiting any more, so the result is delivered as a message. Launched chats never deliver.
						const deliveryQueued = abandoned && active(child.status) && !this.host.isClosing() && Boolean(child.delegation) && child.delegation?.kind !== "stage";
						if (deliveryQueued && !child.delegation?.background) this.host.store.requestDelegationWake(id);
						resolve({ thread: summary(child), timedOut: abandoned, result: child.status === "completed" ? child.messages.findLast(message => message.role === "assistant")?.text.slice(0, 32000) : undefined, ...(deliveryQueued ? { deliveryQueued } : {}) });
					};
					const listener = () => check(); const abort = () => check(true);
					const timer = setTimeout(abort, timeoutMs);
					this.listeners.add(listener); signal?.addEventListener("abort", abort, { once: true });
					if (signal?.aborted) abort(); else check();
				});
			},
			interrupt: async id => { scoped(id, true, true); await this.host.command({ type: "cancel", id }); return summary(scoped(id, true, true)); },
			launch: async request => { const prepared = await this.prepareLaunch(parentId, request); return "existing" in prepared ? prepared.existing : this.commitLaunch(parentId, prepared); },
			launchBatch: requests => this.launchBatch(parentId, requests),
			projects: query => {
				const current = this.host.store.getTask(parentId).projectId, folder = (directory: string) => directory.split(/[\\/]/).filter(Boolean).at(-1) ?? directory;
				// Folder names only: full paths stay private to the desktop.
				return this.host.store.getProjects().filter(project => !query || `${project.name} ${folder(project.directory)}`.toLowerCase().includes(query.toLowerCase())).slice(0, 200).map(project => ({ id: project.id, name: project.name, directory: folder(project.directory), ...(project.id === current ? { current: true } : {}), ...(project.worktree ? { worktree: { branch: project.worktree.branch, baseCommit: project.worktree.baseCommit, sourceProjectId: project.worktree.sourceProjectId } } : {}), ...(project.worktree?.removedAt ? { removed: true } : {}) }));
			},
			organize: async (id, action, title, tags, until) => {
				const task = id === parentId ? this.host.store.getTask(id) : scoped(id, true, true);
				if (this.host.isClosing()) throw new Error("The workspace is shutting down.");
				if (action === "rename") { if (!title?.trim() || title.length > 100) throw new Error("Invalid chat title."); await this.host.command({ type: "update-task", id, title }); }
				else if (action === "pin" || action === "unpin") await this.host.command({ type: "update-task", id, pinned: action === "pin" });
				else if (action === "tag") await this.host.command({ type: "update-task", id, tags: tags ?? [] });
				else if (action === "settle" && id === parentId && ["running", "waiting"].includes(task.status)) { const current = this.host.store.getTask(id); current.settleWhenTurnEnds = true; this.host.store.saveTask(current, true); }
				else if (action === "settle" || action === "unsettle" || action === "wake") await this.host.command({ type: action, id });
				else if (action === "snooze") { if (!until || Number.isNaN(Date.parse(until))) throw new Error("snooze needs until, an ISO date-time."); await this.host.command({ type: "snooze", id, until }); }
				else if (action === "unarchive") await this.host.command({ type: "update-task", id, archived: false });
				else {
					if (id === parentId) throw new Error("A chat cannot archive itself; ask the user to archive it.");
					// Archive stops the chat first, then the runtime's archive path stops the agents it started.
					if (task.status === "running" || task.status === "waiting" || (task.status === "idle" && task.queue.length)) await this.host.command({ type: "cancel", id });
					await this.host.command({ type: "update-task", id, archived: true });
				}
				const current = this.host.store.getTask(id); return { ...summary(current), pinned: current.pinned, archived: current.archived, tags: current.tags ?? [], settled: current.settledOverride === "settled", ...(current.settleWhenTurnEnds ? { settlesWhenTurnEnds: true } : {}), ...(current.snoozedUntil ? { snoozedUntil: current.snoozedUntil } : {}), ...(action === "tag" ? { tagsInUse: tagsInUse(this.host.store.getOverview().tasks).slice(0, 50) } : {}) };
			},
			pullRequest: async (requested, action, target) => {
				const id = requested ?? parentId, task = id === parentId ? this.host.store.getTask(id) : scoped(id, true, true);
				if (this.host.isClosing()) throw new Error("The workspace is shutting down.");
				if (action === "watch" && task.delegation?.parentTaskId) throw new Error("This chat is a delegated agent, so it cannot watch pull requests. Its parent chat owns the pull request: finish your task and report back instead.");
				const reference = target.url ?? (target.repository ? `${target.repository}#${target.number}` : `#${target.number}`), parsed = parsePullRequestReference(reference);
				if (target.url && (target.repository || target.number)) throw new Error("Pass either url, or repository and number, not both.");
				if (!parsed) throw new Error("This is not a GitHub pull request. Pass its URL, or repository and number.");
				const links = () => visiblePullRequestLinks(validatePullRequestLinks(this.host.store.getTask(id).pullRequests));
				const find = (repository?: string) => links().filter(link => link.number === parsed.number && (!repository || samePullRequest(link, { repository, number: parsed.number })));
				const before = find(parsed.repository);
				const result = (link: TaskPullRequestLink) => ({ repository: link.repository, number: link.number, url: link.url });
				if (action === "unlink" || action === "unwatch") {
					// Idempotent, as in T3: a pull request that is not linked (or not watched) is already in the asked-for state.
					if (before.length > 1) throw new Error("Several linked pull requests have this number. Pass repository or url.");
					const link = before[0];
					if (!link) return { repository: parsed.repository ?? "", number: parsed.number, url: parsed.repository ? pullRequestUrl(parsed.repository, parsed.number) : "", ...(action === "unlink" ? { wasLinked: false } : { watching: false, wasWatching: false }) };
					await this.host.command(action === "unlink" ? { type: "unlink-pull-request", id, repository: link.repository, number: link.number } : { type: "watch-pull-request", id, repository: link.repository, number: link.number, watching: false });
					return { ...result(link), ...(action === "unlink" ? { wasLinked: true } : { watching: false, wasWatching: Boolean(link.watching) }) };
				}
				// The runtime resolves a bare number against the chat's project and fills in the repository.
				const command: Extract<WorkspaceCommand, { type: "link-pull-request" }> = { type: "link-pull-request", id, reference: parsed.repository ? `${parsed.repository}#${parsed.number}` : `#${parsed.number}`, source: "agent" };
				await this.host.command(command);
				const link = find(command.repository)[0];
				if (!link) throw new Error("Could not link the pull request.");
				if (action === "link") return { ...result(link), alreadyLinked: before.length > 0 };
				await this.host.command({ type: "watch-pull-request", id, repository: link.repository, number: link.number, watching: true });
				return { ...result(link), watching: true, wasWatching: Boolean(link.watching) };
			},
			issue: async (requested, action, target) => {
				const id = requested ?? parentId, task = id === parentId ? this.host.store.getTask(id) : scoped(id, true, true);
				if (this.host.isClosing()) throw new Error("The workspace is shutting down.");
				if (action === "watch" && task.delegation?.parentTaskId) throw new Error("This chat is a delegated agent, so it cannot watch issues. Its parent chat owns the issue: finish your task and report back instead.");
				const parsed = issueToolReference(target);
				const links = () => validateIssueLinks(this.host.store.getTask(id).issues) ?? [];
				const find = (repository?: string) => links().filter(link => link.number === parsed.number && (!repository || sameIssue(link, { repository, number: parsed.number })));
				const before = find(parsed.repository);
				const result = (link: TaskIssueLink) => ({ repository: link.repository, number: link.number, url: link.url });
				if (action === "unlink" || action === "unwatch") {
					// Idempotent: an issue that is not linked (or not watched) is already in the asked-for state.
					if (before.length > 1) throw new Error("Several linked issues have this number. Pass repository or url.");
					const link = before[0];
					if (!link) return { repository: parsed.repository ?? "", number: parsed.number, url: parsed.repository ? issueUrl(parsed.repository, parsed.number) : "", ...(action === "unlink" ? { wasLinked: false } : { watching: false, wasWatching: false }) };
					await this.host.command(action === "unlink" ? { type: "unlink-issue", id, repository: link.repository, number: link.number } : { type: "watch-issue", id, repository: link.repository, number: link.number, watching: false });
					return { ...result(link), ...(action === "unlink" ? { wasLinked: true } : { watching: false, wasWatching: Boolean(link.watching) }) };
				}
				// The runtime resolves a bare number against the chat's project, reads the issue and fills in the repository.
				const command: Extract<WorkspaceCommand, { type: "link-issue" }> = { type: "link-issue", id, reference: parsed.repository ? `${parsed.repository}#${parsed.number}` : `#${parsed.number}`, source: "agent" };
				await this.host.command(command);
				const link = find(command.repository)[0];
				if (!link) throw new Error("Could not link the issue.");
				if (action === "link") return { ...result(link), alreadyLinked: before.length > 0 };
				await this.host.command({ type: "watch-issue", id, repository: link.repository, number: link.number, watching: true });
				return { ...result(link), watching: true, wasWatching: Boolean(link.watching) };
			},
			issueList: async requested => {
				const id = requested ?? parentId, task = id === parentId ? this.host.store.getTask(id) : scoped(id, true, true);
				return { issues: (validateIssueLinks(task.issues) ?? []).map((link): ThreadIssueEntry => ({ repository: link.repository, number: link.number, url: link.url, source: link.source, watching: Boolean(link.watching), state: link.snapshot?.state ?? null, title: link.snapshot?.title ?? null, labels: link.snapshot?.labels ?? [] })) };
			},
			readIssue: async target => {
				if (!this.host.readIssue) throw new Error("Issue tools are unavailable.");
				const parsed = issueToolReference(target), task = this.host.store.getTask(parentId);
				const project = this.host.store.getProjects().find(value => value.id === task.projectId && !value.worktree?.removedAt);
				let repository = parsed.repository;
				if (!repository) {
					if (!project) throw new Error("This chat has no project. Pass the issue's URL, or repository and number.");
					try { repository = githubRepository(await git(project.directory, ["remote", "get-url", "origin"])); } catch { throw new Error("This chat's project has no GitHub origin. Pass the issue's URL instead."); }
				}
				const issue = await this.host.readIssue(project?.directory ?? process.cwd(), repository, parsed.number);
				return issueRead(issue, (validateIssueLinks(task.issues) ?? []).some(link => sameIssue(link, issue)));
			},
			pullRequestList: async requested => {
				const id = requested ?? parentId, task = id === parentId ? this.host.store.getTask(id) : scoped(id, true, true);
				const links = visiblePullRequestLinks(validatePullRequestLinks(task.pullRequests)), chains = pullRequestChains(links);
				const placement = new Map(chains.flatMap(chain => chain.layers.map((link, index) => [`${link.repository.toLowerCase()}#${link.number}`, { kind: chain.kind, position: index + 1, size: chain.layers.length }] as const)));
				const pullRequests = links.map((link): ThreadPullRequestEntry => {
					const stack = placement.get(`${link.repository.toLowerCase()}#${link.number}`);
					return { repository: link.repository, number: link.number, url: link.url, source: link.source, watching: Boolean(link.watching), state: link.snapshot?.state ?? null, title: link.snapshot?.title ?? null, headBranch: link.snapshot?.head ?? null, baseBranch: link.snapshot?.base ?? null, isDraft: link.snapshot?.draft ?? null, stack: stack && stack.size > 1 ? stack : null };
				});
				return { pullRequests, chains: chains.filter(chain => chain.layers.length > 1).map(chain => ({ kind: chain.kind, numbers: chain.layers.map(link => link.number) })) };
			},
			writePullRequestGuides: async targets => {
				const guides: PullRequestGuideOutcome[] = [];
				for (const target of targets) {
					let resolved: Awaited<ReturnType<typeof guideTarget>> | undefined;
					try {
						resolved = await guideTarget(target);
						if (!this.host.pullRequestGuides) throw new Error("Review guides are unavailable.");
						guides.push({ ...resolved.identity, outcome: await this.host.pullRequestGuides.write(resolved.root, resolved.identity.repository, resolved.identity.number), detail: null });
					} catch (error) { guides.push({ ...(resolved?.identity ?? { repository: target.repository ?? "", number: target.number ?? 0, url: target.url ?? (target.repository && target.number ? pullRequestUrl(target.repository, target.number) : "") }), outcome: "failed", detail: failure(error) }); }
				}
				return { guides };
			},
			readPullRequestGuide: async target => {
				const { root, identity } = await guideTarget(target);
				if (!this.host.pullRequestGuides) throw new Error("Review guides are unavailable.");
				const result = await this.host.pullRequestGuides.read(root, identity.repository, identity.number);
				return { ...identity, guide: result.guide, run: result.running ? { status: "running" } : result.error ? { status: "failed", error: result.error } : null, currentHeadSha: result.currentHeadSha || null, stale: Boolean(result.guide && result.currentHeadSha && result.guide.headSha !== result.currentHeadSha) };
			},
			scheduled: () => this.host.store.missions.list().slice(0, 100).map(scheduledTask),
			schedule: async request => {
				const { caller, command } = this.scheduler(parentId, "Scheduling a task"), templateTaskId = request.templateTaskId ?? parentId;
				this.assertTemplate(caller, templateTaskId);
				const before = new Set(this.host.store.missions.list().map(mission => mission.id));
				const saved = command(validateMissionCommand({ type: "save", title: request.title, prompt: request.prompt, templateTaskId, schedule: request.schedule })).find(mission => !before.has(mission.id));
				if (!saved) throw new Error("The schedule could not be saved.");
				// Missions start paused in the app; an agent asking for a schedule wants it running, as T3's schedule_task does by default.
				if (request.enabled !== false) command({ type: "enable", id: saved.id, enabled: true });
				return scheduledTask(this.host.store.missions.get(saved.id));
			},
			updateSchedule: async (id, update) => {
				const { caller, command } = this.scheduler(parentId, "Changing a schedule"), mission = this.host.store.missions.get(id);
				this.assertTemplate(caller, mission.templateTaskId);
				if (!Object.values(update).some(value => value !== undefined)) throw new Error("Choose enabled, title, prompt or schedule to change.");
				if (update.title !== undefined || update.prompt !== undefined || update.schedule !== undefined) command(validateMissionCommand({ type: "save", id, title: update.title ?? mission.title, prompt: update.prompt ?? mission.prompt, templateTaskId: mission.templateTaskId, schedule: update.schedule ?? mission.schedule }));
				if (update.enabled !== undefined) command({ type: "enable", id, enabled: update.enabled });
				return scheduledTask(this.host.store.missions.get(id));
			},
			deleteSchedule: async id => {
				const { caller, command } = this.scheduler(parentId, "Deleting a schedule");
				this.assertTemplate(caller, this.host.store.missions.get(id).templateTaskId, true);
				command({ type: "delete", id }); return { id, deleted: true as const };
			},
			runSchedule: async id => {
				const { caller, command } = this.scheduler(parentId, "Running a schedule");
				this.assertTemplate(caller, this.host.store.missions.get(id).templateTaskId);
				command({ type: "run", id }); return scheduledTask(this.host.store.missions.get(id));
			},
		};
	}
}
