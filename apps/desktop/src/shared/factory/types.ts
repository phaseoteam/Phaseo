/** Where a work item came from. GitHub is the only live source for now. */
export type SourceKind = "github" | "linear" | "sentry";

export type WorkKind = "issue" | "pull";

export type WorkState = "open" | "draft" | "merged" | "closed";

/** The stages every work item moves through. Each one is a job an agent can run. */
export type StageId = "triage" | "reproduce" | "fix" | "review" | "verify";

/** `waiting`: Factory asked the reporter on GitHub for something it needs, and runs the stage again when they answer. */
export type StageStatus = "idle" | "queued" | "running" | "done" | "failed" | "needs-you" | "waiting" | "skipped";

import type { Harness } from "../workspace";

export type { Harness };

/** How an agent is paid for: a subscription signed in on this computer, or an API key (Phaseo, Cursor). */
export type Billing = "subscription" | "api";

/**
 * A model on one of the desktop's accounts, as Factory offers it. The id is `<harness>:<account id or "default">:<model>`
 * (see main/factory/agents.ts), so it stays the same across restarts and model discovery.
 */
export interface AgentProfile {
	id: string;
	harness: Harness;
	/** The desktop account it runs on; unset for a harness's own sign-in. */
	accountId?: string;
	/** The account's name, for telling two accounts on one harness apart. */
	accountName?: string;
	/** The model name people recognise, for example "Opus 5.5". */
	label: string;
	/** The model id passed to the harness. */
	model: string;
	billing: Billing;
	/** The harness and account it runs through: `<harness>:<account id or "default">`. */
	connectionId: string;
	/** What the tool says the model is for. */
	description?: string;
	/** Reasoning effort levels the model takes, lowest first, as the tool reports them. */
	efforts?: string[];
	/** The level the tool uses when none is chosen. */
	defaultEffort?: string;
	/** Where the chosen level goes on a thread: `reasoningEffort`, or the id of the model option that takes it. */
	effortSetting?: string;
	/** The level chosen in Settings, passed to the tool on every run. */
	effort?: string;
	/** The model the tool uses when none is named. */
	isDefault?: boolean;
}

export interface StageState {
	status: StageStatus;
	agentId?: string;
	runId?: string;
	/** One line about the outcome, written by the agent. */
	summary?: string;
	startedAt?: number;
	finishedAt?: number;
	/** Pull requests: the commit this result is about. New commits after it make Review and Verify start over. */
	head?: string;
}

export interface Person {
	login: string;
	bot?: boolean;
	/** Agents show their harness mark; people show their GitHub photo, or initials without one. */
	agent?: Harness;
	/** Their GitHub photo, as GitHub gave it. */
	avatar?: string;
}

export interface WorkItem {
	/** `<repo>#<number>`. */
	id: string;
	source: SourceKind;
	repo: string;
	number: number;
	kind: WorkKind;
	state: WorkState;
	title: string;
	/** Empty in the window, which loads it with itemBody when the item is opened: thousands of descriptions are too much to send on every change. */
	body: string;
	author: Person;
	labels: string[];
	/** Each label's colour as GitHub has it, hex without the #. */
	labelColors?: Record<string, string>;
	assignees?: Person[];
	/** Pull requests: who was asked to review, and how those who did left it. */
	reviewers?: Reviewer[];
	/** A pull request from a fork: where its branch is, and whether its author lets maintainers push to it. */
	fork?: { repo: string; canPush: boolean };
	url: string;
	createdAt: number;
	updatedAt: number;
	comments: number;
	/** Pull requests: the head branch. Issues: the branch an agent opened, if any. */
	branch?: string;
	/** Pull requests: the head branch's latest commit. */
	head?: string;
	/** Issues: the pull request that fixes it. Pull requests: the issue it closes. */
	linked?: number;
	/** Pull requests: rounds of fixing review findings so far. */
	revisions?: number;
	/** Default agent for this item's stages. */
	assigneeId?: string;
	/** How hard agents think on this item's runs, when the agent offers it. Unset uses the agent's own setting. */
	effort?: string;
	/** Written in Factory. */
	loggedHere?: boolean;
	/** Issues: the issue Triage says this one repeats. */
	duplicateOf?: number;
	/** Pull requests Factory worked on: their GitHub checks, as last read. */
	ci?: CiStatus;
	/** Set while Factory waits on the reporter: which stage asked, when, and how many times it has asked so far. */
	asked?: { stage: StageId; at: number; firstAt: number; rounds: number };
	/** You set an issue going to a pull request: each stage starts when the one before passes. */
	autopilot?: { startedAt: number };
	/** Images added when the issue was written in Factory. They stay on this computer: GitHub's API can't take uploads. */
	attachments?: Attachment[];
	priority: "urgent" | "high" | "normal" | "low";
	stages: Record<StageId, StageState>;
	/** Pull requests: changed files and lines. */
	diff?: { files: number; additions: number; deletions: number };
	checks?: { passed: number; failed: number; pending: number };
}

