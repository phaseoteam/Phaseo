import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { STALL_NUDGE, STALL_WAIT, TRUSTED_BOTS, activityMessage, checksActivity, heldBackLine, sortActivity, stallAction, stallSummary, type GithubActivity } from "../../shared/factory/activity";
import { autopilotFits, lastRun, linkedItem, pullsFor, stageAgent, withItemEffort } from "../../shared/factory/actions";
import { INPUTS_FOLDER, attachRef, attachable, attachmentKey, attachmentsFor, imageProblem, isAttachmentName, supportsAttach } from "../../shared/factory/attachments";
import { DEMO_AGENTS, DEMO_SETTINGS, demoAttachment, demoItems, demoNotes, demoProof, demoRepos, demoRuns } from "../../shared/factory/demo";
import { agentForStage, defaultPlaybooks, withPlaybookDefaults } from "../../shared/factory/intake";
import { ASK_ROUNDS, asksReporter, pullRequestBody, reportMarkdown, reporterComment, runOutcome, stageOutcome, verdictPassed, type ProofRef } from "../../shared/factory/report";
import { COMPUTER, MAX_NOTES, applyNoteReport, noteRefs, notesForPrompt } from "../../shared/factory/notes";
import { TRIAGE_THRESHOLD, similarIssues } from "../../shared/factory/similar";
import { ASKS_REPORTER, STAGES, ciBrief, conflictBrief, currentStage, emptyStages, findingsBrief, staleChecks, issueBody, replyPrompt, stageLabel, stagePrompt, stagesFor } from "../../shared/factory/stages";
import type { AgentProfile, CheckRun, FactorySettings, GithubChange, ImageUpload, PullFiles, RepoLabel, IssueComment, Mentionable, MergeState, NotePatch, TimelineEntry, RepoNote, RepoStatus, FactorySnapshot, ItemAction, LogLine, NewIssueInput, Run, RunOutcome, RunReport, SimilarItem, StageId, StageStatus, StartRunInput, WorkItem } from "../../shared/factory/types";
import { localClones } from "./clones";
import { MAX_ATTACH, SEARCH_LIMIT, activitySince, allComments, changesSince, checkoutRepo, closeAsDuplicate, closeItem, comment, commentsSince, allChecks, lineComment, pullFiles, replyToThread, resolveThread, assignable, deleteComment, editComment, editItem, editPeopleOrLabels, repoLabels, rerunFailed, updateBranch, createIssue, createPullRequest, failedLog, ghVersion, githubLogin, importOpen, itemTimeline, mentionable, readItem, linkWork, markDraft, markReady, mergePull, mergeState, openCounts, pullChecks, reopenItem, reviewPull } from "./github";
import { changedFiles, git, prepareProof, prepareWorktree, proofDir } from "./worktrees";
import type { AgentProcess, StageRunner, StageWorkspace } from "./runner";

/** What Factory adds on top of GitHub, saved per item. GitHub stays the source of truth for the rest. */
export interface ItemOverlay {
	assigneeId?: string;
	effort?: string;
	loggedHere?: boolean;
	duplicateOf?: number;
	ci?: WorkItem["ci"];
	attachments?: WorkItem["attachments"];
	branch?: string;
	linked?: number;
	revisions?: number;
	asked?: WorkItem["asked"];
	autopilot?: WorkItem["autopilot"];
	stages?: WorkItem["stages"];
}

/** What Factory keeps between starts, saved as one row of the desktop's database (see persistence.ts). */
export interface SavedState {
	settings: FactorySettings;
	overlays: Record<string, ItemOverlay>;
	runs: Run[];
	notes?: Record<string, RepoNote[]>;
	/** Each item's desktop thread. */
	threads?: Record<string, string>;
}

/** Where Factory's state is saved: rows of the desktop's database, written together in one transaction. */
export interface FactoryPersistence {
	read(key: "state" | "items"): string | undefined;
	write(entries: Partial<Record<"state" | "items", string>>): void;
}

/** The desktop's threads, as Factory uses them: one per item, and a child of it per stage run. */
export interface FactoryThreads extends StageRunner {
	/** The item's thread, made if it has none. `agent` is the model it starts on; `workspace` the item's worktree, if it has one. */
	ensureParent(item: WorkItem, agent: AgentProfile | undefined, workspace: StageWorkspace | undefined): Promise<string>;
	/** Links the item (and the pull request that fixes it) to its thread again, after Factory opened that pull request. */
	linkItem?(threadId: string, item: WorkItem): Promise<void>;
	/** Whether a run's thread can carry on a reply: still there and on this agent. Otherwise the reply needs the whole brief. */
	canResume?(threadId: string, agent: AgentProfile): boolean;
}

export interface FactoryDeps {
	/** Where Factory keeps attachments and the items' worktrees. */
	dataDir: string;
	demo: boolean;
	broadcast(snapshot: FactorySnapshot): void;
	persistence: FactoryPersistence;
	/** Every model on the desktop's accounts that can run a stage. */
	agents(): Promise<AgentProfile[]>;
	threads: FactoryThreads;
	/** Why no more stages can start now (every agent slot is busy), or undefined when one can. */
	capacity?(): string | undefined;
}

/** Each repository's open issues and pull requests as GitHub last gave them, kept so a restart needn't read them all again. */
export interface RepoCache {
	importedAt?: number;
	syncedAt?: number;
	items: WorkItem[];
	error?: string;
}

/** Searches start a little before the last one ended, so nothing updated in between is missed. */
const SYNC_OVERLAP = 5 * 60_000;
/** Everything is read again once a day, which catches issues that were deleted or moved to another repository. */
const REIMPORT_AFTER = 24 * 3_600_000;

/** How a run starts: fresh, carrying on from an earlier run's session, or with a brief of its own. */
interface LaunchOptions {
	resume?: Run;
	message?: string;
	brief?: string;
	/** Factory carrying on an interrupted run by itself: how many times it has, including this one. */
	continued?: number;
}

/** How many times Factory carries on one piece of work by itself before it leaves it to a person. */
const AUTO_CONTINUE = 2;

/** How long Factory waits before carrying on a run whose agent crashed: long enough for a blip to pass. */
const CRASH_PAUSE = [10_000, 45_000];
/** Before redoing anything, the agent checks what's done: in the worktree, and on GitHub, so nothing is posted or pushed twice. */
const CHECK_FIRST = "check what's already done first: in the worktree (files, commits) and on GitHub (comments, pushes, pull requests). Don't repeat anything that already happened outside the worktree. Then finish the stage.";
const CONTINUE_AFTER_QUIT = `Phaseo closed while you were working on this, and has started again. Carry on from where you stopped: ${CHECK_FIRST}`;
const CONTINUE_AFTER_CRASH = (why: string) => `Your last attempt stopped unexpectedly (${why}). Carry on from where you stopped: ${CHECK_FIRST}`;

const MAX_SAVED_RUNS = 200;
const MAX_LOG_LINES = 2_000;
/** A window coming back into focus re-reads GitHub when the last check is older than this. */
const STALE_AFTER = 30_000;
/** While a pull request's checks are running, they're read this often. */
const CI_POLL = 30_000;
/** How often running runs are looked at for stalls. */
const STALL_POLL = 60_000;

export class FactoryStore {
	private snapshot: FactorySnapshot;
	private overlays: Record<string, ItemOverlay> = {};
	private cache: Record<string, RepoCache> = {};
	private importing = new Map<string, { done: number; total: number }>();
	private cacheChanged = false;
	private sessions = new Map<string, AgentProcess>();
	/** Runs being stopped by hand, so their exit reads as stopped rather than failed. */
	private stopping = new Set<string>();
	/** Crashed runs waiting a moment to be carried on. */
	private carryTimers = new Map<string, NodeJS.Timeout>();
	/** Until interrupted runs have been carried on after a start. */
	private starting = true;
	/** When the item list was last rebuilt for an import's progress. */
	private progressAt = 0;
	/** Reporters who answered since the last check, picked up once the list is rebuilt. */
	private answers: { itemId: string; why: string }[] = [];
	private saveTimer: NodeJS.Timeout | null = null;
	/** Said in the window when the saved settings couldn't be read. */
	private loadProblem: string | undefined;
	private demoTimer: NodeJS.Timeout | null = null;
	private pollTimer: NodeJS.Timeout | null = null;
	private checkTimer: NodeJS.Timeout | null = null;
	private checking = false;
	private stallTimer: NodeJS.Timeout | null = null;
	/** Runs Factory stopped because they stalled, with why: they end as failed, for a person to look at. */
	private stalled = new Map<string, string>();
	/** Runs whose GitHub activity is being read now. */
	private hearing = new Set<string>();
	/** When each running run's thread last showed its agent at work. */
	private movedAt = new Map<string, number>();
	/** The agents as the desktop's accounts offer them, before the efforts chosen in Settings. */
	private discovered: AgentProfile[] = [];
	private readonly createdAt = Date.now();
	private readonly dataDir: string;
	private readonly demo: boolean;
	private readonly broadcast: (snapshot: FactorySnapshot) => void;

	constructor(private readonly deps: FactoryDeps) {
		this.dataDir = deps.dataDir;
		this.demo = deps.demo;
		this.broadcast = deps.broadcast;
		const now = Date.now();
		this.snapshot = this.demo
			? { settings: DEMO_SETTINGS, items: demoItems(now), runs: demoRuns(now), agents: DEMO_AGENTS, notes: demoNotes(now), threads: {}, loadedAt: now - 70_000, demo: true, github: { version: "2.99.0", attach: true }, repos: demoRepos(now) }
			: { settings: { ...DEMO_SETTINGS, repos: [], showRepo: "", playbooks: defaultPlaybooks() }, items: [], runs: [], agents: [], notes: {}, threads: {}, loadedAt: 0, demo: false, github: { version: null, attach: false }, repos: [] };
	}

	private get worktreeRoot() {
		return path.join(this.dataDir, "worktrees");
	}

	async load(): Promise<void> {
		if (this.demo) {
			this.demoTimer = setInterval(() => this.tickDemo(), 1_500);
			return;
		}
		let saved: SavedState | undefined;
		try {
			const text = this.deps.persistence.read("state");
			saved = text ? JSON.parse(text) as SavedState : undefined;
		} catch {
			this.loadProblem = "Factory couldn't read its saved settings, so it started fresh.";
		}
		if (saved) {
			const settings = { ...saved.settings } as FactorySettings & { hubUrl?: string; hubKey?: string; theme?: string };
			delete settings.hubUrl; delete settings.hubKey; delete settings.theme;
			this.snapshot.settings = { ...this.snapshot.settings, ...settings, repos: settings.repos ?? [], playbooks: withPlaybookDefaults(saved.settings) };
			this.overlays = saved.overlays ?? {};
			const interrupted = new Set((saved.runs ?? []).filter((run) => run.status === "running" || run.interrupted === "app").map((run) => run.itemId));
			// Autopilot carries on when a run finishes, so it stays on only where an interrupted run is carried on.
			for (const [itemId, overlay] of Object.entries(this.overlays)) if (!interrupted.has(itemId)) delete overlay.autopilot;
			this.snapshot.notes = saved.notes ?? {};
			this.snapshot.threads = saved.threads ?? {};
			// Runs that were going when the app quit or crashed: their threads were stopped, so they're carried on below.
			this.snapshot.runs = (saved.runs ?? []).map((run) => (run.status === "running" ? { ...run, status: "cancelled", interrupted: "app", summary: "Phaseo closed while this was running", finishedAt: run.finishedAt ?? Date.now() } : run));
		}
		// The cache is only what GitHub said: if it's lost, the next check reads it all again.
		try {
			const text = this.deps.persistence.read("items");
			this.cache = text ? (JSON.parse(text) as { repos: Record<string, RepoCache> }).repos ?? {} : {};
		} catch {
			this.cache = {};
		}
		this.rebuildItems();
		this.schedulePoll();
		this.stallTimer = setInterval(() => this.checkStalls(), STALL_POLL);
	}

