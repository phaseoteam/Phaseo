import { createHash } from "node:crypto";
import { conversationPageOf } from "../../shared/conversationPage";
import type { RememberedModels } from "../../shared/rememberedModels";
import type { Account, Harness, Message, ModelOption, Project, Task, WorkspaceCommand } from "../../shared/workspace";
import { settleBlocker } from "../../shared/threadLifecycle";
import { overviewOrder, taskOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import type { GitDiffRequest, GitDiffResult, GitRefs, TurnFileChange } from "../../shared/gitDiff";
import type { PullRequestMergeMethod, PullRequestView } from "../../shared/pullRequestView";
import type { BranchPullRequest } from "../../shared/pullRequests";
import type { GitWorkingStatus } from "./phoneReview";
import { projectTree } from "../projectFileSearch";
import { phoneFilePreview } from "./phoneFiles";
import { phoneModels, phoneSetChat, startPhoneChat, type PhoneModelSources } from "./phoneHost";
import type { PhoneHost } from "./phoneSession";
import { TerminalService } from "../terminalService";
import type { WorkspaceStore } from "../workspaceStore";
import type { TerminalSession } from "../../shared/workspace";
import type { ThreadServer } from "../../shared/threadServers";
import { settingsProject, type ProjectScript } from "../../shared/projectSettings";

/** A shell the terminal tests drive: what it was sent, and output and exits it can be made to produce. */
export type FakePty = { pid: number; writes: string[]; killed: boolean; data: (text: string) => void; exit: (exitCode: number) => void };

/** What each harness offers in the tests: Codex lists efforts on the model, Claude as a Reasoning option. */
export const fakeModels: Partial<Record<Harness, ModelOption[]>> = {
	phaseo: [{ id: "phaseo/test", name: "Phaseo test" }, { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", releaseDate: "2026-09-01", organisationId: "anthropic", serviceTiers: [{ id: "fast", name: "Fast", description: "" }] }],
	grok: [{ id: "grok-5-code", name: "Grok 5 Code" }],
	codex: [
		{ id: "gpt-6.1", name: "GPT-6.1", reasoningEfforts: [{ id: "low", description: "" }, { id: "medium", description: "" }, { id: "xhigh", description: "" }], defaultReasoningEffort: "medium" },
		{ id: "gpt-6.1-mini", name: "GPT-6.1 mini" },
		{ id: "gpt-5", name: "GPT-5", legacy: true },
	],
	claude: [{ id: "claude-opus-5-5", name: "Claude Opus 5.5", options: [{ id: "effort", label: "Reasoning", type: "select", options: [{ id: "low", label: "Low" }, { id: "high", label: "High", isDefault: true }] }, { id: "thinking", label: "Thinking", type: "boolean" }] }],
};

/** An in-memory app for the phone tests: chats, their messages, and the commands a phone sent. */
export function fakePhoneHost() {
	const tasks = new Map<string, Task>();
	const projects: Project[] = [{ id: "p1", name: "Phaseo", directory: "/work/phaseo", createdAt: "2026-11-01T00:00:00.000Z" }];
	const commands: WorkspaceCommand[] = [], repositoryChecks: string[] = [];
	/** Each snapshot pair's changed files ("before:after"), and how often git was asked for one. */
	const checkpointFiles = new Map<string, TurnFileChange[]>(), turnReads: string[] = [];
	/** Each project's git status (none: not a checkout), the patch each diff returns, and the diffs asked for as "projectId scope…". */
	const gitStatuses = new Map<string, GitWorkingStatus>(), patches = new Map<string, string>(), diffReads: { projectId: string; request: GitDiffRequest }[] = [];
	/** Each project's folder on disk for file reads, which go through the real tree and preview; and the projects read. */
	const fileRoots = new Map<string, string>(), fileReads: string[] = [];
	const fileRoot = (projectId: string) => { fileReads.push(projectId); const root = fileRoots.get(projectId); if (!root) throw new Error("Project no longer exists."); return root; };
	/**
	 * The Git and pull request side: every call by kind and project, what each answers, a failure the next one throws
	 * (in git's own words), and `hold`, which keeps every call waiting until it settles, to switch access off mid-call.
	 */
	const git = {
		calls: [] as { kind: string; projectId: string; value?: unknown }[],
		refs: { local: ["main", "fix/login"], remote: ["origin/main"], current: "main" } as GitRefs,
		branchPullRequest: { branch: "main", pullRequest: null } as BranchPullRequest,
		failure: undefined as string | undefined,
		commitMessage: "Fix the usage total",
		pullRequests: new Map<number, PullRequestView>(),
		mergeMethod: null as PullRequestMergeMethod | null,
		/** What the window was told a phone did. */
		notes: [] as { device: string; summary: string; projectId?: string }[],
		hold: undefined as Promise<void> | undefined,
	};
	const step = async (kind: string, projectId: string, value?: unknown) => {
		git.calls.push({ kind, projectId, ...value !== undefined ? { value } : {} });
		await git.hold;
		const failure = git.failure; git.failure = undefined;
		if (failure) throw new Error(failure);
	};
	const pullRequestOf = (number: number) => { const view = git.pullRequests.get(number); if (!view) throw new Error("Could not read pull request."); return view; };
	let clock = Date.parse("2026-11-01T10:00:00.000Z");
	const tick = () => new Date(clock += 1000).toISOString();
	// A Phaseo account that can call the gateway, and Codex and Claude Code signed in on the computer.
	const accounts: Account[] = [{ id: "phaseo-account", name: "Phaseo", harness: "phaseo", kind: "api", configured: true }];
	const agents = { local: ["codex", "claude"] as Harness[], failing: new Set<Harness>(), remembered: { favourites: [] } as RememberedModels, projectModels: {} as Record<string, Partial<Record<Harness, ModelOption[]>>> };
	const overview = (): WorkspaceOverview => ({ version: 1, projects, accounts, agents: [], mcpConnections: [], tasks: [...tasks.values()].map(task => taskOverview(task)).sort(overviewOrder) });
	const listeners: ((overview: WorkspaceOverview) => void)[] = [];
	const changed = () => { const value = overview(); for (const listener of listeners) listener(value); };
	const get = (id: string) => { const task = tasks.get(id); if (!task) throw new Error("Task no longer exists."); return task; };
	const touch = (task: Task) => { task.revision = (task.revision ?? 0) + 1; task.updatedAt = tick(); };
	const addTask = (change: Partial<Task> & { id: string }) => {
		const at = tick();
		const task: Task = { title: change.id, harness: "phaseo", model: "phaseo/test", mode: "chat", status: "completed", pinned: false, archived: false, messages: [], queue: [], createdAt: at, updatedAt: at, revision: 1, ...change };
		tasks.set(task.id, task); return task;
	};
	const addMessage = (taskId: string, message: Partial<Message> & { role: Message["role"]; text: string }) => {
		const task = get(taskId), entry: Message = { id: `m${task.messages.length + 1}-${taskId}`, createdAt: tick(), ...message };
		task.messages.push(entry); touch(task); changed(); return entry;
	};
	const discover = async (harness: Harness, _accountId?: string, projectId?: string) => {
		if (agents.failing.has(harness)) throw new Error("Not signed in on the computer.");
		return (projectId ? agents.projectModels[projectId]?.[harness] : undefined) ?? fakeModels[harness] ?? [];
	};
	const sources: PhoneModelSources = { discover, localHarnesses: async () => agents.local, remembered: () => agents.remembered, permissionOf: id => get(id).permissionMode };
	/**
	 * The window's real TerminalService over these projects and chats, with shells that don't run: each pty records what
	 * was typed and outputs or exits when a test says. Projects need a real folder, which the service creates if missing.
	 */
	const saved = new Map<string, TerminalSession>();
	const terminalStore = {
		getProjects: () => projects, getTask: get,
		getTerminals: () => [...saved.values()].map(session => ({ ...session })),
		saveTerminal: (session: TerminalSession) => { saved.set(session.id, { ...session }); },
		deleteTerminal: (id: string) => { saved.delete(id); },
	} as unknown as WorkspaceStore;
	const ptys: FakePty[] = [];
	const spawn = (() => {
		let onData: (text: string) => void = () => {}, onExit: (event: { exitCode: number }) => void = () => {};
		const pty: FakePty = { pid: 1000 + ptys.length, writes: [], killed: false, data: text => onData(text), exit: exitCode => onExit({ exitCode }) };
		ptys.push(pty);
		return { pid: pty.pid, write: (text: string) => { pty.writes.push(text); }, resize: () => {}, kill: () => { pty.killed = true; pty.exit(0); }, onData: (listener: typeof onData) => { onData = listener; }, onExit: (listener: typeof onExit) => { onExit = listener; } };
	}) as unknown as ConstructorParameters<typeof TerminalService>[2];
	const terminals = {
		service: new TerminalService(terminalStore, "/scratch/terminals", spawn), ptys,
		/** The servers each chat runs (Stop takes one off). Scripts live on the project's settings, as the window's do. */
		servers: new Map<string, ThreadServer[]>(),
		setScripts: (projectId: string, scripts: ProjectScript[]) => { const project = projects.find(value => value.id === projectId)!; project.settings = { ...project.settings, scripts }; },
	};
	const host: PhoneHost = {
		desktopName: () => "Test PC", appVersion: "1.2.3", overview,
		task: id => get(id),
		page: query => ({ ...conversationPageOf(get(query.taskId).messages, query, get(query.taskId).revision ?? 0), activities: get(query.taskId).activities ?? [] }),
		command: async command => {
			commands.push(command);
			if (command.type === "send" || command.type === "steer") { const task = get(command.id); task.status = "running"; addMessage(command.id, { role: "user", text: command.text }); }
			else if (command.type === "cancel") { const task = get(command.id); task.status = "interrupted"; touch(task); changed(); }
			else if (command.type === "create-task") {
				const { type: _type, autopilot: _autopilot, ...fields } = command;
				addTask({ id: `new-${tasks.size + 1}`, title: "New task", ...fields }); changed();
			}
			// The lifecycle and settings commands as the store applies them, its refusals included.
			else if (command.type === "settle") { const task = get(command.id); const blocker = settleBlocker(taskOverview(task)); if (blocker) throw new Error(blocker); task.settledOverride = "settled"; task.settledAt = tick(); touch(task); changed(); }
			else if (command.type === "unsettle") { const task = get(command.id); task.settledOverride = "active"; task.settledAt = undefined; touch(task); changed(); }
			else if (command.type === "snooze") { const task = get(command.id); task.snoozedUntil = command.until; task.snoozedAt = tick(); touch(task); changed(); }
			else if (command.type === "wake") { const task = get(command.id); task.snoozedUntil = task.snoozedAt = undefined; touch(task); changed(); }
			else if (command.type === "mark-unread") { const task = get(command.id); task.lastVisitedAt = "2000-01-01T00:00:00.000Z"; touch(task); changed(); }
			else if (command.type === "update-task") {
				const task = get(command.id);
				if ((command.model ?? command.mode ?? command.reasoningEffort ?? command.modelOptions) !== undefined && task.status === "running") throw new Error("Stop this task before changing its model or mode.");
				if (command.model !== undefined && command.model !== task.model) { task.reasoningEffort = undefined; task.modelOptions = undefined; }
				for (const key of ["title", "pinned", "archived", "model", "mode", "reasoningEffort", "modelOptions"] as const) if (command[key] !== undefined) Object.assign(task, { [key]: command[key] });
				touch(task); changed();
			}
			else if (command.type === "queue-remove" || command.type === "queue-edit" || command.type === "queue-move") {
				const task = get(command.id), at = task.queue.findIndex(value => value.id === command.messageId);
				if (command.type === "queue-remove") task.queue.splice(at, 1);
				else if (command.type === "queue-edit") task.queue[at] = { ...task.queue[at]!, text: command.text };
				else { const to = command.direction === "up" ? at - 1 : at + 1; if (to >= 0 && to < task.queue.length) [task.queue[at], task.queue[to]] = [task.queue[to]!, task.queue[at]!]; }
				touch(task); changed();
			}
			else if (command.type === "approval") { const task = get(command.id); if (!task.approvals?.some(value => value.id === command.approvalId)) throw new Error("This approval is no longer pending."); task.approvals = task.approvals.filter(value => value.id !== command.approvalId); touch(task); changed(); }
			return overview();
		},
		newChat: input => startPhoneChat(overview, async command => { await host.command(command); return overview(); }, sources, input, async (request, create) => {
			await step("worktree", request.projectId, request);
			// As startWorktreeChat does: a worktree project from the base, then the chat in it.
			const id = `wt-${projects.length}`;
			projects.push({ id, name: `Phaseo · ${id}`, directory: `/work/${id}`, createdAt: tick(), worktree: { sourceProjectId: request.projectId, branch: id, baseCommit: "f".repeat(40) } });
			await host.command({ ...create, projectId: id });
			return [...tasks.values()].at(-1)!.id;
		}),
		models: input => phoneModels(overview(), sources, input),
		// Every test project is a checkout except one in /scratch.
		isRepository: directory => { repositoryChecks.push(directory); return !directory.startsWith("/scratch"); },
		setChat: async input => { await host.command(await phoneSetChat(get(input.chatId), discover, input)); },
		turnChanges: async (_projectId, before, after) => { turnReads.push(`${before}:${after}`); return checkpointFiles.get(`${before}:${after}`) ?? []; },
		gitStatus: async projectId => gitStatuses.get(projectId) ?? null,
		// A patch is found by its scope ("uncommitted", "branch", or "turn:before:after"), else the project's "*".
		diff: async (projectId, request) => {
			diffReads.push({ projectId, request });
			const key = request.scope === "turn" ? `turn:${request.from}:${request.to}` : request.scope;
			const patch = patches.get(key) ?? patches.get("*") ?? "";
			return { patch, hash: createHash("sha256").update(patch).digest("hex"), truncated: false, repository: true } satisfies GitDiffResult;
		},
		files: async (projectId, request) => projectTree(fileRoot(projectId), request),
		readFile: async (projectId, filename) => phoneFilePreview(fileRoot(projectId), filename),
		branches: async projectId => { await step("branches", projectId); return git.refs; },
		branchPullRequest: async projectId => { await step("branch-pull-request", projectId); return git.branchPullRequest; },
		gitCommand: async (projectId, command) => { await step("git", projectId, command); },
		commitMessage: async projectId => { await step("commit-message", projectId); return git.commitMessage; },
		createPullRequest: async (projectId, chatId) => { await step("create-pull-request", projectId, chatId); return { repository: "phaseo/phaseo", number: 12, url: "https://github.com/phaseo/phaseo/pull/12", status: "created" }; },
		pullRequests: async (projectId, cursor) => {
			await step("pull-requests", projectId, cursor);
			return { repository: "phaseo/phaseo", requests: [...git.pullRequests.values()], fetchedAt: tick(), limitReached: false };
		},
		pullRequest: async (projectId, number) => { await step("pull-request", projectId, number); return pullRequestOf(number); },
		pullRequestFiles: async (projectId, query) => {
			await step("pull-request-files", projectId, query);
			return { repository: "phaseo/phaseo", ...query, total: 2, hasNext: false, limitReached: false, files: [
				{ filename: "src/usage.ts", status: "modified", additions: 1, deletions: 1, blobOid: "c".repeat(40), patch: "@@ -1 +1 @@\n-a\n+b", preview: "available" },
				{ filename: "assets/big.json", status: "added", additions: 90_000, deletions: 0, blobOid: "d".repeat(40), preview: "too-large" },
			] };
		},
		pullRequestAction: async (projectId, request) => {
			await step("pull-request-action", projectId, request);
			const view = pullRequestOf(request.number);
			if (view.headOid !== request.headOid) throw new Error("This pull request changed. It has been refreshed; check it and try again.");
			if (request.action.type === "merge") view.state = "MERGED";
			if (request.action.type === "close") view.state = "CLOSED";
			return view;
		},
		mergeMethod: () => git.mergeMethod,
		fromPhone: note => { git.notes.push(note); },
		terminals: () => terminals.service.get(),
		terminal: command => terminals.service.command(command),
		attachTerminal: (id, viewer, listener) => terminals.service.attach(id, viewer, listener),
		scripts: projectId => settingsProject(projects, projectId)?.settings?.scripts ?? [],
		servers: async chatId => terminals.servers.get(chatId) ?? [],
		stopServer: async (chatId, port) => {
			const servers = terminals.servers.get(chatId) ?? [], server = servers.find(value => value.port === port);
			if (!server) throw new Error("That server is no longer running from this chat.");
			terminals.servers.set(chatId, servers.filter(value => value !== server));
			return server;
		},
	};
	return { host, tasks, projects, accounts, agents, sources, repositoryChecks, checkpointFiles, turnReads, gitStatuses, patches, diffReads, fileRoots, fileReads, git, commands, terminals, addTask, addMessage, get, touch, changed, overview, onChange: (listener: (overview: WorkspaceOverview) => void) => listeners.push(listener) };
}

/** A pull request as the window's pane reads it, for the phone's tests. */
export function fakePullRequestView(number: number, change: Partial<PullRequestView> = {}): PullRequestView {
	const at = "2026-11-01T09:00:00.000Z", actor = { login: "daniel" };
	return {
		number, title: "Fix the usage total", url: `https://github.com/phaseo/phaseo/pull/${number}`, author: "daniel", draft: false, head: "fix/usage", base: "main", updatedAt: at,
		review: "required", checks: "pending", repository: "phaseo/phaseo", body: "Totals were off by one.", state: "OPEN", additions: 3, deletions: 1, changedFiles: 2,
		headOid: "a".repeat(40), baseOid: "b".repeat(40), mergeable: "MERGEABLE", mergeState: "CLEAN", fetchedAt: at,
		id: "PR_1", createdAt: at, authorActor: actor, labels: [], reviewers: [{ login: "sam" }], reviews: [{ actor: { login: "sam" }, state: "COMMENTED", submittedAt: at }],
		checkRuns: [{ name: "build", status: "success" }, { name: "lint", status: "failure", url: "https://github.com/phaseo/phaseo/actions/runs/1" }, { name: "deploy", status: "pending" }],
		comments: [{ id: "IC_1", kind: "comment", author: { login: "sam" }, body: "Looks right.", createdAt: "2026-11-01T09:30:00.000Z", reactions: [] }], commentCount: 1, commentsTruncated: false,
		commits: [{ oid: "e".repeat(40), headline: "Fix the usage total", committedAt: "2026-11-01T09:10:00.000Z", authors: [actor] }], commitCount: 1,
		threads: [], mergeMethods: ["merge", "squash"], viewer: { login: "daniel", canUpdate: true, canMerge: true, canDeleteBranch: true, canEnableAutoMerge: false, canDisableAutoMerge: false },
		autoMergeAllowed: false, headRefExists: true, behind: false,
		...change,
	};
}