/** A pull request's checks on GitHub, summed up. `none`: the branch has no checks to wait for. */
export interface CiStatus {
	state: "pending" | "passed" | "failed" | "none";
	/** The checks that failed, with a link to each. */
	failed: { name: string; link?: string }[];
	checkedAt: number;
}

/** `you` is a message someone sent the agent while steering it. */
export type LogKind = "info" | "tool" | "text" | "error" | "result" | "you";

export interface LogLine {
	at: number;
	kind: LogKind;
	text: string;
}

export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";

export type ProofKind = "image" | "video" | "text" | "file";

/** A file the agent saved as proof: a screenshot, a recording, test output. */
export interface ProofFile {
	name: string;
	kind: ProofKind;
	bytes: number;
	/** The agent's own line about what the file shows. */
	caption?: string;
}

/** A comment on an issue, as Factory reads it back. */
export interface IssueComment {
	author: string;
	body: string;
	at: number;
	/** Posted by Factory, whoever's account it went through. */
	factory?: boolean;
	url?: string;
	/** The author's GitHub photo. */
	avatar?: string;
}

/** How risky a change is to merge, from Review. */
export type RiskLevel = "low" | "medium" | "high";

/** What the agent reported at the end of a run, read from its last message. */
export interface RunReport {
	summary?: string;
	/** For example "Reproduced", "Fixed", "No findings". */
	verdict?: string;
	/** Proof lines that don't name a file: commands run and what they printed. */
	notes: string[];
	files: ProofFile[];
	/** Set when the agent stopped to ask something. */
	question?: string;
	/** What only the reporter can tell us, written to them, for a comment on the issue. */
	ask?: string[];
	/** Review: how risky the change is to merge, and why. */
	risk?: { level: RiskLevel; why?: string };
	/** Triage: the issue this one repeats. */
	duplicateOf?: number;
	/** Fix found an open pull request that already fixes the issue, so it left the code alone. */
	fixedBy?: number;
	/** Things the agent learnt, about the repository or this computer, kept for the next runs. */
	remember?: { scope: NoteScope; text: string; checked?: string }[];
	/** How the notes the run was given held up. */
	noteChecks?: NoteCheck[];
	/** The agent's last message, for the next stage or a GitHub comment. */
	text?: string;
}

/**
 * How a run went, kept so failures can be counted by cause. `blocked`: it couldn't go on without
 * something, such as an answer or proof. `flawed`: it passed, but a later check found it wrong.
 * `manual`: a person passed it by hand.
 */
export type RunOutcomeKind = "success" | "blocked" | "failed" | "flawed" | "manual" | "stopped";

export interface RunOutcome {
	kind: RunOutcomeKind;
	why?: string;
}