	/**
	 * What starting needs from outside: GitHub, the agents on this computer, then the runs that were cut short.
	 * The window opens before this, on what was saved, and fills in as it lands.
	 */
	async start(): Promise<void> {
		try {
			await this.refresh();
			// Agents are known once the accounts have been read: now the interrupted runs can go on.
			await this.continueInterrupted();
		} finally {
			this.starting = false;
			this.drainQueue();
		}
	}

	/**
	 * Carries on each run that Factory closing or crashing cut short, however long ago, on the same session
	 * and worktree: Factory saved which were going, so none is lost. One whose issue or pull request has
	 * since been closed or merged isn't carried on; its stage says it was interrupted, and why it stays so.
	 */
	private async continueInterrupted() {
		if (this.demo) return;
		// Quit or crash mid-run, and agents that crashed with Factory quitting before carrying them on.
		const due = this.snapshot.runs.filter((run) => run.interrupted && !run.carriedOnAt && run.status !== "running" && !this.snapshot.runs.some((other) => other.resumes === run.id));
		for (const run of due) {
			const item = this.snapshot.items.find((candidate) => candidate.id === run.itemId);
			if (item && (item.state === "closed" || item.state === "merged")) {
				const shown = item.kind === "pull" && run.stage === "fix" ? "review" : run.stage;
				const why = `Interrupted when Phaseo closed, and not carried on: this ${item.kind === "pull" ? "pull request" : "issue"} was ${item.state} since.`;
				this.log(run.id, { at: Date.now(), kind: "info", text: why });
				this.patchRun(run.id, (current) => ({ ...current, carriedOnAt: Date.now(), summary: why }));
				this.setStage(item.id, shown, { ...item.stages[shown], status: "failed", runId: run.id, summary: why, finishedAt: run.finishedAt });
				continue;
			}
			await this.carryOnRun(run, CONTINUE_AFTER_QUIT);
		}
	}

	/**
	 * Starts a run that picks up an interrupted one: its session when it had one, so the agent remembers what
	 * it did, and its worktree either way. Past the limit, or if it can't start, the stage is left for a person.
	 */
	private async carryOnRun(run: Run, prompt: string) {
		const continued = (run.continued ?? 0) + 1;
		const item = this.snapshot.items.find((candidate) => candidate.id === run.itemId);
		// Dealt with now, whatever happens next: it's never carried on twice.
		this.patchRun(run.id, (current) => ({ ...current, carriedOnAt: Date.now() }));
		if (!item) return;
		const shown = item.kind === "pull" && run.stage === "fix" ? "review" : run.stage;
		const leave = (why: string) => {
			this.log(run.id, { at: Date.now(), kind: "error", text: why });
			this.setStage(item.id, shown, { ...item.stages[shown], status: "failed", runId: run.id, summary: why, finishedAt: Date.now() });
			this.endAutopilot(item.id, run.id, why);
		};
		if (continued > AUTO_CONTINUE) return leave(`Stopped unexpectedly ${AUTO_CONTINUE + 1} times, so Factory left it for you. Run it again when you're ready.`);
		if (!this.agentOrNull(run.agentId)) return leave(`Couldn't carry on: ${run.agentId} isn't available any more`);
		this.log(run.id, { at: Date.now(), kind: "info", text: `Carrying on where it stopped (${continued} of ${AUTO_CONTINUE})` });
		try {
			const next = await this.launch({ itemId: run.itemId, stage: run.stage, agentId: run.agentId }, { resume: run.sessionId ? run : undefined, message: run.sessionId ? prompt : undefined, continued });
			this.patchRun(run.id, (current) => ({ ...current, carriedOnBy: next.id }));
		} catch (error) {
			leave(`Couldn't carry on: ${message(error)}`);
		}
	}

	get(): FactorySnapshot {
		return this.snapshot;
	}

	itemBody(itemId: string): string {
		return this.snapshot.items.find((item) => item.id === itemId)?.body ?? "";
	}

	async refresh(): Promise<FactorySnapshot> {
		if (this.demo) {
			this.snapshot = { ...this.snapshot, loadedAt: Date.now() };
			this.changed();
			return this.snapshot;
		}
		const settings = this.snapshot.settings;
		const known = this.snapshot.github.login ? { login: this.snapshot.github.login, avatar: this.snapshot.github.avatar } : null;
		const [agents, version, user] = await Promise.all([this.deps.agents().catch(() => this.discovered), ghVersion(), known ?? githubLogin(), ...settings.repos.map((repo) => this.sync(repo.repo))]);
		this.discovered = agents;
		this.snapshot = { ...this.snapshot, agents: this.withEfforts(agents), loadedAt: Date.now(), github: { version, attach: supportsAttach(version), login: user?.login, avatar: user?.avatar } };
		this.rebuildItems();
		for (const answer of this.answers.splice(0)) this.reporterAnswered(answer.itemId, answer.why);
		this.drainQueue();
		void this.watchChecks();
		void this.passOnActivity();
		return this.snapshot;
	}

	/**
	 * Reads what changed in a repository since the last check. A repository that was never read, or not
	 * read in full for a day, or away longer than search can cover, is read in full in the background.
	 */
	private async sync(repo: string): Promise<void> {
		const cached = this.cache[repo];
		if (this.importing.has(repo)) return;
		if (!cached?.importedAt || !cached.syncedAt || Date.now() - cached.importedAt > REIMPORT_AFTER) {
			void this.importRepo(repo).catch(() => undefined);
			return;
		}
		const started = Date.now();
		try {
			const changed = await changesSince(repo, cached.syncedAt - SYNC_OVERLAP);
			if (changed.length >= SEARCH_LIMIT) {
				void this.importRepo(repo).catch(() => undefined);
				return;
			}
			const byId = new Map(cached.items.map((item) => [item.id, item]));
			await Promise.all(changed.map((item) => this.checkForAnswer(byId.get(item.id), item)));
			for (const item of changed) {
				// Closed and merged items leave the list, unless Factory worked on them: those stay, to show how they ended.
				if (item.state === "open" || item.state === "draft" || this.overlays[item.id]) byId.set(item.id, item);
				else byId.delete(item.id);
			}
			this.cache[repo] = { ...cached, syncedAt: started, items: [...byId.values()], error: undefined };
		} catch (error) {
			this.cache[repo] = { ...cached, error: message(error) };
		}
		this.cacheChanged = true;
	}

	/** Reads every open issue and pull request in a repository. */
	async importRepo(repo: string): Promise<void> {
		if (this.demo || this.importing.has(repo)) return;
		const started = Date.now();
		this.importing.set(repo, { done: 0, total: 0 });
		this.rebuildItems();
		try {
			const counts = await openCounts(repo);
			const total = counts.issues + counts.pulls;
			this.importing.set(repo, { done: 0, total });
			this.rebuildItems();
			const items = await importOpen(repo, (done) => {
				this.importing.set(repo, { done, total });
				// Rebuilding the whole list for every page is too much for a big repository: a few times a second is plenty.
				if (Date.now() - this.progressAt < 400) return;
				this.progressAt = Date.now();
				this.rebuildItems();
			});
			const found = new Set(items.map((item) => item.id));
			// Items Factory worked on that are no longer open stay, to show how they ended.
			const kept = (this.cache[repo]?.items ?? []).filter((item) => !found.has(item.id) && this.overlays[item.id] && (item.state === "closed" || item.state === "merged"));
			this.cache[repo] = { importedAt: started, syncedAt: started, items: [...items, ...kept] };
		} catch (error) {
			this.cache[repo] = { ...this.cache[repo], items: this.cache[repo]?.items ?? [], error: message(error) };
		} finally {
			this.importing.delete(repo);
		}
		this.cacheChanged = true;
		this.rebuildItems();
	}

	async addRepo(repo: string, checkout: string): Promise<void> {
		const name = repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
		if (!/^[\w.-]+\/[\w.-]+$/.test(name)) throw new Error("Use owner/name, for example phaseo-app/phaseo");
		const repos = this.snapshot.settings.repos;
		const existing = repos.find((entry) => entry.repo.toLowerCase() === name.toLowerCase());
		// A folder is checked now, not when an agent first needs it.
		if (checkout.trim()) {
			const origin = await checkoutRepo(checkout.trim());
			if (!origin) throw new Error(`${checkout.trim()} isn't a clone of a GitHub repository`);
			if (origin.toLowerCase() !== name.toLowerCase()) throw new Error(`That folder is a clone of ${origin}, not ${name}`);
		}
		// Added without a folder: a clone found on this computer is used when there's only one.
		const found = !existing && !checkout.trim() ? (await localClones().catch(() => [])).filter((clone) => clone.repo.toLowerCase() === name.toLowerCase()) : [];
		const next = existing
			? repos.map((entry) => (entry === existing ? { ...entry, path: checkout.trim() || entry.path } : entry))
			: [...repos, { repo: name, path: checkout.trim() || (found.length === 1 ? found[0]!.path : ""), addedAt: Date.now() }];
		this.snapshot = { ...this.snapshot, settings: { ...this.snapshot.settings, repos: next } };
		this.changed();
		// Reading every open issue can take minutes; the Repositories page shows its progress.
		if (!existing) void this.importRepo(name).catch(() => undefined);
	}

	/** Puts the repositories in this order, which every list of them follows. Names it doesn't know are left out; ones it isn't given keep their place at the end. */
	orderRepos(order: string[]) {
		const place = (repo: string) => {
			const index = order.indexOf(repo);
			return index < 0 ? order.length : index;
		};
		const { settings } = this.snapshot;
		const repos = [...settings.repos].sort((a, b) => place(a.repo) - place(b.repo));
		const statuses = [...this.snapshot.repos].sort((a, b) => place(a.repo) - place(b.repo));
		this.snapshot = { ...this.snapshot, settings: { ...settings, repos }, repos: statuses };
		this.changed();
	}

	async removeRepo(repo: string): Promise<void> {
		// Its agents stop first: their items are about to go.
		for (const run of this.snapshot.runs) if (run.status === "running" && run.itemId.startsWith(`${repo}#`)) this.cancelRun(run.id);
		const { settings } = this.snapshot;
		delete this.cache[repo];
		this.cacheChanged = true;
		this.snapshot = { ...this.snapshot, settings: { ...settings, repos: settings.repos.filter((entry) => entry.repo !== repo), showRepo: settings.showRepo === repo ? "" : settings.showRepo } };
		this.rebuildItems();
	}

	/** The window's list: every repository's cached items, linked up and with what Factory added on top. */
	private rebuildItems() {
		if (this.demo) return;
		const repos = this.snapshot.settings.repos;
		const items = linkWork(repos.flatMap((repo) => this.cache[repo.repo]?.items ?? []))
			.map((item) => this.withOverlay(item))
			.sort((a, b) => b.updatedAt - a.updatedAt);
		const statuses = repos.map((repo): RepoStatus => {
			const cached = this.cache[repo.repo];
			const open = (cached?.items ?? []).filter((item) => item.state === "open" || item.state === "draft");
			return { repo: repo.repo, importing: this.importing.get(repo.repo), importedAt: cached?.importedAt, syncedAt: cached?.syncedAt, issues: open.filter((item) => item.kind === "issue").length, pulls: open.filter((item) => item.kind === "pull").length, error: cached?.error };
		});
		const failing = statuses.find((status) => status.error);
		this.snapshot = { ...this.snapshot, items, repos: statuses, error: this.loadProblem ?? (failing ? `${failing.repo}: ${failing.error}` : undefined) };
		this.changed();
	}