export interface Run {
	id: string;
	itemId: string;
	stage: StageId;
	agentId: string;
	status: RunStatus;
	startedAt: number;
	finishedAt?: number;
	/** The worktree the agent works in. */
	worktree?: string;
	branch?: string;
	/** Pull requests: the commit the worktree had when the agent started. */
	head?: string;
	log: LogLine[];
	usage?: { inputTokens: number; outputTokens: number; costUsd?: number };
	summary?: string;
	/** The harness's session, so a reply can carry on the same conversation. */
	sessionId?: string;
	/** The run this one carries on from, when someone replied to it. */
	resumes?: string;
	report?: RunReport;
	/** Messages waiting for the agent's turn to end. Codex can't take them mid-turn. */
	pending?: string[];
	outcome?: RunOutcome;
	/** The notes the run was given, by the label its prompt used (R1, C1…). */
	noteRefs?: Record<string, string>;
	/** When its report went to GitHub as a comment, so it isn't posted twice. */
	postedAt?: number;
	/** It didn't finish: Factory quit or crashed while it ran, or the agent's process died. Factory carries it on. */
	interrupted?: "app" | "crash";
	/** How many times Factory has carried this work on by itself, counting from the run a person started. */
	continued?: number;
	/** When Factory dealt with this run being interrupted, so it's never picked up twice. */
	carriedOnAt?: number;
	/** The run that carried it on, when one did. */
	carriedOnBy?: string;
	/** The desktop thread the stage ran in: a child of the item's thread. */
	threadId?: string;
}

/** A note is about one repository, or about this computer and given to every run. */
export type NoteScope = "repo" | "computer";

/** What a run said about a note it was given: it held, it's wrong, or here's what's true now. */
export interface NoteCheck {
	ref: string;
	verdict: "held" | "wrong" | "now";
	text?: string;
}

/** Something an agent learnt, given to the runs after it. */
export interface RepoNote {
	id: string;
	text: string;
	at: number;
	/** The run that wrote it, or last corrected it. Notes added by hand have none. */
	runId?: string;
	stage?: StageId;
	agentId?: string;
	/** How the agent knew it was true. */
	checked?: string;
	/** How many runs relied on it and said it held, and when the last one did. */
	confirmations?: number;
	confirmedAt?: number;
	/** What the last run that said it held saw. */
	evidence?: string;
	updatedAt?: number;
	/** Always given to runs, however many notes there are. */
	pinned?: boolean;
	/** A run said it's wrong. It stays out of prompts until you keep or remove it. */
	flagged?: { why: string; at: number; runId?: string; agentId?: string; stage?: StageId; proposed?: string };
	/** What it said before a run corrected it. */
	previous?: string;
}

/** An issue that reads like another one, from comparing their words. */
export interface SimilarItem {
	id: string;
	number: number;
	title: string;
	state: WorkState;
	/** 0–1. */
	score: number;
}

/** What a playbook rule looks at. Every condition that is set must hold; an empty match takes everything. */
export interface RuleMatch {
	/** Any of these labels. */
	labels: string[];
	/** Any of these priorities. */
	priorities: WorkItem["priority"][];
	/** Opened by any of these GitHub logins. */
	authors: string[];
	/** Pull requests: changed lines, additions plus deletions. */
	minLines?: number;
	maxLines?: number;
}

/** Changes how a playbook handles the items it matches. The first matching rule wins. */
export interface PlaybookRule {
	id: string;
	name: string;
	match: RuleMatch;
	/** Runs every stage unless a stage has its own agent. */
	agentId?: string;
	stageAgents: Partial<Record<StageId, string>>;
	/** Sent after the playbook's own instructions. */
	instructions: string;
}

/** How Factory handles one kind of work item. Nothing runs until a person starts it. */
export interface Playbook {
	/** Runs an item's stages when nothing more specific names an agent. */
	agentId?: string;
	/** The agent for a stage, whatever the item's own agent is. */
	stageAgents: Partial<Record<StageId, string>>;
	rules: PlaybookRule[];
	/** Sent to the agent ahead of every stage's brief. */
	instructions: string;
	/** Replaces the default brief for a stage. */
	briefs: Partial<Record<StageId, string>>;
	/** A stage that ends without screenshots, recordings or command output waits for a person. */
	requireProof: boolean;
	/** Issues: open a draft pull request as soon as Fix passes, instead of asking. */
	openPullRequest: boolean;
	/** Post each review and verify report as a comment on GitHub, instead of asking. */
	postReports: boolean;
	/** Issues: when Triage or Reproduce is missing something only the reporter knows, ask them on GitHub. */
	askReporter: boolean;
}

/** A clone of a GitHub repository found on this computer. */
export interface LocalClone {
	/** owner/name its origin points at. */
	repo: string;
	path: string;
}

/** A GitHub repository Factory works on. */
export interface RepoSettings {
	/** owner/name. */
	repo: string;
	/** A local checkout. Runs work in worktrees made from it; without one, the repository can be read but not worked on. */
	path: string;
	/** When the repository was added. */
	addedAt: number;
}