	/** Puts an item Factory just made on GitHub into the cache, before GitHub's own lists catch up. */
	private remember(item: WorkItem) {
		const cached = this.cache[item.repo] ?? { items: [] };
		this.cache[item.repo] = { ...cached, items: [item, ...cached.items.filter((candidate) => candidate.id !== item.id)] };
		this.cacheChanged = true;
	}

	private repoPath(repo: string): string {
		const checkout = this.snapshot.settings.repos.find((entry) => entry.repo === repo)?.path;
		if (!checkout) throw new Error(`Add a local checkout of ${repo} in Settings → Factory → Repositories first`);
		return checkout;
	}

	/** Coming back to the window is when people expect new work to be there. */
	refreshIfStale() {
		if (Date.now() - this.snapshot.loadedAt > STALE_AFTER) void this.refresh().catch(() => undefined);
	}

	async updateSettings(patch: Partial<FactorySettings>): Promise<FactorySnapshot> {
		const settings = { ...this.snapshot.settings, ...patch };
		this.snapshot = { ...this.snapshot, settings };
		if (patch.agentEfforts && !this.demo) this.snapshot = { ...this.snapshot, agents: this.withEfforts(this.discovered) };
		this.changed();
		if (patch.pollMinutes !== undefined) this.schedulePoll();
		return this.snapshot;
	}

	/** The agents with the effort chosen for each in Settings. */
	private withEfforts(agents: AgentProfile[]): AgentProfile[] {
		const efforts = this.snapshot.settings.agentEfforts ?? {};
		return agents.map((agent) => (efforts[agent.id] ? { ...agent, effort: efforts[agent.id] } : agent));
	}

	/**
	 * The item's desktop thread, made if it has none. Its project is the item's worktree when the repository has a clone
	 * here, so the person works where the stages do.
	 */
	async openThread(itemId: string): Promise<string> {
		const item = this.item(itemId);
		const clone = this.snapshot.settings.repos.find((entry) => entry.repo === item.repo)?.path;
		let workspace: StageWorkspace | undefined;
		if (clone && !this.demo) {
			const { dir, branch } = await prepareWorktree(this.worktreeRoot, clone, item);
			if (item.kind === "issue") this.patchItem(item.id, (current) => ({ ...current, branch }));
			workspace = { dir, branch, clone };
		}
		const agentId = item.assigneeId ?? stageAgent(item, stagesFor(item)[0]!.id, this.snapshot);
		return this.deps.threads.ensureParent(this.item(itemId), this.agentOrNull(agentId) ?? this.snapshot.agents[0], workspace);
	}

	/** Records the item's thread (the stage threads call this when they make one). */
	setThread(itemId: string, threadId: string) {
		if (this.snapshot.threads[itemId] === threadId) return;
		this.snapshot = { ...this.snapshot, threads: { ...this.snapshot.threads, [itemId]: threadId } };
		this.changed();
	}

	threadOf(itemId: string): string | undefined {
		return this.snapshot.threads[itemId];
	}

	private withOverlay(item: WorkItem): WorkItem {
		const overlay = this.overlays[item.id];
		if (!overlay) return item;
		return { ...item, assigneeId: overlay.assigneeId, effort: overlay.effort, loggedHere: overlay.loggedHere, duplicateOf: overlay.duplicateOf, ci: overlay.ci, attachments: item.attachments ?? overlay.attachments, branch: item.branch ?? overlay.branch, linked: item.linked ?? overlay.linked, revisions: overlay.revisions, asked: overlay.asked, autopilot: overlay.autopilot, stages: staleChecks(item, { ...emptyStages(), ...overlay.stages }) };
	}

	private item(itemId: string): WorkItem {
		const item = this.snapshot.items.find((candidate) => candidate.id === itemId);
		if (!item) throw new Error("Work item not found");
		return item;
	}

	private patchItem(itemId: string, patch: (item: WorkItem) => WorkItem) {
		this.snapshot = { ...this.snapshot, items: this.snapshot.items.map((item) => (item.id === itemId ? patch(item) : item)) };
		const item = this.snapshot.items.find((candidate) => candidate.id === itemId);
		if (item) this.overlays[itemId] = { assigneeId: item.assigneeId, effort: item.effort, loggedHere: item.loggedHere, duplicateOf: item.duplicateOf, ci: item.ci, attachments: item.attachments, branch: item.branch, linked: item.linked, revisions: item.revisions, asked: item.asked, autopilot: item.autopilot, stages: item.stages };
		this.changed();
	}

	private patchRun(runId: string, patch: (run: Run) => Run) {
		this.snapshot = { ...this.snapshot, runs: this.snapshot.runs.map((run) => (run.id === runId ? patch(run) : run)) };
		this.changed();
	}

	private log(runId: string, line: LogLine) {
		this.patchRun(runId, (current) => ({ ...current, log: [...current.log, line].slice(-MAX_LOG_LINES) }));
	}

	assign(itemId: string, agentId: string | null) {
		this.patchItem(itemId, (item) => ({ ...item, assigneeId: agentId ?? undefined }));
	}

	/** Effort levels go to the tools on their command lines and in their options, so only plain words. */
	setEffort(itemId: string, effort: string | null) {
		if (effort !== null && !/^[a-z]+$/.test(effort)) throw new Error(`Unsupported effort: ${effort}`);
		this.patchItem(itemId, (item) => ({ ...item, effort: effort ?? undefined }));
	}


	private agent(agentId: string): AgentProfile {
		const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
		if (!agent) throw new Error("That agent isn't available: check its account in Settings → Accounts");
		return agent;
	}

	startRun(input: StartRunInput): Promise<Run> {
		return this.launch(input, {});
	}

	private async launch(input: StartRunInput, options: LaunchOptions): Promise<Run> {
		const item = this.item(input.itemId);
		const agent = withItemEffort(this.agent(input.agentId), item);
		const full = this.demo ? undefined : this.deps.capacity?.();
		if (full) throw new Error(full);
		const busy = this.worktreeBusy(item);
		if (busy) throw new Error(`${stageLabel(busy.stage)} is still running in this worktree`);

		const run: Run = { id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, itemId: item.id, stage: input.stage, agentId: agent.id, status: "running", startedAt: Date.now(), log: [], resumes: options.resume?.id, continued: options.continued };
		this.snapshot = { ...this.snapshot, runs: [run, ...this.snapshot.runs] };
		// A pull request's fix run shows on its Review card: that's the stage it answers.
		const shownStage = item.kind === "pull" && input.stage === "fix" ? "review" : input.stage;
		this.setStage(item.id, shownStage, { ...item.stages[shownStage], status: "running", agentId: shownStage === input.stage ? agent.id : item.stages[shownStage].agentId, runId: run.id, startedAt: run.startedAt, finishedAt: undefined });
		// What Factory itself says to carry a run on is its note, not something you said.
		if (options.message) this.log(run.id, { at: Date.now(), kind: options.continued ? "info" : "you", text: options.message });
		// The notes it reads, by the labels its report will use to say how they held up.
		const notes = notesForPrompt(this.snapshot.notes[item.repo] ?? [], this.snapshot.notes[COMPUTER] ?? []);
		this.patchRun(run.id, (current) => ({ ...current, noteRefs: noteRefs(notes) }));
		if (this.demo) return run;

		try {
			const checkout = this.repoPath(item.repo);
			this.log(run.id, { at: Date.now(), kind: "info", text: `Preparing a worktree from ${item.repo}` });
			const { dir, branch, note } = await prepareWorktree(this.worktreeRoot, checkout, item);
			if (this.stopped(run.id)) return run;
			if (note) this.log(run.id, { at: Date.now(), kind: "info", text: note });
			const proof = await prepareProof(dir, run.id);
			const inputs = await this.copyInputs(item, dir);
			const head = item.kind === "pull" ? await git(dir, ["rev-parse", "HEAD"]).catch(() => undefined) : undefined;
			this.patchRun(run.id, (current) => ({ ...current, worktree: dir, branch, head }));
			if (item.kind === "issue") this.patchItem(item.id, (current) => ({ ...current, branch }));
			this.log(run.id, { at: Date.now(), kind: "info", text: `Worktree ready at ${branch}` });
			// Which model and effort ran, in the log itself: settings change.
			this.log(run.id, { at: Date.now(), kind: "info", text: `Running ${agent.label}${agent.model ? ` (${agent.model})` : ""}${agent.accountName ? ` on ${agent.accountName}` : ""}${agent.effort ? ` at ${agent.effort} effort` : agent.defaultEffort ? ` at its default effort (${agent.defaultEffort})` : ""}` });
			const playbook = this.snapshot.settings.playbooks[item.kind];
			// Once Factory has asked the reporter, every try after that reads what they said.
			const replies = item.asked && ASKS_REPORTER.includes(input.stage) ? await commentsSince(item.repo, item.number, item.asked.firstAt).catch(() => []) : [];
			// Triage judges whether the issue repeats one of the issues that read most like it.
			const similar = input.stage === "triage" ? similarIssues(item, this.snapshot.items, 8, TRIAGE_THRESHOLD) : [];
			const similarBodies = new Map(similar.map((entry) => [entry.id, this.itemBody(entry.id)]));

			const changedBefore = await changedFiles(dir);
			// Preparing takes a while; Stop may have been pressed meanwhile. Then no agent starts.
			if (this.stopped(run.id)) return run;
			// A reply carries on the same thread, when it's the same agent's and the thread is still there; otherwise it starts
			// a new thread, which needs the whole brief with the reply as a note.
			const resumeId = options.message && options.resume?.agentId === agent.id ? options.resume.sessionId : undefined;
			const resume = resumeId && (this.deps.threads.canResume?.(resumeId, agent) ?? true) ? resumeId : undefined;
			const prompt = resume && options.message
				? replyPrompt(options.message, input.stage, proof)
				: [stagePrompt(item, input.stage, playbook, { proofDir: proof, brief: options.brief, fixes: item.kind === "pull" ? linkedItem(item, this.snapshot.items) : undefined, inputs, replies, notes, similar, similarBodies, uncommitted: changedBefore, pulls: pullsFor(item, this.snapshot.items) }), ...(options.message ? ["", `A note from the person running this: ${options.message}`] : [])].join("\n");
			const session = await this.deps.threads.start({
				item: this.item(item.id), runId: run.id, agent, stage: input.stage, workspace: { dir, branch, clone: checkout }, proof, prompt,
				resume,
				changedBefore,
				handlers: {
					log: (line) => this.log(run.id, line),
					session: (threadId) => this.patchRun(run.id, (current) => ({ ...current, sessionId: threadId, threadId })),
					progress: () => this.movedAt.set(run.id, Date.now()),
					finish: (result) => this.finishRun(run.id, result),
				},
			});
			// Stopped while its thread was being made: it ends now.
			if (this.stopped(run.id)) session.stop();
			else this.sessions.set(run.id, session);
		} catch (error) {
			this.finishRun(run.id, { status: "failed", summary: error instanceof Error ? error.message : String(error) });
		}
		return run;
	}

	/**
	 * A stage that couldn't start waits its turn only when every slot is busy; then it starts as one frees up.
	 * Anything else (no clone, no agent) won't fix itself, so the stage says why and Autopilot ends.
	 */
	private queueOrFail(itemId: string, stage: StageId, agentId: string, error: unknown) {
		if (/slots are busy|still running in this worktree/.test(message(error))) return this.setStage(itemId, stage, { status: "queued", agentId });
		const why = `Couldn't start: ${message(error)}`;
		const current = this.snapshot.items.find((candidate) => candidate.id === itemId);
		if (!current) return;
		this.setStage(itemId, stage, { ...current.stages[stage], status: "failed", agentId, summary: why });
		this.endAutopilot(itemId, undefined, why);
	}

	/**
	 * The run already working in the worktree this item's would use, if one is. An item's stages share one, and so
	 * do an issue and the pull request Factory opened for it (on the same branch): two agents there would edit,
	 * test and commit each other's unfinished work.
	 */
	private worktreeBusy(item: WorkItem): Run | undefined {
		const items = this.snapshot.items;
		const sharing = (other: WorkItem | undefined) => !!other && (other.id === item.id || linkedItem(item, items)?.id === other.id || linkedItem(other, items)?.id === item.id || (!!item.branch && other.branch === item.branch));
		return this.snapshot.runs.find((run) => run.status === "running" && sharing(items.find((candidate) => candidate.id === run.itemId)));
	}

	/** The run was stopped or ended while it was being prepared. */
	private stopped(runId: string): boolean {
		return this.snapshot.runs.find((candidate) => candidate.id === runId)?.status !== "running";
	}

	/** Steer the agent that's working, or reply to the last run so it carries on where it stopped. */
	async sendMessage(itemId: string, text: string): Promise<void> {
		const message = text.trim();
		if (!message) return;
		const item = this.item(itemId);
		const runs = this.snapshot.runs.filter((run) => run.itemId === itemId);
		const running = runs.find((run) => run.status === "running");
		if (running) {
			this.log(running.id, { at: Date.now(), kind: "you", text: message });
			if (this.demo || this.sessions.get(running.id)?.send(message)) return;
			this.patchRun(running.id, (current) => ({ ...current, pending: [...(current.pending ?? []), message] }));
			this.log(running.id, { at: Date.now(), kind: "info", text: "The agent takes this as soon as its current turn ends" });
			return;
		}
		const previous = runs.sort((a, b) => b.startedAt - a.startedAt)[0];
		const stage = previous?.stage ?? stagesFor(item)[0].id;
		const agentId = previous?.agentId ?? agentForStage(item, stage, this.snapshot.settings.playbooks[item.kind]);
		if (!agentId) throw new Error("Assign an agent first");
		await this.launch({ itemId, stage, agentId }, { resume: previous, message });
	}

	private finishRun(runId: string, ended: { status: Run["status"]; summary?: string; usage?: Run["usage"]; report?: RunReport; crashed?: boolean }) {
		// Quitting stops the threads; their runs were already saved as interrupted, to carry on at the next start.
		if (this.closing) return;
		this.sessions.delete(runId);
		this.movedAt.delete(runId);
		const stopped = this.stopping.delete(runId);
		const stall = this.stalled.get(runId);
		this.stalled.delete(runId);
		// Stopped by Factory for stalling: it failed, so the stage asks a person, rather than reading as stopped by you.
		const result = stall && stopped ? { ...ended, status: "failed" as const, summary: stall, crashed: false } : stopped ? { ...ended, status: "cancelled" as const, summary: "Stopped" } : ended;
		const run = this.snapshot.runs.find((candidate) => candidate.id === runId);
		if (!run || run.status !== "running") return;
		// The agent's process died without a report: carry the work on after a pause, rather than fail the stage.
		if (result.status === "failed" && result.crashed && !stopped && !this.demo) {
			const tries = (run.continued ?? 0) + 1;
			this.patchRun(runId, (current) => ({ ...current, status: "failed", interrupted: "crash", summary: result.summary, usage: result.usage ?? current.usage, finishedAt: Date.now(), pending: undefined }));
			if (tries <= AUTO_CONTINUE) {
				const pause = CRASH_PAUSE[Math.min(tries, CRASH_PAUSE.length) - 1]!;
				this.log(runId, { at: Date.now(), kind: "info", text: `It stopped unexpectedly. Factory carries it on in ${Math.round(pause / 1000)} seconds` });
				const why = (result.summary ?? "no reason given").slice(0, 200);
				// Kept so Stop can call it off, and so quitting leaves it to be carried on at the next start.
				this.carryTimers.set(runId, setTimeout(() => {
					this.carryTimers.delete(runId);
					const latest = this.snapshot.runs.find((candidate) => candidate.id === runId);
					// Someone started it again, or took over, in the meantime.
					if (!latest || latest.carriedOnAt || this.snapshot.runs.some((other) => other.resumes === runId || (other.itemId === run.itemId && other.status === "running"))) return;
					void this.carryOnRun(latest, CONTINUE_AFTER_CRASH(why));
				}, pause));
				return;
			}
			void this.carryOnRun({ ...run, continued: run.continued ?? 0 }, "");
			return;
		}
		this.patchRun(runId, (current) => ({ ...current, status: result.status, summary: result.summary, report: result.report ?? current.report, usage: result.usage ?? current.usage, finishedAt: Date.now(), pending: undefined }));
		const item = this.snapshot.items.find((candidate) => candidate.id === run.itemId);
		// Its repository was removed while it ran: the run is recorded, and there's nothing more to move along.
		if (!item) return;
		const playbook = this.snapshot.settings.playbooks[item.kind];

		// Messages that came in while Codex was mid-turn go in now, on the same session.
		if (result.status === "succeeded" && run.pending?.length && run.sessionId) {
			void this.launch({ itemId: run.itemId, stage: run.stage, agentId: run.agentId }, { resume: { ...run, status: "succeeded" }, message: run.pending.join("\n\n") }).catch(() => undefined);
			return;
		}

		const outcome = result.status === "succeeded"
			? (result.report ? stageOutcome(run.stage, result.report, playbook.requireProof) : { status: "done" as const, summary: result.summary })
			: { status: result.status === "cancelled" ? ("idle" as const) : ("failed" as const), summary: result.summary };

		const settle = (stage: { status: StageStatus; summary?: string }) => this.patchRun(runId, (current) => ({ ...current, outcome: runOutcome(current, result.report, stage) }));
		this.rememberNotes(run, result.report);

		if (item.kind === "pull" && run.stage === "fix") {
			this.setStage(item.id, "review", { ...item.stages.review, status: outcome.status === "done" ? "idle" : outcome.status === "idle" ? "needs-you" : outcome.status, runId, summary: outcome.status === "done" ? "Fixes pushed. Run Review again to check them." : outcome.summary, finishedAt: Date.now() });
			settle(outcome);
			// Whoever fixed the findings wrote code on this branch, so the next review goes to someone else.
			if (outcome.status === "done") this.setStage(item.id, "fix", { status: "done", agentId: run.agentId, runId, finishedAt: Date.now() });
			if (outcome.status === "done") void this.pushRevision(item.id).catch((error: unknown) => this.setStage(item.id, "review", { ...this.item(item.id).stages.review, status: "failed", summary: `Couldn't push the fixes: ${error instanceof Error ? error.message : String(error)}` }));
			this.drainQueue();
			return;
		}

		// Missing something only the reporter knows: ask them and wait, a couple of times at most.
		if (item.kind === "issue" && result.status === "succeeded" && outcome.status !== "done" && playbook.askReporter && asksReporter(run.stage, result.report) && (item.asked?.rounds ?? 0) < ASK_ROUNDS && !this.demo) {
			settle({ status: "waiting", summary: "Needs details only the reporter has" });
			this.endAutopilot(item.id, run.id, "it's waiting on the reporter");
			void this.askReporter(item.id, runId);
			this.drainQueue();
			return;
		}

		this.setStage(run.itemId, run.stage, { status: outcome.status, agentId: run.agentId, runId, summary: outcome.summary, startedAt: run.startedAt, finishedAt: Date.now(), head: this.snapshot.runs.find((candidate) => candidate.id === runId)?.head });
		settle(outcome);
		if (run.stage === "triage" && result.status === "succeeded") this.patchItem(run.itemId, (current) => ({ ...current, duplicateOf: result.report?.duplicateOf }));
		// The pull request Fix found becomes the issue's, so the issue sends you there.
		const fixedBy = run.stage === "fix" ? result.report?.fixedBy : undefined;
		if (fixedBy && this.snapshot.items.some((candidate) => candidate.repo === item.repo && candidate.number === fixedBy && candidate.kind === "pull")) this.patchItem(run.itemId, (current) => ({ ...current, linked: current.linked ?? fixedBy }));
		const after = this.item(run.itemId);
		if (result.status === "succeeded" && result.report && playbook.postReports && run.stage !== "reproduce" && run.stage !== "fix" && !this.demo) void this.postReport(after.id, run.id).catch(() => undefined);
		if (after.autopilot) {
			if (outcome.status === "done") void this.carryOn(after.id).catch((error: unknown) => this.endAutopilot(after.id, runId, `couldn't start the next stage: ${message(error)}`));
			else this.endAutopilot(after.id, run.id, result.status === "cancelled" ? "the run was stopped" : `${stageLabel(run.stage)} needs you`);
		} else if (outcome.status === "done" && after.kind === "issue" && run.stage === "fix" && playbook.openPullRequest && !after.linked) void this.openPullRequest(after.id).catch((error: unknown) => this.log(run.id, { at: Date.now(), kind: "error", text: `Couldn't open the pull request: ${error instanceof Error ? error.message : String(error)}` }));
		// A review with findings, or a failed verify, means the fix that came before was wrong.
		if (after.kind === "pull" && (run.stage === "review" || run.stage === "verify") && result.status === "succeeded" && result.report && !verdictPassed(run.stage, result.report.verdict)) this.markFlawed(after.id, `${stageLabel(run.stage)} found problems: ${result.report.summary ?? result.report.verdict}`);
		this.drainQueue();
	}

	/** The fix behind a pull request turned out wrong: its run is counted as flawed rather than a success. */
	private markFlawed(pullId: string, why: string) {
		const pull = this.snapshot.items.find((candidate) => candidate.id === pullId);
		if (!pull) return;
		const fixOf = (itemId: string | undefined) => this.snapshot.runs.find((run) => run.itemId === itemId && run.stage === "fix" && run.status === "succeeded");
		const fix = fixOf(pull.id) ?? fixOf(linkedItem(pull, this.snapshot.items)?.id);
		if (fix && (!fix.outcome || fix.outcome.kind === "success")) this.patchRun(fix.id, (current) => ({ ...current, outcome: { kind: "flawed", why } }));
	}

	/** What a run said about its notes, and what it learnt, goes into the repository's and this computer's notes. */
	private rememberNotes(run: Run, report: RunReport | undefined) {
		const item = this.snapshot.items.find((candidate) => candidate.id === run.itemId);
		if (!item || (!report?.remember?.length && !report?.noteChecks?.length)) return;
		const result = applyNoteReport({ repo: this.snapshot.notes[item.repo] ?? [], computer: this.snapshot.notes[COMPUTER] ?? [] }, report, run, Date.now());
		this.snapshot = { ...this.snapshot, notes: { ...this.snapshot.notes, [item.repo]: result.repo, [COMPUTER]: result.computer } };
		this.changed();
		if (result.changes.length) this.log(run.id, { at: Date.now(), kind: "result", text: `Notes: ${result.changes.join(", ")}` });
	}

	private setNotes(repo: string, notes: RepoNote[]) {
		this.snapshot = { ...this.snapshot, notes: { ...this.snapshot.notes, [repo]: notes.slice(0, MAX_NOTES) } };
		this.changed();
	}