/** How far Factory has got reading a repository's open issues and pull requests. */
export interface RepoStatus {
	repo: string;
	/** Set while every open issue and pull request is being read. */
	importing?: { done: number; total: number };
	/** When every open item was last read in full. */
	importedAt?: number;
	/** When changes were last read. */
	syncedAt?: number;
	issues: number;
	pulls: number;
	error?: string;
}

export interface FactorySettings {
	repos: RepoSettings[];
	/** The repository the work list shows. Empty shows all of them. */
	showRepo: string;
	/** Cross-model review: the review stage never uses the agent that wrote the fix. */
	independentReview: boolean;
	playbooks: Record<WorkKind, Playbook>;
	/** How often GitHub is checked for new work. */
	pollMinutes: number;
	/** The reasoning effort chosen for an agent, by agent id. Unset uses the tool's default. */
	agentEfforts: Record<string, string>;
}

export interface FactorySnapshot {
	settings: FactorySettings;
	/** The GitHub CLI on this computer. From 2.99 it can put images on issues, pull requests and comments. */
	/** `login`: who gh is signed in as, so the app knows which pull requests are your own. */
	github: { version: string | null; attach: boolean; login?: string; avatar?: string };
	repos: RepoStatus[];
	items: WorkItem[];
	runs: Run[];
	agents: AgentProfile[];
	/** What agents noted about each repository, newest first. */
	notes: Record<string, RepoNote[]>;
	/** Each item's desktop thread, by item id: stage runs are its child threads. */
	threads: Record<string, string>;
	loadedAt: number;
	error?: string;
	demo: boolean;
}

/** A change sent to the window. Items are left out when only something else changed. */
export type WindowUpdate = Omit<FactorySnapshot, "items"> & { items?: WorkItem[] };

export interface Attachment {
	name: string;
	type: string;
	bytes: number;
}

/** An image on its way from the window to the main process. */
export interface ImageUpload {
	name: string;
	type: string;
	data: Uint8Array;
}

/** An issue someone writes in Factory. It goes on GitHub like any other. */
export interface NewIssueInput {
	repo: string;
	title: string;
	body: string;
	/** What has to be true, and shown, for the issue to count as fixed. */
	doneWhen: string;
	labels: string[];
	/** Screenshots of the problem. Agents get them in their worktree. */
	images: ImageUpload[];
	agentId?: string;
	/** Triage: start Triage straight away. Log: nothing runs. */
	mode: "triage" | "log";
}

export interface StartRunInput {
	itemId: string;
	stage: StageId;
	agentId: string;
}

/** Buttons that move an item along, depending on where it is. */
export type ActionId = "run" | "autopilot" | "stop-autopilot" | "accept" | "close-duplicate" | "fix-ci" | "fix-conflicts" | "open-pull" | "fix-findings" | "post-report" | "ask-reporter" | "stop-waiting" | "mark-ready" | "merge" | "open-on-github" | "go-to";

export interface ItemAction {
	id: ActionId;
	label: string;
	/** Run: the stage to start. */
	stage?: StageId;
	/** Run: a different agent from the one that just failed. */
	agentId?: string;
	/** Go to: the item's id. */
	target?: string;
	/** What happens, shown under the button. */
	detail?: string;
	primary?: boolean;
	/** Changes something on GitHub. */
	external?: boolean;
	/** Asked on the first press; the second press does it. */
	confirm?: string;
}

export type MergeMethod = "squash" | "merge" | "rebase";
export type CloseReason = "completed" | "not planned";
export type ReviewVerdict = "approve" | "request-changes" | "comment";