	addNote(repo: string, text: string) {
		const note = text.trim();
		// Notes people write are pinned: they know them to be true.
		if (note) this.setNotes(repo, [{ id: `note-${Date.now().toString(36)}`, text: note, at: Date.now(), pinned: true }, ...(this.snapshot.notes[repo] ?? [])]);
	}

	removeNote(repo: string, noteId: string) {
		this.setNotes(repo, (this.snapshot.notes[repo] ?? []).filter((note) => note.id !== noteId));
	}

	updateNote(repo: string, noteId: string, patch: NotePatch) {
		const found = (this.snapshot.notes[repo] ?? []).find((note) => note.id === noteId);
		if (!found) return;
		// Moving between a repository and this computer keeps everything else about the note.
		if (patch.moveTo && patch.moveTo !== repo) {
			this.setNotes(repo, (this.snapshot.notes[repo] ?? []).filter((note) => note.id !== noteId));
			this.setNotes(patch.moveTo, [found, ...(this.snapshot.notes[patch.moveTo] ?? [])]);
			return;
		}
		this.setNotes(repo, (this.snapshot.notes[repo] ?? []).map((note) => {
			if (note.id !== noteId) return note;
			const text = (patch.acceptProposed ? note.flagged?.proposed : patch.text)?.trim();
			return {
				...note,
				...(text && text !== note.text ? { text, previous: note.text, updatedAt: Date.now(), confirmations: 0, confirmedAt: undefined, ...(patch.acceptProposed ? { runId: note.flagged?.runId, agentId: note.flagged?.agentId, stage: note.flagged?.stage } : { runId: undefined, agentId: undefined, stage: undefined }) } : {}),
				...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
				// Keeping a flagged note, or taking its correction, is a person vouching for it.
				...(patch.flagged === false || patch.acceptProposed ? { flagged: undefined, confirmedAt: Date.now() } : {}),
			};
		}));
	}

	/** The comments on an item, read from GitHub when it's opened: too many to keep for every item. */
	async itemComments(itemId: string): Promise<IssueComment[]> {
		const item = this.snapshot.items.find((candidate) => candidate.id === itemId);
		if (!item || this.demo) return [];
		return allComments(item.repo, item.number);
	}

	/** Issues that read like this one. Only open issues and the ones Factory worked on are on this computer. */
	similarItems(itemId: string): SimilarItem[] {
		const item = this.snapshot.items.find((candidate) => candidate.id === itemId);
		return item?.kind === "issue" ? similarIssues(item, this.snapshot.items) : [];
	}

	cancelRun(runId: string) {
		// Waiting to carry on after the agent crashed: Stop calls that off.
		const timer = this.carryTimers.get(runId);
		if (timer) {
			clearTimeout(timer);
			this.carryTimers.delete(runId);
			const run = this.snapshot.runs.find((candidate) => candidate.id === runId);
			const item = run && this.snapshot.items.find((candidate) => candidate.id === run.itemId);
			this.patchRun(runId, (current) => ({ ...current, carriedOnAt: Date.now() }));
			this.log(runId, { at: Date.now(), kind: "info", text: "Stopped: it won't be carried on" });
			if (run && item) {
				const shown = item.kind === "pull" && run.stage === "fix" ? "review" : run.stage;
				this.setStage(item.id, shown, { ...item.stages[shown], status: "idle", runId, summary: "Stopped" });
				this.endAutopilot(item.id, runId, "the run was stopped");
			}
			return;
		}
		// taskkill /F ends the agent with exit code 1, not a signal, so remember that this was a stop.
		this.stopping.add(runId);
		const session = this.sessions.get(runId);
		// Its agent ends, even if it hasn't started yet; finishing comes through the agent's own exit.
		if (session) return session.stop();
		// Still preparing, with no agent yet: it's stopped now, and launch won't start one.
		this.finishRun(runId, { status: "cancelled" });
	}

	private setStage(itemId: string, stage: StageId, state: WorkItem["stages"][StageId]) {
		this.patchItem(itemId, (item) => ({ ...item, stages: { ...item.stages, [stage]: state } }));
	}

	/** Pull requests Factory worked on: reads their GitHub checks while they may still change. */
	private async watchChecks(): Promise<void> {
		if (this.demo || this.checking) return;
		if (this.checkTimer) clearTimeout(this.checkTimer);
		this.checkTimer = null;
		const due = this.snapshot.items.filter((item) => item.kind === "pull" && (item.state === "open" || item.state === "draft") && this.overlays[item.id] && (!item.ci || item.ci.state === "pending" || item.ci.checkedAt < item.updatedAt));
		if (!due.length) return;
		this.checking = true;
		try {
			await Promise.all(due.map(async (pull) => {
				const ci = await pullChecks(pull.repo, pull.number).catch(() => null);
				const before = this.snapshot.items.find((candidate) => candidate.id === pull.id)?.ci;
				if (!ci || !this.snapshot.items.some((candidate) => candidate.id === pull.id)) return;
				this.patchItem(pull.id, (current) => ({ ...current, ci }));
				if (ci.state === "failed" && before?.state !== "failed") {
					this.markFlawed(pull.id, `GitHub checks failed: ${ci.failed.map((check) => check.name).join(", ")}`);
					void this.passOnChecks(pull.id, ci.failed);
				}
			}));
		} finally {
			this.checking = false;
		}
		if (this.snapshot.items.some((item) => item.ci?.state === "pending")) this.checkTimer = setTimeout(() => void this.watchChecks(), CI_POLL);
	}

	/** Something was just pushed: its checks start again, so they're read again soon. */
	private checksRestarted(pullId: string) {
		this.patchItem(pullId, (current) => ({ ...current, ci: { state: "pending", failed: [], checkedAt: 0 } }));
		if (this.checkTimer) clearTimeout(this.checkTimer);
		this.checkTimer = setTimeout(() => void this.watchChecks(), CI_POLL);
	}

	/** The buttons in the item view. Each one is something a person decided to do. */
	async act(itemId: string, action: ItemAction): Promise<void> {
		const item = this.item(itemId);
		const playbook = this.snapshot.settings.playbooks[item.kind];
		switch (action.id) {
			case "run": {
				if (!action.stage) return;
				const agentId = action.agentId ?? stageAgent(item, action.stage, this.snapshot);
				if (!agentId) throw new Error("Assign an agent first");
				await this.startRun({ itemId, stage: action.stage, agentId });
				return;
			}
			case "accept": {
				const stage = stagesFor(item).find((definition) => ["needs-you", "failed"].includes(item.stages[definition.id].status));
				if (!stage) return;
				this.setStage(itemId, stage.id, { ...item.stages[stage.id], status: "done", summary: `${item.stages[stage.id].summary ?? ""} Accepted by you.`.trim() });
				const accepted = lastRun(item, stage.id, this.snapshot.runs);
				if (accepted) this.patchRun(accepted.id, (current) => ({ ...current, outcome: { kind: "manual", why: current.outcome?.why ?? item.stages[stage.id].summary } satisfies RunOutcome }));
				if (stage.id === "triage") this.patchItem(itemId, (current) => ({ ...current, duplicateOf: undefined }));
				// Accepting is a go-ahead for the next stage.
				const next = stagesFor(item).find((definition) => definition.after.includes(stage.id));
				const agentId = next && stageAgent(this.item(itemId), next.id, this.snapshot);
				if (next && agentId) await this.startRun({ itemId, stage: next.id, agentId }).catch((error: unknown) => this.queueOrFail(itemId, next.id, agentId, error));
				return;
			}
			case "open-pull":
				return this.openPullRequest(itemId);
			case "autopilot": {
				if (!autopilotFits(item)) throw new Error(item.linked ? "This issue already has a pull request" : "There's nothing left to run");
				this.patchItem(itemId, (current) => ({ ...current, autopilot: { startedAt: Date.now() } }));
				await this.carryOn(itemId).catch((error: unknown) => {
					this.patchItem(itemId, (current) => ({ ...current, autopilot: undefined }));
					throw error;
				});
				return;
			}
			case "stop-autopilot":
				this.patchItem(itemId, (current) => ({ ...current, autopilot: undefined }));
				return;
			case "fix-findings":
				assertCanPush(item);
				return this.fixFindings(itemId, item.stages.verify.status === "failed" ? "verify" : "review", action.agentId);
			case "fix-ci": {
				assertCanPush(item);
				const failed = item.ci?.failed ?? [];
				if (item.kind !== "pull" || !failed.length) throw new Error("No failed checks to fix");
				const agentId = item.stages.fix.agentId ?? agentForStage(item, "fix", playbook);
				if (!agentId) throw new Error("Assign an agent first");
				const logs = this.demo ? [] : await Promise.all(failed.map((check) => failedLog(item.repo, check.link)));
				this.patchItem(itemId, (current) => ({ ...current, revisions: (current.revisions ?? 0) + 1 }));
				await this.launch({ itemId, stage: "fix", agentId }, { brief: ciBrief(failed.map((check, index) => ({ ...check, log: logs[index] }))) });
				return;
			}
			case "fix-conflicts": {
				if (item.kind !== "pull") throw new Error("Only pull requests conflict");
				assertCanPush(item);
				const agentId = item.stages.fix.agentId ?? agentForStage(item, "fix", playbook) ?? item.assigneeId;
				if (!agentId) throw new Error("Assign an agent first");
				const base = this.demo ? "main" : (await mergeState(item.repo, item.number)).base;
				this.patchItem(itemId, (current) => ({ ...current, revisions: (current.revisions ?? 0) + 1 }));
				await this.launch({ itemId, stage: "fix", agentId }, { brief: conflictBrief(base) });
				return;
			}
			case "close-duplicate": {
				const original = lastRun(item, "triage", this.snapshot.runs)?.report?.duplicateOf ?? item.duplicateOf;
				if (!original) throw new Error("Triage didn't name the issue this repeats");
				if (!this.demo) await closeAsDuplicate(item.repo, item.number, original);
				this.remember({ ...(this.cache[item.repo]?.items.find((candidate) => candidate.id === itemId) ?? item), state: "closed" });
				this.patchItem(itemId, (current) => ({ ...current, state: "closed", duplicateOf: original, stages: { ...current.stages, triage: { ...current.stages.triage, status: "done", summary: `Closed as a duplicate of #${original}.` } } }));
				return;
			}
			case "post-report": {
				const stage = [...stagesFor(item)].reverse().find((definition) => lastRun(item, definition.id, this.snapshot.runs)?.report);
				const run = stage && lastRun(item, stage.id, this.snapshot.runs);
				if (run) await this.postReport(itemId, run.id);
				return;
			}
			case "ask-reporter": {
				const stage = stagesFor(item).find((definition) => asksReporter(definition.id, lastRun(item, definition.id, this.snapshot.runs)?.report));
				const run = stage && lastRun(item, stage.id, this.snapshot.runs);
				if (!run) throw new Error("There's nothing to ask the reporter");
				await this.askReporter(itemId, run.id);
				return;
			}
			case "stop-waiting": {
				const stage = stagesFor(item).find((definition) => item.stages[definition.id].status === "waiting");
				if (stage) this.setStage(itemId, stage.id, { ...item.stages[stage.id], status: "needs-you", summary: "Stopped waiting for the reporter." });
				return;
			}
			case "mark-ready":
				return this.changeOnGithub(itemId, { kind: "draft", draft: false });
			case "merge": {
				// The way GitHub would offer this person first.
				const method = this.demo ? "squash" : (await mergeState(item.repo, item.number)).preferred;
				return this.changeOnGithub(itemId, { kind: "merge", method });
			}
			default:
				return;
		}
	}

	/**
	 * Does something to an issue or pull request on GitHub, as the person `gh` is signed in as, then shows it
	 * here at once rather than at the next check. A merge or close also checks the repository again soon,
	 * since GitHub may close the issue a pull request fixes.
	 */
	async changeOnGithub(itemId: string, change: GithubChange): Promise<void> {
		const item = this.item(itemId);
		const { repo, kind, number } = item;
		const pullOnly = change.kind === "merge" || change.kind === "review" || change.kind === "draft" || change.kind === "reviewers" || change.kind === "update-branch" || change.kind === "rerun-checks" || change.kind === "line-comment" || change.kind === "reply" || change.kind === "resolve";
		if ((change.kind === "line-comment" || change.kind === "reply") && !change.body.trim()) throw new Error("Write a comment first");
		if (pullOnly && kind !== "pull") throw new Error("Only pull requests can do that");
		// What goes on the conversation as a comment, alongside a close or reopen.
		const said = change.kind === "comment" || change.kind === "close" || change.kind === "reopen" ? change.body?.trim() || undefined : undefined;
		const images = change.kind === "comment" || change.kind === "close" || change.kind === "reopen" ? change.images ?? [] : [];
		if (change.kind === "comment" && !said && !images.length) throw new Error("Write a comment first");
		images.forEach((image, index) => {
			const problem = imageProblem({ type: image.type, size: image.data.byteLength }, index);
			if (problem) throw new Error(problem);
		});
		if (images.length && !this.demo && !this.snapshot.github.attach) throw new Error(`Images in comments need GitHub CLI 2.99 or later${this.snapshot.github.version ? `; you have ${this.snapshot.github.version}` : ""}. Update it with winget upgrade GitHub.cli.`);
		if (change.kind === "edit-comment" && !change.body.trim()) throw new Error("A comment can't be empty: delete it instead");
		if (change.kind === "edit" && change.title !== undefined && !change.title.trim()) throw new Error("Give it a title");
		if (!this.demo) {
			// Images go up with their comment through gh --attach; a close or reopen then goes on its own.
			const posted = images.length > 0;
			if (posted) await this.commentWithImages(item, said, images);
			switch (change.kind) {
				case "comment": if (!posted) await comment(repo, kind, number, said!); break;
				case "close": await closeItem(repo, kind, number, change.reason, posted ? undefined : said); break;
				case "reopen": await reopenItem(repo, kind, number, posted ? undefined : said); break;
				case "merge": await mergePull(repo, number, change.method); break;
				case "review": await reviewPull(repo, number, change.verdict, change.body); break;
				case "draft": await (change.draft ? markDraft(repo, number) : markReady(repo, number)); break;
				case "edit": await editItem(repo, kind, number, { title: change.title?.trim(), body: change.body }); break;
				case "edit-comment": await editComment(repo, change.commentId, !!change.inline, change.body); break;
				case "delete-comment": await deleteComment(repo, change.commentId, !!change.inline); break;
				case "labels": await editPeopleOrLabels(repo, kind, number, "label", change.add, change.remove); break;
				case "assignees": await editPeopleOrLabels(repo, kind, number, "assignee", change.add, change.remove); break;
				case "reviewers": await editPeopleOrLabels(repo, kind, number, "reviewer", change.add, change.remove); break;
				case "update-branch": await updateBranch(repo, number, !!change.rebase); break;
				case "rerun-checks": await rerunFailed(repo, change.links ?? (item.ci?.failed ?? []).map((check) => check.link)); break;
				// The comment goes on the commit the diff was read from, so it lands on the line that was shown.
				case "line-comment": await lineComment(repo, number, { ...change, commit: change.commit ?? (await pullFiles(repo, number)).head }); break;
				case "reply": await replyToThread(repo, number, change.commentId, change.body); break;
				case "resolve": await resolveThread(change.threadId, change.resolved); break;
			}
		}
		const state: WorkItem["state"] = change.kind === "close" ? "closed"
			: change.kind === "merge" ? "merged"
			: change.kind === "reopen" ? (kind === "pull" && item.state === "draft" ? "draft" : "open")
			: change.kind === "draft" ? (change.draft ? "draft" : "open")
			: item.state;
		const at = Date.now();
		const edit = (names: string[], add: string[], remove: string[]) => [...names.filter((name) => !remove.includes(name)), ...add.filter((name) => !names.includes(name))];
		const update = (current: WorkItem): WorkItem => {
			const next: WorkItem = { ...current, state, comments: current.comments + (said || images.length ? 1 : 0) - (change.kind === "delete-comment" && !change.inline ? 1 : 0), updatedAt: at };
			if (change.kind === "edit") Object.assign(next, change.title?.trim() ? { title: change.title.trim() } : {}, change.body !== undefined ? { body: change.body } : {});
			if (change.kind === "labels") next.labels = edit(current.labels, change.add, change.remove);
			if (change.kind === "assignees") next.assignees = edit((current.assignees ?? []).map((person) => person.login), change.add, change.remove).map((login) => current.assignees?.find((person) => person.login === login) ?? { login });
			if (change.kind === "reviewers") next.reviewers = edit((current.reviewers ?? []).map((person) => person.login), change.add, change.remove).map((login) => current.reviewers?.find((person) => person.login === login) ?? { login, state: "requested" as const });
			// Checks start again: shown as running until the next read says otherwise.
			if (change.kind === "rerun-checks" && current.ci) next.ci = { ...current.ci, state: "pending", failed: [], checkedAt: at };
			return next;
		};
		this.remember(update(this.cache[repo]?.items.find((candidate) => candidate.id === itemId) ?? item));
		this.patchItem(itemId, update);
		if (this.demo) return;
		// GitHub's own answer replaces the guess above in a moment: colours, photos, a merged issue closing.
		const fixes = change.kind === "merge" && item.linked ? [item.linked] : [];
		setTimeout(() => void this.reread(repo, [number, ...fixes]), 2_500);
		if (change.kind === "merge" || change.kind === "close" || change.kind === "reopen") setTimeout(() => void this.sync(repo).then(() => this.rebuildItems()).catch(() => undefined), 10_000);
		if (change.kind === "rerun-checks" || change.kind === "update-branch") setTimeout(() => void this.watchChecks(), 15_000);
	}