/** Something done to an issue or pull request on GitHub, from the app. */
export type GithubChange =
	| { kind: "comment"; body: string; images?: ImageUpload[] }
	| { kind: "close"; reason?: CloseReason; body?: string; images?: ImageUpload[] }
	| { kind: "reopen"; body?: string; images?: ImageUpload[] }
	| { kind: "merge"; method: MergeMethod }
	| { kind: "review"; verdict: ReviewVerdict; body: string }
	| { kind: "draft"; draft: boolean }
	| { kind: "edit"; title?: string; body?: string }
	| { kind: "edit-comment"; commentId: number; inline?: boolean; body: string }
	| { kind: "delete-comment"; commentId: number; inline?: boolean }
	| { kind: "labels" | "assignees" | "reviewers"; add: string[]; remove: string[] }
	| { kind: "update-branch"; rebase?: boolean }
	| { kind: "rerun-checks"; links?: string[] }
	| { kind: "line-comment"; path: string; line: number; side: "LEFT" | "RIGHT"; body: string; commit?: string }
	| { kind: "reply"; commentId: number; body: string }
	| { kind: "resolve"; threadId: string; resolved: boolean };

/** A comment as the timeline has it: GitHub's ids, so it can be edited or deleted, and whether you may. */
export interface TimelineComment {
	id: string;
	databaseId?: number;
	author: string;
	avatar?: string;
	body: string;
	at: number;
	url?: string;
	factory?: boolean;
	canEdit?: boolean;
	canDelete?: boolean;
}

export type ReviewState = "approved" | "changes" | "commented" | "dismissed";
export type TimelineEventIcon = "closed" | "skipped" | "reopened" | "merged" | "label" | "person" | "edit" | "reference" | "review" | "ready" | "draft" | "push" | "commit";

/** One thing that happened on an issue or pull request. */
export type TimelineEntry =
	| ({ kind: "comment" } & TimelineComment)
	| ({ kind: "review"; state: ReviewState; comments: (TimelineComment & { path: string; line?: number })[] } & TimelineComment)
	| {
		kind: "event";
		icon: TimelineEventIcon;
		/** What the actor did, starting with the verb: "closed this as completed". */
		text: string;
		at: number;
		actor?: string;
		avatar?: string;
		label?: string;
		/** The issue or pull request it points at. */
		ref?: { repo: string; number: number; title: string; pull: boolean };
		commit?: string;
	};

/** Someone asked to review a pull request, or who has: how they left it. */
export interface Reviewer {
	login: string;
	avatar?: string;
	team?: boolean;
	state: "requested" | ReviewState;
}

export interface RepoLabel {
	name: string;
	/** Hex, without the #. */
	color: string;
	description?: string;
}

/** A file a pull request changes. `patch` is missing when GitHub thinks it too big to show. */
export interface PullFile {
	path: string;
	previous?: string;
	status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
	additions: number;
	deletions: number;
	patch?: string;
}

/** A conversation on a line of code. */
export interface ReviewThread {
	id: string;
	path: string;
	/** Where it sits in the current diff; missing once the code it was on changed. */
	line?: number;
	originalLine?: number;
	side: "LEFT" | "RIGHT";
	resolved: boolean;
	outdated: boolean;
	canResolve: boolean;
	comments: TimelineComment[];
}

export interface PullFiles {
	/** The commit line comments go on. */
	head: string;
	files: PullFile[];
	threads: ReviewThread[];
}

/** One check on a pull request. */
export interface CheckRun {
	name: string;
	workflow?: string;
	description?: string;
	link?: string;
	state: "pass" | "fail" | "pending" | "skipped" | "cancelled";
	seconds?: number;
}

/** Someone who can be @mentioned. */
export interface Mentionable {
	login: string;
	name?: string;
	avatar?: string;
}

/** Whether a pull request can be merged now, and how. */
export interface MergeState {
	/** The methods the repository allows, the usual one first among equals. */
	methods: MergeMethod[];
	/** The one GitHub offers this person first. */
	preferred: MergeMethod;
	/** Why it can't be merged now, if it can't. */
	blocker?: string;
	/** GitHub is still working out whether it conflicts. */
	checking: boolean;
	/** Mergeable, but some checks failed or are still running. */
	unstable: boolean;
	/** The repository deletes the branch once it's merged. */
	deletesBranch: boolean;
	/** The branch it merges into. */
	base: string;
	/** It conflicts with the base branch: an agent has to resolve it. */
	conflicts: boolean;
	/** The base branch has moved on since; GitHub can bring it in itself. */
	behind: boolean;
}

export interface NotePatch { text?: string; pinned?: boolean; flagged?: false; acceptProposed?: boolean; moveTo?: string }