	/** A comment with pasted images: each is saved for gh to upload, and shows where the comment puts it. */
	private async commentWithImages(item: WorkItem, body: string | undefined, images: ImageUpload[]): Promise<void> {
		const dir = await mkdtemp(path.join(os.tmpdir(), "phaseo-factory-images-"));
		try {
			const files = attachmentsFor(images).map((file) => path.join(dir, file.name));
			await Promise.all(files.map((file, index) => writeFile(file, images[index]!.data)));
			const refs = files.map((file) => attachRef(file));
			const text = [body, ...refs.map((ref, index) => `![${path.basename(files[index]!)}](${ref})`)].filter(Boolean).join("\n\n");
			await comment(item.repo, item.kind, item.number, text, refs);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}

	async repoLabels(itemId: string): Promise<RepoLabel[]> {
		const item = this.item(itemId);
		if (this.demo) return [{ name: "bug", color: "d73a4a" }, { name: "enhancement", color: "a2eeef" }, { name: "documentation", color: "0075ca" }];
		return repoLabels(item.repo);
	}

	async assignable(itemId: string, query: string): Promise<Mentionable[]> {
		const item = this.item(itemId);
		if (this.demo || !/^[\w-]{0,39}$/.test(query.trim())) return [];
		return assignable(item.repo, query.trim());
	}

	async checkLog(itemId: string, link: string): Promise<string | null> {
		const item = this.item(itemId);
		if (this.demo) return null;
		return (await failedLog(item.repo, link)) ?? null;
	}

	async pullFiles(itemId: string): Promise<PullFiles> {
		const item = this.item(itemId);
		if (item.kind !== "pull") throw new Error("Only pull requests change files");
		if (this.demo) return { head: "demo", files: [], threads: [] };
		return pullFiles(item.repo, item.number);
	}

	async itemChecks(itemId: string): Promise<CheckRun[]> {
		const item = this.item(itemId);
		if (this.demo || item.kind !== "pull") return [];
		return allChecks(item.repo, item.number);
	}

	/** Reads some items again straight from GitHub, keeping closed ones only if Factory worked on them, as a sync does. */
	private async reread(repo: string, numbers: number[]) {
		const read = await Promise.all(numbers.map((number) => readItem(repo, number).catch(() => null)));
		const cached = this.cache[repo];
		if (!cached) return;
		const byId = new Map(cached.items.map((item) => [item.id, item]));
		for (const item of read) {
			if (!item) continue;
			if (item.state === "open" || item.state === "draft" || this.overlays[item.id]) byId.set(item.id, item);
			else byId.delete(item.id);
		}
		this.cache[repo] = { ...cached, items: [...byId.values()] };
		this.cacheChanged = true;
		this.rebuildItems();
	}

	private mentionCache = new Map<string, { at: number; people: Promise<Mentionable[]> }>();

	/** Who GitHub lets you @mention in the item's repository, matching what's been typed. Kept a few minutes per repository and query. */
	async mentions(itemId: string, query: string): Promise<Mentionable[]> {
		const item = this.item(itemId);
		const typed = query.trim().toLowerCase();
		if (this.demo || !/^[\w-]{0,39}$/.test(typed)) return [];
		const key = `${item.repo}\n${typed}`;
		const cached = this.mentionCache.get(key);
		const entry = cached && Date.now() - cached.at < 5 * 60_000 ? cached : { at: Date.now(), people: mentionable(item.repo, typed) };
		this.mentionCache.set(key, entry);
		return entry.people.catch(() => {
			this.mentionCache.delete(key);
			return [];
		});
	}

	async itemTimeline(itemId: string): Promise<TimelineEntry[]> {
		const item = this.snapshot.items.find((candidate) => candidate.id === itemId);
		if (!item || this.demo) return [];
		return itemTimeline(item.repo, item.kind, item.number);
	}

	async mergeState(itemId: string): Promise<MergeState> {
		const item = this.item(itemId);
		if (item.kind !== "pull") throw new Error("Only pull requests merge");
		if (this.demo) return { methods: ["squash", "merge", "rebase"], preferred: "squash", blocker: item.state === "draft" ? "It's a draft: mark it ready first" : undefined, checking: false, unstable: item.ci?.state === "failed", deletesBranch: true, base: "main", conflicts: false, behind: false };
		return mergeState(item.repo, item.number);
	}

	/** An issue written here goes on GitHub first, so it's tracked like any other, then runs as far as asked. */
	async createIssue(input: NewIssueInput): Promise<string> {
		const title = input.title.trim();
		const repo = this.snapshot.settings.repos.find((entry) => entry.repo === input.repo)?.repo;
		if (!title) throw new Error("Give the issue a title");
		if (!repo) throw new Error("Add the repository in Settings → Factory first");
		input.images.forEach((image, index) => {
			const problem = imageProblem({ type: image.type, size: image.data.byteLength }, index);
			if (problem) throw new Error(problem);
		});
		const attachments = attachmentsFor(input.images);
		// Saved before the issue exists, so gh can upload them; they move under the issue's number after.
		const staging = path.join(this.dataDir, "attachments", `new-${Date.now().toString(36)}`);
		if (attachments.length) {
			await mkdir(staging, { recursive: true });
			await Promise.all(attachments.map((file, index) => writeFile(path.join(staging, file.name), input.images[index].data)));
		}
		// With gh 2.99 the images go up with the issue and show in it; older versions leave a note instead.
		const attach = this.snapshot.github.attach && attachments.length > 0;
		const refs = attachments.map((file) => attachRef(path.join(staging, file.name)));
		const body = issueBody(input.body, input.doneWhen, attachments.map((file, index) => ({ name: file.name, ref: attach ? refs[index] : undefined })));
		const labels = input.labels.map((label) => label.trim()).filter(Boolean);
		const number = this.demo ? Math.max(0, ...this.snapshot.items.filter((item) => item.repo === repo).map((item) => item.number)) + 1 : await createIssue({ repo, title, body, labels, attach: attach ? refs : undefined });
		const now = Date.now();
		const issue: WorkItem = {
			id: `${repo}#${number}`, source: "github", repo, number, kind: "issue", state: "open", title, body,
			author: { login: "you" }, labels, url: `https://github.com/${repo}/issues/${number}`,
			createdAt: now, updatedAt: now, comments: 0, priority: "normal", loggedHere: true, stages: emptyStages(),
			attachments: attachments.length ? attachments : undefined,
		};
		if (attachments.length) await rename(staging, this.attachmentDir(issue));
		const agentId = input.agentId ?? agentForStage(issue, "triage", this.snapshot.settings.playbooks.issue) ?? this.snapshot.agents[0]?.id;
		this.remember(issue);
		this.snapshot = { ...this.snapshot, items: [{ ...issue, assigneeId: agentId }, ...this.snapshot.items] };
		this.patchItem(issue.id, (current) => current);
		if (input.mode === "triage" && agentId) await this.startRun({ itemId: issue.id, stage: "triage", agentId }).catch((error: unknown) => this.queueOrFail(issue.id, "triage", agentId, error));
		return issue.id;
	}

	/** Autopilot's next step: the next stage, or the pull request once every stage has passed. */
	private async carryOn(itemId: string): Promise<void> {
		const item = this.item(itemId);
		if (!item.autopilot) return;
		const stage = currentStage(item);
		const last = this.snapshot.runs.find((run) => run.itemId === itemId);
		if (!stage) {
			try {
				await this.openPullRequest(itemId);
				this.endAutopilot(itemId, last?.id);
			} catch (error) {
				this.endAutopilot(itemId, last?.id, `couldn't open the pull request: ${error instanceof Error ? error.message : String(error)}`);
			}
			return;
		}
		const state = item.stages[stage.id];
		if (state.status === "running" || state.status === "queued") return;
		if (state.status !== "idle") return this.endAutopilot(itemId, last?.id, `${stage.label} needs you`);
		const agentId = stageAgent(item, stage.id, this.snapshot);
		if (!agentId) throw new Error("Assign an agent first");
		// With every slot busy, the stage waits its turn like any other.
		await this.startRun({ itemId, stage: stage.id, agentId }).catch((error: unknown) => this.queueOrFail(itemId, stage.id, agentId, error));
	}

	/** Autopilot is done, or stopped: why goes in the last run's log. */
	private endAutopilot(itemId: string, runId: string | undefined, why?: string) {
		if (!this.snapshot.items.find((candidate) => candidate.id === itemId)?.autopilot) return;
		this.patchItem(itemId, (current) => ({ ...current, autopilot: undefined }));
		if (runId) this.log(runId, { at: Date.now(), kind: why ? "info" : "result", text: why ? `Autopilot stopped: ${why}` : "Autopilot finished" });
	}

	/** Pushes an issue's fix branch and opens a draft pull request with the proof; the pull request then gets reviewed. */
	private async openPullRequest(issueId: string): Promise<void> {
		const issue = this.item(issueId);
		if (issue.linked) return;
		const runs = this.snapshot.runs.filter((run) => run.itemId === issueId && run.status === "succeeded").sort((a, b) => a.startedAt - b.startedAt);
		const fix = runs.findLast((run) => run.stage === "fix");
		// Demo runs make no worktree, so they have no branch of their own.
		const branch = fix?.branch ?? issue.branch ?? (this.demo ? `factory/${issue.number}` : undefined);
		if (!branch) throw new Error("Run Fix first");
		const proof = this.proofAttachments(runs);
		const body = pullRequestBody(issue, runs, (agentId) => this.agentOrNull(agentId)?.label ?? agentId, proof.ref);
		const number = this.demo
			? Math.max(...this.snapshot.items.filter((item) => item.repo === issue.repo).map((item) => item.number)) + 1
			: await (async () => {
				if (!fix?.worktree) throw new Error("The fix's worktree is gone");
				await git(fix.worktree, ["push", "--set-upstream", "origin", branch]);
				return (await createPullRequest({ repo: issue.repo, cwd: fix.worktree, branch, title: issue.title, body, attach: proof.files })).number;
			})();

		// The fixer is noted on the pull request, so its review goes to someone else.
		const pull: WorkItem = {
			...issue,
			id: `${issue.repo}#${number}`,
			number,
			kind: "pull",
			state: "draft",
			body,
			url: `https://github.com/${issue.repo}/pull/${number}`,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			comments: 0,
			branch,
			linked: issue.number,
			duplicateOf: undefined,
			asked: undefined,
			autopilot: undefined,
			labels: issue.labels,
			stages: { ...emptyStages(), fix: { status: "done", agentId: issue.stages.fix.agentId } },
		};
		this.remember({ ...pull, stages: emptyStages() });
		this.snapshot = { ...this.snapshot, items: [pull, ...this.snapshot.items] };
		this.patchItem(pull.id, (current) => current);
		this.patchItem(issueId, (current) => ({ ...current, linked: number }));
		const issueThread = this.snapshot.threads[issueId];
		if (issueThread && !this.demo) void this.deps.threads.linkItem?.(issueThread, this.item(issueId)).catch(() => undefined);
		if (fix) this.log(fix.id, { at: Date.now(), kind: "result", text: `Opened draft pull request #${number}` });
		if (!this.demo) this.checksRestarted(pull.id);
	}

	/** Fixes what Review or Verify found, on the pull request's own branch, then reviews again. */
	private async fixFindings(pullId: string, from: "review" | "verify", chosen?: string): Promise<void> {
		const pull = this.item(pullId);
		const report = lastRun(pull, from, this.snapshot.runs)?.report;
		const findings = report?.text ?? report?.summary ?? pull.stages[from].summary;
		if (!findings) throw new Error(`${stageLabel(from)} has no findings to fix`);
		// Whoever wrote the fix answers its review; on someone else's pull request, the item's agent does.
		const agentId = chosen ?? pull.stages.fix.agentId ?? agentForStage(pull, "fix", this.snapshot.settings.playbooks.pull);
		if (!agentId) throw new Error("Assign an agent first");
		this.patchItem(pullId, (current) => ({ ...current, revisions: (current.revisions ?? 0) + 1, stages: { ...current.stages, verify: from === "verify" ? { status: "idle" } : current.stages.verify } }));
		await this.launch({ itemId: pullId, stage: "fix", agentId }, { brief: findingsBrief(findings) });
	}

	/** Pushes a pull request's new commits back to its branch. Reviewing them again is up to you. */
	private async pushRevision(pullId: string): Promise<void> {
		const pull = this.item(pullId);
		const fix = this.snapshot.runs.find((run) => run.itemId === pullId && run.stage === "fix");
		// A fork's branch is pushed to the fork, never to a branch of the same name here.
		if (!this.demo && fix?.worktree && pull.branch) await git(fix.worktree, ["push", pushTarget(pull), `HEAD:${pull.branch}`]);
		this.setStage(pullId, "verify", { status: "idle" });
		if (!this.demo) this.checksRestarted(pullId);
		// Its new head commit, so the next Verify is about the code that's there now.
		if (!this.demo) await this.reread(pull.repo, [pull.number]).catch(() => undefined);
	}

	/** Posts what the stage needs from the reporter on the issue, then waits for them to answer. */
	private async askReporter(itemId: string, runId: string): Promise<void> {
		const item = this.item(itemId);
		const run = this.snapshot.runs.find((candidate) => candidate.id === runId);
		if (!run || !asksReporter(run.stage, run.report)) throw new Error("There's nothing to ask the reporter");
		const rounds = (item.asked?.rounds ?? 0) + 1;
		const base = { agentId: run.agentId, runId, startedAt: run.startedAt, finishedAt: run.finishedAt ?? Date.now() };
		const count = run.report.ask.length;
		this.setStage(itemId, run.stage, { ...base, status: "waiting", summary: "Asking the reporter on GitHub…" });
		const at = Date.now();
		try {
			if (!this.demo) await comment(item.repo, "issue", item.number, reporterComment(run.stage, run.report, rounds));
		} catch (error) {
			this.setStage(itemId, run.stage, { ...base, status: "needs-you", summary: `Couldn't ask the reporter: ${message(error)}` });
			this.log(runId, { at: Date.now(), kind: "error", text: `Couldn't ask the reporter on GitHub: ${message(error)}` });
			return;
		}
		this.patchItem(itemId, (current) => ({ ...current, asked: { stage: run.stage, at, firstAt: current.asked?.firstAt ?? at, rounds } }));
		this.setStage(itemId, run.stage, { ...base, status: "waiting", summary: `Asked the reporter for ${count === 1 ? "one thing" : `${count} things`} on GitHub. ${run.report.summary ?? ""}`.trim() });
		this.log(runId, { at: Date.now(), kind: "result", text: `Asked the reporter on GitHub (${rounds} of ${ASK_ROUNDS})` });
	}

	/** While a stage waits on the reporter: did they comment, or edit the issue, since Factory asked? */
	private async checkForAnswer(before: WorkItem | undefined, after: WorkItem): Promise<void> {
		const overlay = this.overlays[after.id];
		const asked = overlay?.asked;
		if (!asked || overlay.stages?.[asked.stage]?.status !== "waiting") return;
		if (before && before.body !== after.body) {
			this.answers.push({ itemId: after.id, why: "edited the issue" });
			return;
		}
		const replies = await commentsSince(after.repo, after.number, asked.at).catch(() => []);
		const last = replies.at(-1);
		if (last) this.answers.push({ itemId: after.id, why: `@${last.author} replied` });
	}

	/** The reporter answered: the stage that asked is ready to run again, with their reply. */
	private reporterAnswered(itemId: string, why: string) {
		const item = this.snapshot.items.find((candidate) => candidate.id === itemId);
		const stage = item?.asked?.stage;
		if (!item || !stage || item.stages[stage].status !== "waiting") return;
		this.setStage(itemId, stage, { ...item.stages[stage], status: "idle", summary: `${why.charAt(0).toUpperCase()}${why.slice(1)}. Run it again to use their answer.` });
	}

	private async postReport(itemId: string, runId: string): Promise<void> {
		const item = this.item(itemId);
		const run = this.snapshot.runs.find((candidate) => candidate.id === runId);
		if (!run) return;
		const proof = this.proofAttachments([run]);
		if (!this.demo) await comment(item.repo, item.kind, item.number, reportMarkdown(run, this.agentOrNull(run.agentId)?.label ?? run.agentId, proof.ref), proof.files);
		this.patchRun(runId, (current) => ({ ...current, postedAt: Date.now() }));
		this.log(runId, { at: Date.now(), kind: "result", text: `Posted the ${stageLabel(run.stage).toLowerCase()} to GitHub` });
	}


	/**
	 * Runs going: what's new on GitHub on their issue or pull request, and on the pull request that fixes the issue,
	 * goes to the agent. GitHub is only asked when one of them changed since the last read.
	 */
	private async passOnActivity(): Promise<void> {
		if (this.demo) return;
		await Promise.all(this.snapshot.runs.map(async (run) => {
			if (run.status !== "running" || !this.sessions.has(run.id) || this.hearing.has(run.id)) return;
			const item = this.snapshot.items.find((candidate) => candidate.id === run.itemId);
			if (!item) return;
			const items = [item, linkedItem(item, this.snapshot.items)].filter((candidate): candidate is WorkItem => !!candidate);
			if (!items.some((candidate) => candidate.updatedAt > (run.heardAt ?? run.startedAt))) return;
			this.hearing.add(run.id);
			const readAt = Date.now();
			try {
				// Everything since the run started, every time: what it already heard is skipped by id.
				const found = (await Promise.all(items.map((candidate) => activitySince(candidate.repo, candidate.kind, candidate.number, run.startedAt)))).flat();
				this.patchRun(run.id, (current) => ({ ...current, heardAt: readAt }));
				this.passOn(run.id, found);
			} catch {
				// Read again at the next check.
			} finally {
				this.hearing.delete(run.id);
			}
		}));
	}

	/** A pull request's checks just failed: the agent working on it, or on the issue it fixes, hears why. */
	private async passOnChecks(pullId: string, failed: { name: string; link?: string }[]): Promise<void> {
		const pull = this.snapshot.items.find((candidate) => candidate.id === pullId);
		const run = this.snapshot.runs.find((candidate) => {
			if (candidate.status !== "running" || !this.sessions.has(candidate.id)) return false;
			const item = this.snapshot.items.find((entry) => entry.id === candidate.itemId);
			return candidate.itemId === pullId || (!!item && linkedItem(item, this.snapshot.items)?.id === pullId);
		});
		if (!pull || !run) return;
		// The logs of the first few: enough to see what broke without flooding the agent.
		const read = await Promise.all(failed.slice(0, 3).map(async (check) => ({ ...check, log: await failedLog(pull.repo, check.link).catch(() => undefined) })));
		this.passOn(run.id, [checksActivity(pull.head ?? String(pull.updatedAt), [...read, ...failed.slice(3)], Date.now(), pull.number)]);
	}

	/** Hands new activity to a running agent. Comments from people who can't direct agents are held back and noted. */
	private passOn(runId: string, activity: GithubActivity[]) {
		const run = this.snapshot.runs.find((candidate) => candidate.id === runId);
		const session = this.sessions.get(runId);
		if (!run || run.status !== "running" || !session) return;
		const { pass, hold } = sortActivity(activity, run.heard ?? [], this.snapshot.settings.trustedBots ?? TRUSTED_BOTS);
		if (!pass.length && !hold.length) return;
		this.patchRun(runId, (current) => ({ ...current, heard: [...(current.heard ?? []), ...pass.map((entry) => entry.id), ...hold.map((entry) => entry.id)] }));
		const held = heldBackLine(hold);
		if (held) this.log(runId, { at: Date.now(), kind: "info", text: held });
		if (!pass.length) return;
		const from = [...new Set(pass.map((entry) => (entry.kind === "checks" ? "failed checks" : `@${entry.author}`)))].join(", ");
		this.log(runId, { at: Date.now(), kind: "info", text: `Passed on ${pass.length === 1 ? "an update" : `${pass.length} updates`} from GitHub to the agent (${from})` });
		const text = activityMessage(pass);
		if (!session.send(text)) this.patchRun(runId, (current) => ({ ...current, pending: [...(current.pending ?? []), text] }));
	}

	/** Runs that show nothing for a long while: the agent is told first; if still nothing, the run stops and waits for a person. */
	private checkStalls() {
		const now = Date.now();
		for (const run of this.snapshot.runs) {
			const session = this.sessions.get(run.id);
			if (run.status !== "running" || !session || this.stalled.has(run.id)) continue;
			const movedAt = this.movedAt.get(run.id);
			const action = stallAction(run, now, movedAt);
			if (action === "nudge") {
				this.patchRun(run.id, (current) => ({ ...current, nudgedAt: now }));
				this.log(run.id, { at: now, kind: "info", text: `Nothing happened for ${STALL_WAIT}, so Factory told the agent to stop anything that won't finish on its own` });
				session.send(STALL_NUDGE);
			} else if (action === "stop") {
				const why = stallSummary(run, now, movedAt);
				this.stalled.set(run.id, why);
				this.log(run.id, { at: now, kind: "error", text: why });
				this.cancelRun(run.id);
			}
		}
	}

	/** Start queued stages once a slot frees up. */
	private drainQueue() {
		// At startup interrupted runs go first: the queue only fills the slots they leave.
		if (this.starting && !this.demo) return;
		for (const item of this.snapshot.items) {
			const stage = stagesFor(item).find((definition) => item.stages[definition.id].status === "queued");
			const agentId = stage && (item.stages[stage.id].agentId ?? item.assigneeId);
			if (!stage || !agentId || this.worktreeBusy(item)) continue;
			void this.startRun({ itemId: item.id, stage: stage.id, agentId }).catch(() => undefined);
		}
	}

	private schedulePoll() {
		if (this.pollTimer) clearInterval(this.pollTimer);
		if (this.demo) return;
		const minutes = Math.max(1, this.snapshot.settings.pollMinutes || 2);
		this.pollTimer = setInterval(() => void this.refresh().catch(() => undefined), minutes * 60_000);
	}

	private agentOrNull(agentId: string | undefined) {
		return this.snapshot.agents.find((agent) => agent.id === agentId) ?? null;
	}

	/**
	 * The screenshots and recordings runs saved, to go up with gh --attach and show where they're
	 * referenced. Without gh 2.99, or for files GitHub won't take, the Markdown says they're in Factory.
	 */
	private proofAttachments(runs: Run[]): { ref?: ProofRef; files: string[] } {
		if (!this.snapshot.github.attach || this.demo) return { files: [] };
		const found = new Map<string, string>();
		for (const run of runs) {
			for (const file of run.report?.files ?? []) {
				if (!run.worktree || found.size >= MAX_ATTACH || !attachable(file.name, file.bytes)) continue;
				const local = path.join(proofDir(run.worktree, run.id), file.name);
				if (existsSync(local)) found.set(`${run.id}/${file.name}`, attachRef(local));
			}
		}
		return { ref: (runId, name) => found.get(`${runId}/${name}`), files: [...found.values()] };
	}

	private attachmentDir(item: Pick<WorkItem, "repo" | "number">): string {
		return path.join(this.dataDir, "attachments", attachmentKey(item));
	}

	/** Copies the issue's images into the worktree, so agents can open them. A pull request brings its issue's. */
	private async copyInputs(item: WorkItem, worktree: string): Promise<string[]> {
		const issue = item.kind === "pull" ? linkedItem(item, this.snapshot.items) : item;
		const files = issue?.attachments ?? [];
		if (!issue || !files.length) return [];
		const target = path.join(worktree, ...INPUTS_FOLDER.split("/"));
		await mkdir(target, { recursive: true });
		await Promise.all(files.map((file) => copyFile(path.join(this.attachmentDir(issue), file.name), path.join(target, file.name))));
		return files.map((file) => `${INPUTS_FOLDER}/${file.name}`);
	}

	/** An image attached to an issue, for the window. Only names Factory gave out are served. */
	attachmentFile(key: string, name: string): { path: string } | { body: string; type: string } | null {
		if (!isAttachmentName(name)) return null;
		const item = this.snapshot.items.find((candidate) => attachmentKey(candidate) === key && candidate.attachments?.some((file) => file.name === name));
		if (!item) return null;
		return this.demo ? demoAttachment(item.number, name) : { path: path.join(this.attachmentDir(item), name) };
	}

	/** Where a proof file lives on disk, or the demo's drawing of it. Names can't climb out of the run's folder. */
	proofFile(runId: string, name: string): { path: string } | { body: string; type: string } | null {
		if (!/^[\w.-]+$/.test(name) || name.startsWith(".")) return null;
		const run = this.snapshot.runs.find((candidate) => candidate.id === runId);
		if (!run?.report?.files.some((file) => file.name === name)) return null;
		if (this.demo) {
			return demoProof(name);
		}
		return run.worktree ? { path: path.join(proofDir(run.worktree, run.id), name) } : null;
	}

	/** Demo mode: running stages write a line now and then and finish after a while. */
	private tickDemo() {
		const now = Date.now();
		for (const run of this.snapshot.runs) {
			// Seeded runs keep running so screenshots stay stable; only runs started in this session finish.
			if (run.status !== "running" || run.startedAt < this.createdAt) continue;
			const age = now - run.startedAt;
			if (age > 40_000) {
				this.finishRun(run.id, { status: "succeeded", summary: `${STAGES.find((stage) => stage.id === run.stage)?.output ?? "Done"}: done.` });
			} else if (Math.random() < 0.4) {
				this.log(run.id, { at: now, kind: "tool", text: "Read a file" });
			}
		}
	}

	/** Set once the app is closing: finishes from stopped threads mustn't mark runs as stopped by you. */
	private closing = false;

	private changed() {
		this.broadcast(this.snapshot);
		if (this.demo || this.closing) return;
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => void this.save(), 500);
	}

	private savedState(): string {
		const state: SavedState = { settings: this.snapshot.settings, overlays: this.overlays, runs: this.snapshot.runs.slice(0, MAX_SAVED_RUNS), notes: this.snapshot.notes, threads: this.snapshot.threads };
		return JSON.stringify(state);
	}


	/** Ends Factory's work for quitting: runs going are saved as interrupted, so the next start carries them on. */
	async shutdown(): Promise<void> {
		const going = [...this.sessions.keys()];
		if (going.length) this.snapshot = { ...this.snapshot, runs: this.snapshot.runs.map((run) => (going.includes(run.id) && run.status === "running" ? { ...run, status: "cancelled", interrupted: "app", summary: "Phaseo closed while this was running", finishedAt: Date.now() } : run)) };
		// The desktop stops the threads as it closes; their runs are carried on at the next start.
		this.closing = true;
		// Crashed runs waiting to be carried on keep waiting until the next start.
		for (const timer of this.carryTimers.values()) clearTimeout(timer);
		this.carryTimers.clear();
		this.stopTimers();
		this.sessions.clear();
		if (!this.demo) {
			if (this.saveTimer) clearTimeout(this.saveTimer);
			this.cacheChanged = true;
			this.closing = false;
			await this.save();
			this.closing = true;
		}
	}

	private stopTimers() {
		if (this.demoTimer) clearInterval(this.demoTimer);
		if (this.pollTimer) clearInterval(this.pollTimer);
		if (this.checkTimer) clearTimeout(this.checkTimer);
		if (this.stallTimer) clearInterval(this.stallTimer);
	}

	/** Settings, runs and notes, and the item cache when it changed, in one transaction. */
	private save(): Promise<void> {
		this.saveTimer = null;
		try {
			const items = this.cacheChanged ? JSON.stringify({ repos: this.cache }) : undefined;
			this.deps.persistence.write({ state: this.savedState(), ...(items ? { items } : {}) });
			this.cacheChanged = false;
		} catch {
			// The next change saves again.
		}
		return Promise.resolve();
	}

}

/** Where a pull request's branch is pushed: this repository, or the fork it came from. */
export function pushTarget(pull: Pick<WorkItem, "fork">): string {
	return pull.fork ? `https://github.com/${pull.fork.repo}.git` : "origin";
}

/** Fixes on a pull request go to its branch, so it has to be one Factory may push to. */
export function assertCanPush(pull: Pick<WorkItem, "kind" | "fork">) {
	if (pull.kind === "pull" && pull.fork && !pull.fork.canPush) throw new Error(`This pull request comes from ${pull.fork.repo}, which doesn't let maintainers push to it, so Factory couldn't push the fixes. Ask its author to tick "Allow edits by maintainers", or review it instead.`);
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