/** Factory in the desktop app, as the renderer reaches it: `window.phaseoDesktop.factory`. */
export interface FactoryApi {
	snapshot(): Promise<FactorySnapshot>;
	refresh(): Promise<FactorySnapshot>;
	updateSettings(patch: Partial<FactorySettings>): Promise<FactorySnapshot>;
	startRun(input: StartRunInput): Promise<Run>;
	cancelRun(runId: string): Promise<void>;
	assign(itemId: string, agentId: string | null): Promise<void>;
	/** The reasoning effort for this item's runs; null goes back to each agent's own. */
	setEffort(itemId: string, effort: string | null): Promise<void>;
	/** Steer the running stage's thread, or reply to the last run so it carries on. */
	sendMessage(itemId: string, text: string): Promise<void>;
	act(itemId: string, action: ItemAction): Promise<void>;
	/** The item's desktop thread, made (in the item's worktree when its repository has a clone here) if it has none yet. Returns its id. */
	openThread(itemId: string): Promise<string>;
	/** Opens the issue on GitHub and returns its id. */
	createIssue(input: NewIssueInput): Promise<string>;
	/** Adds a repository and reads all of its open issues and pull requests. */
	addRepo(repo: string, path: string): Promise<void>;
	removeRepo(repo: string): Promise<void>;
	/** Comments, closes, reopens, reviews, merges or drafts on GitHub, and updates the item here. */
	changeOnGithub(itemId: string, change: GithubChange): Promise<void>;
	mergeState(itemId: string): Promise<MergeState>;
	/** Everything that happened on the item, oldest first. */
	itemTimeline(itemId: string): Promise<TimelineEntry[]>;
	repoLabels(itemId: string): Promise<RepoLabel[]>;
	/** People who can be assigned or asked to review in the item's repository, matching what's been typed. */
	assignable(itemId: string, query: string): Promise<Mentionable[]>;
	itemChecks(itemId: string): Promise<CheckRun[]>;
	pullFiles(itemId: string): Promise<PullFiles>;
	/** The end of a failed GitHub Actions job's log, from its check link. */
	checkLog(itemId: string, link: string): Promise<string | null>;
	/** Who GitHub lets you @mention in the item's repository, matching what's been typed. */
	mentions(itemId: string, query: string): Promise<Mentionable[]>;
	/** Puts the repositories in this order: the picker and the settings list follow it. */
	orderRepos(order: string[]): Promise<void>;
	/** Reads every open issue and pull request again. */
	importRepo(repo: string): Promise<void>;
	/** Asks for a folder and reads which GitHub repository it's a clone of. */
	pickCheckout(): Promise<{ path: string; repo: string | null } | null>;
	/** Clones of GitHub repositories found on this computer, from the usual folders and the folders coding tools remember. */
	localClones(): Promise<LocalClone[]>;
	/** An item's description. */
	itemBody(itemId: string): Promise<string>;
	/** Issues in the same repository that read like this one, most alike first. */
	similarItems(itemId: string): Promise<SimilarItem[]>;
	/** Every comment on an issue or pull request, oldest first. */
	itemComments(itemId: string): Promise<IssueComment[]>;
	/** `repo` is a repository, or "@computer" for notes about this computer. */
	addNote(repo: string, text: string): Promise<void>;
	removeNote(repo: string, noteId: string): Promise<void>;
	/** Edits a note's text, pins it, keeps one a run flagged (flagged: false), takes its proposed correction or moves it. */
	updateNote(repo: string, noteId: string, patch: NotePatch): Promise<void>;
	/** A proof file a run saved (screenshot, recording, log) as a data: URL; null when it's gone. Text proof comes back as UTF-8 text/plain. */
	proofFile(runId: string, name: string): Promise<string | null>;
	/** An image attached to an issue written in Factory, as a data: URL; null when it's gone. */
	attachmentFile(itemId: string, name: string): Promise<string | null>;
	/** A GitHub image or video (in a description or comment) read with gh's sign-in, as a data: URL, so private repositories' ones show. */
	githubImage(url: string): Promise<string | null>;
	/** Changes, at most every 50 ms. `items` is left out when only something else changed: keep the list you have. */
	onChange(listener: (update: WindowUpdate) => void): () => void;
}
