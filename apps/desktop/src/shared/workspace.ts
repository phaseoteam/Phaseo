import type { Delegation, Launch } from "./orchestration";
import type { PullRequestThreadsQuery, PullRequestThreadsPage } from "./pullRequestThreads";
import type { ImportableHub, UsageHub, UsageHubRequest, UsageHubSnapshot } from "./usageHubs";
import { nativeActionText, validateNativeAction, type NativeAction, type NativeActionCatalog } from "./nativeActions";
import type { PromptCommandCatalog, PromptCommandPreview, PromptCommandRequest } from "./promptCommands";
import type { McpPromptCatalog, McpPromptPreview, McpPromptRequest } from "./mcpPrompts";
import type { PullRequestContents, PullRequestContentsQuery } from "./pullRequestContents";
import type { PullRequestFilesPage, PullRequestFilesQuery } from "./pullRequestFiles";
import type { BranchPullRequest, CreatedPullRequestResult, ProjectPullRequests, PullRequestDetails } from "./pullRequests";
import { parsePullRequestReference, validRepository, type PullRequestActionRequest, type PullRequestCandidates, type PullRequestView, type TaskPullRequestLink } from "./pullRequestView";
import type { AgentForm, FormAnswer } from "./agentForms";
import type { McpCommand, McpConnection } from "./mcp";
import type { WorkspacePreferences } from "./preferences";
import type { InstructionDocument, InstructionEdit } from "./instructions";
import type { Mission, MissionCommand } from "./missions";
import type { TaskHistoryPage, TaskHistoryQuery } from "./taskHistory";
import type { ConversationPage, ConversationPageQuery } from "./conversationPage";
import type { WorkspaceOverview } from "./workspaceOverview";
import type { EditorInstallation, ProjectOpenRequest } from "./editors";
import type { PlanStep } from "./planSteps";
import { normalizeTags } from "./tags";
import type { GitDiffRequest, GitDiffResult, GitRefs, TurnCheckpoint } from "./gitDiff";
import type { ProjectTreeRequest, ProjectTreeResult } from "./projectTree";
import type { FilePreview } from "./filePreview";
import type { ProjectSettings, ProjectUpdate, T3ProjectFileState } from "./projectSettings";
import type { PullRequestGuideResult } from "./pullRequestGuide";
import type { PullRequestStackActionRequest, PullRequestStackRead } from "./pullRequestStacks";
export const harnesses = ["phaseo", "codex", "claude", "opencode", "pi", "cursor", "grok", "antigravity", "acp"] as const;
export type Harness = typeof harnesses[number];
export type TaskStatus = "idle" | "running" | "waiting" | "limited" | "failed" | "interrupted" | "completed";
export type Project = { id: string; name: string; directory: string; createdAt: string; worktree?: { sourceProjectId: string; branch: string; baseCommit: string; removedAt?: string }; /** Auto-settle overrides and scripts (Project settings). Worktrees use their source project's. */ settings?: ProjectSettings };
export type Account = { id: string; name: string; harness: Harness; kind: "native" | "api"; endpoint?: string; configDirectory?: string; configured: boolean; archived?: boolean; secretId?: string; oauthExpiresAt?: string };
export type AgentConnection = { id: string; name: string; executable: string; arguments: string[]; archived?: boolean };
export type AgentStatus = { checkedAt: string; name?: string; version?: string; protocolVersion: number; capabilities: string[]; authMethods: string[] };
export type Attachment = { id: string; taskId: string; name: string; kind: "text" | "image"; mimeType: string; size: number; pages?: number };
export type Message = { startedAt?: string; completedAt?: string; /** Working-tree snapshots around the turn this message started (user messages in a project). */ checkpoint?: TurnCheckpoint; timelineOrder?: number; threadReferences?: string[]; nativeAction?: NativeAction; id: string; role: "user" | "assistant" | "system" | "tool"; text: string; attachments?: Attachment[]; delivery?: "steer" | "subagent"; /** A wake the app sent (a watched pull request changed): shown as a compact notice, not as the person's message. */ notice?: MessageNotice; /** Delegated results: the first child, and every child batched into this message. */ sourceTaskId?: string; sourceTaskIds?: string[]; createdAt: string };
export type MessageNotice = { kind: "pull-request"; summary: string; outcome: "failed" | "completed" | "updated"; url?: string };
export type QueuedMessage = { notice?: MessageNotice; sourceTaskId?: string; sourceTaskIds?: string[]; threadReferences?: string[]; nativeAction?: NativeAction; id: string; text: string; attachments?: Attachment[]; createdAt: string };
export type SteeringMessage = QueuedMessage & { status: "sending" | "rejected" | "unconfirmed"; error?: string };
export type AgentActivity = { timelineOrder?: number; nativeAgent?: { id: string; model?: string; status: "pending" | "running" | "completed" | "failed" | "interrupted" }; id: string; type: "tool" | "reasoning" | "plan" | "usage" | "compaction"; title: string; text: string; status?: "running" | "completed" | "failed"; steps?: PlanStep[]; explanation?: string; summary?: string; compaction?: { beforeTokens: number; afterTokens?: number; durationMs?: number }; /** A plan the agent proposed (its Markdown is the text), and what the person did with it. */ proposed?: { outcome?: "implemented" | "revised" | "declined"; feedback?: string } };
/** How the person's own answer is typed: text by default, or a typed control with bounds. */
export type AgentQuestionInput = { kind: "text" | "multiline" | "number" | "integer" | "boolean" | "email" | "uri" | "date" | "date-time"; min?: number; max?: number; minLength?: number; maxLength?: number };
export type AgentQuestionOption = { label: string; description?: string; preview?: string; /** Sent instead of the label when set; it may be empty. */ value?: string };
export type AgentQuestion = { id: string; header: string; question: string; isOther?: boolean; isSecret?: boolean; multiSelect?: boolean; options?: AgentQuestionOption[] | null;
	/** Editable starting text for the person's own answer; its whitespace is kept and it may be sent empty. */ initialAnswer?: string;
	/** false lets the person send an empty answer (Pi). Defaults to true. */ required?: boolean;
	input?: AgentQuestionInput };
/** One set of questions. "message" requests are answered with a user message, even after the turn ends (Codex async questions). */
export type QuestionRequest = { id: string; questions: AgentQuestion[]; responseMode?: "live" | "message"; /** Who is asking, such as an MCP server or ACP agent. */ origin?: string };
/** A pending approval. Plans show as a proposed-plan card; always and never carry the agent's labels for its lasting choices. */
export type ApprovalRequest = { id: string; method: string; description: string; kind?: "plan"; always?: string; never?: string };
export type ApprovalDecision = "accept" | "decline" | "always" | "never";
export type Task = {
	delegation?: Delegation;
	/** Top-level chats started by an agent's launch_thread; not orchestration children. */
	launch?: Launch;
	conversationCounts?: { messages: number; activities: number };
	revision?: number;
	id: string; projectId?: string; title: string; harness: Harness; accountId?: string;
	agentId?: string;
	reasoningEffort?: string;
	serviceTier?: string;
	/** Per-model settings beyond effort and speed, keyed by option id (Claude Code effort, context window, fast mode, …). */
	modelOptions?: ModelOptionValues;
	nativeModels?: ModelOption[];
	nativeModes?: ModelOption[];
	nativeMode?: string;
	authTerminalId?: string;
	authInputId?: string;
	permissionMode?: "supervised" | "full-access";
	model: string; mode: "chat" | "code" | "plan"; status: TaskStatus; pinned: boolean;
	/** Labels for grouping and filtering chats, set by the person or the chat's agent. */
	tags?: string[];
	/** Code-mode lifecycle after T3 Code (see shared/threadLifecycle.ts). */
	settledOverride?: "settled" | "active"; settledAt?: string; unsettledAt?: string;
	snoozedUntil?: string; snoozedAt?: string; lastSnoozeWakeAt?: string;
	/** The person last had this chat open; turns finished after it are unread. */
	lastVisitedAt?: string;
	/** false opts this chat out of auto-settle. */
	autoSettle?: boolean;
	/** Where the person dragged this chat within its sidebar section (pinned or active); lower comes first. */
	orderKey?: number;
	/** The chat's own agent asked to settle mid-turn; it settles if the turn completes. */
	settleWhenTurnEnds?: boolean;
	archived: boolean; messages: Message[]; queue: QueuedMessage[]; nativeSessionId?: string;
	parentId?: string; nativeForkFrom?: string; createdAt: string; updatedAt: string; error?: string;
	handoffFrom?: Harness;
	approvals?: ApprovalRequest[];
	questions?: QuestionRequest[];
	forms?: { id: string; form: AgentForm }[];
	steering?: SteeringMessage[];
	activities?: AgentActivity[];
	inboxReadAt?: string;
	missionId?: string;
	/** Pull requests linked to this chat, after T3 Code's thread pull requests. */
	pullRequests?: TaskPullRequestLink[];
};
export type Workspace = { version: 1; projects: Project[]; accounts: Account[]; agents: AgentConnection[]; tasks: Task[]; mcpConnections: McpConnection[] };
export type HarnessInstallation = { harness: Harness; installed: boolean; version?: string; error?: string; maintenance?: { method: "npm" | "native" | "manual"; canUpdate: boolean } };
/** One per-model setting a harness accepts, shown in the composer's settings menu. */
export type ModelOptionDescriptor =
	| { id: string; label: string; type: "select"; options: { id: string; label: string; description?: string; isDefault?: boolean }[] }
	| { id: string; label: string; type: "boolean"; default?: boolean };
export type ModelOptionValues = Record<string, string | boolean>;
export type ModelOption = { id: string; name: string; description?: string; /** An older model, listed only when searching. */ legacy?: boolean; options?: ModelOptionDescriptor[]; organisationId?: string; organisationName?: string; releaseDate?: string; default?: boolean; reasoningEfforts?: { id: string; description: string }[]; defaultReasoningEffort?: string; serviceTiers?: { id: string; name: string; description: string }[]; defaultServiceTier?: string };
export type ModelsChange = { harness: Harness; accountId?: string };
export type UsageWindow = { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null };
export type AccountStatus = { checkedAt: string; authenticated: boolean | null; method?: string; identity?: string; plan?: string; ordinaryUsageAllowed?: boolean | null; usage?: { id: string; name: string; primary: UsageWindow | null; secondary: UsageWindow | null; spendControlReached: boolean | null }[]; usageError?: string; /** Paid usage beyond the plan, where the plan offers it (Claude). */ extraUsage?: { enabled: boolean; used: number | null; limit: number | null; currency?: string } };
export type ProjectFile = { name: string; path: string; directory: boolean };
export type GitFile = { path: string; oldPath?: string; indexStatus: string; worktreeStatus: string };
export type GitReview = { status: string; files: GitFile[]; diff: string; stagedDiff: string; diffHash: string; stagedDiffHash: string; branch: string; /** The tracked remote branch and how many local commits it lacks; absent when the branch has none. */ upstream?: { name: string; ahead: number; behind: number }; /** A remote exists to publish the branch to. */ hasRemote?: boolean };
export type GitDiffContentsRequest = { filename: string; staged: boolean; hash: string };
export type GitDiffContents = { oldFile: { name: string; contents: string }; newFile: { name: string; contents: string } };
export type GitHunkReview = { filename: string; staged: boolean; hash: string; hunks: { index: number; heading: string; text: string; patch: string }[] };
export type GitCommand = { type: "stage" | "unstage"; filename: string } | { type: "stage-hunk" | "unstage-hunk"; filename: string; index: number; hash: string } | { type: "create-branch" | "switch-branch"; name: string } | { type: "commit"; message: string } | { type: "push" };
export type TerminalSession = { id: string; projectId?: string; /** The project action it runs, if any. */ scriptId?: string; title: string; cwd: string; output: string; ephemeral?: boolean; taskId?: string; status: "running" | "exited" | "interrupted"; exitCode?: number; createdAt: string; updatedAt: string };
export type TerminalCommand = { type: "open"; projectId?: string; /** The chat the terminal belongs to, for its drawer and tab titles. */ taskId?: string; /** Runs this project script in the new terminal, named after it. */ scriptId?: string } | { type: "write"; id: string; data: string } | { type: "resize"; id: string; columns: number; rows: number } | { type: "close" | "delete"; id: string };
export type TerminalEvent = { sessionId: string; data?: string; session?: TerminalSession };
export type WorkspaceCommand =
	| { type: "inbox-read"; id: string; revision: string }
	| { type: "settle" | "unsettle" | "wake" | "mark-unread"; id: string }
	| { type: "delete-task"; id: string }
	/** Removes a project entry, its worktree entries and their chats. Files on disk are not touched. */
	| { type: "remove-project"; id: string }
	| { type: "regenerate-title"; id: string }
	/** The chats of one sidebar section in the order the person dragged them into. */
	| { type: "reorder"; ids: string[] }
	| { type: "snooze"; id: string; until: string }
	| { type: "visit"; id: string; at: string }
	| { type: "auto-settle"; id: string; enabled: boolean }
	/** `reference` is a GitHub URL, `owner/repo#42`, `#42` or `42`; the main process resolves it against the chat's project. */
	| { type: "link-pull-request"; id: string; reference: string; repository?: string; number?: number; /** Set only in the main process (agent tools, pull requests this chat created); the renderer's links are manual. */ source?: "agent" | "created" }
	| { type: "unlink-pull-request"; id: string; repository: string; number: number }
	| { type: "watch-pull-request"; id: string; repository: string; number: number; watching: boolean }
	| { type: "add-account"; name: string; harness: "codex" | "claude" | "phaseo" | "cursor" | "grok"; kind: "native" | "api"; endpoint?: string; apiKey?: string }
	| { type: "update-account"; id: string; name?: string; endpoint?: string; apiKey?: string; archived?: boolean }
	| { type: "add-agent"; name: string; executable: string; arguments: string[] }
	| { type: "update-agent"; id: string; name?: string; executable?: string; arguments?: string[]; archived?: boolean }
	| { type: "create-task"; projectId?: string; harness: Harness; accountId?: string; agentId?: string; model: string; mode: Task["mode"]; permissionMode?: Task["permissionMode"]; reasoningEffort?: string; serviceTier?: string; modelOptions?: ModelOptionValues }
	| { type: "handoff"; id: string; projectId?: string; harness: Harness; accountId?: string; agentId?: string; model: string; mode: Task["mode"]; permissionMode?: Task["permissionMode"]; reasoningEffort?: string; serviceTier?: string; modelOptions?: ModelOptionValues }
	| { type: "update-task"; id: string; title?: string; pinned?: boolean; archived?: boolean; tags?: string[]; model?: string; mode?: Task["mode"]; permissionMode?: Task["permissionMode"]; serviceTier?: string; reasoningEffort?: string; nativeMode?: string; modelOptions?: ModelOptionValues }
	| { type: "send"; id: string; text: string; threadReferences?: string[]; attachments?: string[]; nativeAction?: NativeAction }
	| { type: "steer"; id: string; text: string; attachments?: string[] }
	| { type: "steer-queue" | "steer-discard"; id: string; messageId: string }
	| { type: "cancel"; id: string }
	| { type: "resume"; id: string }
	| { type: "fork"; id: string; messageId?: string }
	| { type: "approval"; id: string; approvalId: string; decision: ApprovalDecision; /** Plan revisions: what to change. */ feedback?: string }
	| { type: "answer"; id: string; requestId: string; answers: Record<string, string[]>; dismissed?: boolean }
	| { type: "form-answer"; id: string; requestId: string; answer: FormAnswer | null; declined?: boolean }
	| { type: "queue-remove"; id: string; messageId: string }
	| { type: "queue-edit"; id: string; messageId: string; text: string }
	| { type: "queue-move"; id: string; messageId: string; direction: "up" | "down" };
export type PullRequestGuideFinished = { projectId?: string; repository: string; number: number; title: string; error?: string };
export type WorkspaceApi = {
	/** A chat's native commands and skills, or a new chat's before it exists. */
	nativeActions: (target: string | { harness: Harness; accountId?: string; projectId?: string }) => Promise<NativeActionCatalog>;
	promptCommands: (projectId: string | undefined, request: PromptCommandRequest) => Promise<PromptCommandCatalog | PromptCommandPreview>;
	mcpPrompts: (taskId: string, request: McpPromptRequest) => Promise<McpPromptCatalog | McpPromptPreview>;
	mcpPromptAttachments: (taskId: string, messages: McpPromptPreview["messages"]) => Promise<{ text: string; attachments: Attachment[] }>;
	overview: () => Promise<WorkspaceOverview>;
	onOverviewChange: (listener: (workspace: WorkspaceOverview) => void) => () => void;
	task: (id: string) => Promise<Task>;
	taskHistory: (query: TaskHistoryQuery) => Promise<TaskHistoryPage>;
	conversationPage: (query: ConversationPageQuery) => Promise<ConversationPage>;
	missions: () => Promise<Mission[]>;
	mission: (command: MissionCommand) => Promise<Mission[]>;
	onMissionsChange: (listener: (missions: Mission[]) => void) => () => void;
	preferences: () => Promise<{ preferences: WorkspacePreferences; notificationsSupported: boolean }>;
	savePreferences: (preferences: WorkspacePreferences) => Promise<WorkspacePreferences>;
	globalInstructions: () => Promise<InstructionDocument>;
	saveGlobalInstructions: (edit: InstructionEdit) => Promise<InstructionDocument>;
	onOpenTask: (listener: (taskId?: string) => void) => () => void;
	get: () => Promise<Workspace>;
	command: (command: WorkspaceCommand) => Promise<WorkspaceOverview>;
	chooseProject: () => Promise<WorkspaceOverview>;
	/** Renames a project or replaces its settings (Project settings). */
	updateProject: (update: ProjectUpdate) => Promise<WorkspaceOverview>;
	/** The scripts in a project checkout's t3.json, T3 Code's checked-in project file. */
	projectFile: (projectId: string) => Promise<T3ProjectFileState>;
	createWorktree: (projectId: string, branch: string, base: string) => Promise<{ workspace: WorkspaceOverview; projectId: string }>;
	removeWorktree: (projectId: string) => Promise<WorkspaceOverview>;
	/** Fetches a pull request's head and makes a managed worktree on a new branch at it (T3's "Check out in a separate worktree"). */
	pullRequestWorktree: (projectId: string, number: number) => Promise<{ workspace: WorkspaceOverview; projectId: string; branch: string }>;
	/** Switches the project's own checkout to the pull request's branch; refuses while it has uncommitted changes. */
	pullRequestCheckoutHere: (projectId: string, number: number) => Promise<{ workspace: WorkspaceOverview; projectId: string; branch: string }>;
	/** A pull request's stored review guide; with write, writes one for the current head first (T3's Guide tab). */
	pullRequestGuide: (projectId: string, number: number, write?: boolean) => Promise<PullRequestGuideResult>;
	pasteImage: (taskId: string, name: string, bytes: Uint8Array) => Promise<Attachment>;
	chooseAttachments: (taskId: string) => Promise<{ attachments: Attachment[]; errors: string[] }>;
	exportTask: (taskId: string, format: "markdown" | "json") => Promise<boolean>;
	importTask: (configuration: Extract<WorkspaceCommand, { type: "create-task" }>) => Promise<{ workspace: WorkspaceOverview; taskId: string } | undefined>;
	attachment: (taskId: string, id: string) => Promise<{ attachment: Attachment; text?: string; dataUrl?: string }>;
	installations: () => Promise<HarnessInstallation[]>;
	updateHarness: (harness: "codex" | "claude" | "pi") => Promise<void>;
	cancelHarnessUpdate: () => Promise<void>;
	harnessUpdateStatus: () => Promise<"codex" | "claude" | "pi" | undefined>;
	checkAgent: (agentId: string) => Promise<AgentStatus>;
	mcp: (command: McpCommand) => Promise<WorkspaceOverview>;
	models: (harness: Harness, accountId?: string, projectId?: string) => Promise<ModelOption[]>;
	/** Refetches a harness catalog now, ignoring the Phaseo disk cache freshness. */
	refreshModels: (harness: Harness, accountId?: string) => Promise<ModelOption[]>;
	/** Fires when a background refresh changes a cached catalog; call models() again for the new list. */
	onModelsChange: (listener: (change: ModelsChange) => void) => () => void;
	openLink: (url: string) => Promise<void>;
	linkTitle: (url: string) => Promise<string | undefined>;
	terminals: () => Promise<TerminalSession[]>;
	terminal: (command: TerminalCommand) => Promise<TerminalSession[]>;
	onTerminalEvent: (listener: (event: TerminalEvent) => void) => () => void;
	signInPhaseo: (accountId?: string) => Promise<{ workspace: WorkspaceOverview; accountId: string }>;
	cancelPhaseoSignIn: () => Promise<void>;
	signIn: (accountId: string) => Promise<WorkspaceOverview>;
	accountStatus: (harness: "codex" | "claude" | "cursor" | "grok", accountId?: string) => Promise<AccountStatus>;
	/** CLIProxyAPI hubs: list, add (checks the key first), remove, or read every account's limits. */
	usageHubs: <R extends UsageHubRequest>(request: R) => Promise<R extends { type: "check" } ? UsageHubSnapshot : R extends { type: "t3-hubs" } ? ImportableHub[] : UsageHub[]>;
	cancelSignIn: (accountId: string) => Promise<void>;
	listFiles: (projectId: string, directory: string) => Promise<ProjectFile[]>;
	/** Files and folders matching a query, best first, for `@` mentions. */
	searchFiles: (projectId: string, query: string) => Promise<ProjectFile[]>;
	editors: () => Promise<EditorInstallation[]>;
	openProject: (projectId: string, request: ProjectOpenRequest) => Promise<void>;
	readFile: (projectId: string, filename: string) => Promise<string>;
	readDocument: (projectId: string, filename: string) => Promise<{ text: string; hash: string }>;
	writeDocument: (projectId: string, filename: string, text: string, expectedHash: string) => Promise<{ hash: string }>;
	gitReview: (projectId: string) => Promise<GitReview>;
	pullRequestContents: (projectId: string, query: PullRequestContentsQuery) => Promise<PullRequestContents>;
	pullRequestFiles: (projectId: string, query: PullRequestFilesQuery) => Promise<PullRequestFilesPage>;
	pullRequestThreads: (projectId: string, query: PullRequestThreadsQuery) => Promise<PullRequestThreadsPage>;
	pullRequest: (projectId: string, number: number) => Promise<PullRequestDetails>;
	pullRequests: (projectId: string, cursor?: string) => Promise<ProjectPullRequests>;
	/** One pull request with its checks, reviews, comments, commits and review threads. */
	pullRequestView: (projectId: string, number: number) => Promise<PullRequestView>;
	/** The labels or reviewers a Summary picker offers, read when it opens. */
	pullRequestCandidates: (projectId: string, query: { number: number; kind: "labels" | "reviewers" }) => Promise<PullRequestCandidates>;
	/** Merge, close, comment, review and the rest, through GitHub CLI; returns the pull request as it is afterwards. */
	pullRequestAction: (projectId: string, request: PullRequestActionRequest) => Promise<PullRequestView>;
	/** A review guide run ended (`opened` false), or its desktop notification was clicked (`opened` true). */
	onPullRequestGuideFinished: (listener: (event: PullRequestGuideFinished, opened: boolean) => void) => () => void;
	/** The pull request for the project checkout's current branch, linked or not; cached briefly unless `fresh`. */
	branchPullRequest: (projectId: string, fresh?: boolean) => Promise<BranchPullRequest>;
	/** Pushes the branch if needed and opens a pull request for it (or finds its open one), linked to `taskId` as created. */
	createPullRequest: (projectId: string, taskId?: string) => Promise<CreatedPullRequestResult & { workspace: WorkspaceOverview }>;
	/** The project's GitHub repository (owner/repo) from its origin remote, or null when it has none. */
	projectRepository: (projectId: string) => Promise<string | null>;
	/** The native GitHub stack a pull request is in, cached for a minute unless `fresh`; linked chats pick up its layers. */
	pullRequestStack: (projectId: string, number: number, fresh?: boolean) => Promise<PullRequestStackRead>;
	/** Merge stack (through this layer) or Rebase stack (from the top), refused if any expected head moved. */
	pullRequestStackAction: (projectId: string, request: PullRequestStackActionRequest) => Promise<{ message: string }>;
	gitHunks: (projectId: string, filename: string, staged: boolean) => Promise<GitHunkReview>;
	gitDiffContents: (projectId: string, request: GitDiffContentsRequest) => Promise<GitDiffContents>;
	gitCommand: (projectId: string, command: GitCommand) => Promise<GitReview>;
	gitBranches: (projectId: string) => Promise<string[]>;
	/** The branch against its base, uncommitted work, or one turn's snapshots. */
	gitDiff: (projectId: string, request: GitDiffRequest) => Promise<GitDiffResult>;
	/** Both sides of one file in a scoped diff, checked against the diff's hash. */
	gitDiffFile: (projectId: string, request: { diff: GitDiffRequest; filename: string; oldFilename?: string; hash: string }) => Promise<GitDiffContents>;
	gitRefs: (projectId: string) => Promise<GitRefs>;
	/** Folder listings and search that skip Git-ignored files; `refresh` re-reads the project. */
	projectTree: (projectId: string, request: ProjectTreeRequest, refresh?: boolean) => Promise<ProjectTreeResult>;
	filePreview: (projectId: string, filename: string) => Promise<FilePreview>;
};

export function emptyWorkspace(): Workspace {
	return { version: 1, projects: [], accounts: [], agents: [], tasks: [], mcpConnections: [] };
}

const safeText = (value: string, limit: number) => value.length > 0 && value.length <= limit && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

function validateModelOptions(value: unknown) {
	if (value === undefined) return;
	if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 16) throw new Error("Invalid model settings.");
	for (const [key, option] of Object.entries(value)) if (!safeText(key, 100) || (typeof option !== "boolean" && (typeof option !== "string" || !safeText(option, 100)))) throw new Error("Invalid model settings.");
}

function validateApiEndpoint(endpoint: string) {
	const url = new URL(endpoint);
	if (url.search || url.hash) throw new Error("Use an endpoint URL without query parameters or fragments.");
	if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Use HTTPS or a local model endpoint.");
}

export function validateCommand(value: unknown): WorkspaceCommand {
	if (!value || typeof value !== "object") throw new Error("Invalid workspace command.");
	const command = value as Record<string, unknown>;
	const string = (key: string, required = true, max = 1000) => {
		const input = command[key];
		if (!required && input === undefined) return;
		if (typeof input !== "string" || !input.trim() || input.length > max) throw new Error(`Invalid ${key}.`);
	};
	if (command.type === "add-agent") {
		string("name", true, 100); string("executable");
		if (!Array.isArray(command.arguments) || command.arguments.length > 100 || command.arguments.some(value => typeof value !== "string" || value.includes("\0") || value.length > 10000)) throw new Error("Invalid agent arguments.");
	} else if (command.type === "add-account") {
		string("name", true, 100);
		if (!["codex", "claude", "phaseo", "cursor", "grok"].includes(command.harness as string)) throw new Error("Invalid account harness.");
		if (command.kind === "api" && command.harness === "phaseo") {
			string("endpoint"); string("apiKey", true, 10000);
			validateApiEndpoint(command.endpoint as string);
		} else if (command.kind === "api" && command.harness === "cursor") { string("apiKey", true, 10000); if (command.endpoint !== undefined) throw new Error("Cursor accounts use the official SDK service."); }
		else if (command.kind !== "native" || command.harness === "phaseo") throw new Error("Invalid account type.");
	} else if (command.type === "reorder") {
		if (!Array.isArray(command.ids) || !command.ids.length || command.ids.length > 500 || command.ids.some(id => typeof id !== "string" || !id || id.length > 100) || new Set(command.ids).size !== command.ids.length) throw new Error("Invalid chat order.");
	} else if (command.type === "create-task" || command.type === "handoff") {
		if (command.type === "handoff") string("id");
		if (!harnesses.includes(command.harness as Harness)) throw new Error("Unknown harness.");
		if (command.permissionMode !== undefined && !["supervised", "full-access"].includes(command.permissionMode as string)) throw new Error("Invalid permissions.");
		if (!["chat", "code", "plan"].includes(command.mode as string)) throw new Error("Invalid task mode.");
		string("model"); string("projectId", false); string("accountId", false); string("agentId", false);
		if (command.serviceTier !== undefined && (typeof command.serviceTier !== "string" || command.serviceTier.length > 100 || [...command.serviceTier].some(character => character.charCodeAt(0) < 32))) throw new Error("Invalid speed setting.");
		if (command.reasoningEffort !== undefined && (typeof command.reasoningEffort !== "string" || command.reasoningEffort.length > 100 || [...command.reasoningEffort].some(character => character.charCodeAt(0) < 32))) throw new Error("Invalid reasoning effort.");
		validateModelOptions(command.modelOptions);
	} else {
		string("id");
		switch (command.type) {
			case "update-account":
				string("name", false, 100); string("endpoint", false); string("apiKey", false, 10000);
				if (command.endpoint !== undefined) validateApiEndpoint(command.endpoint as string);
				if (command.archived !== undefined && typeof command.archived !== "boolean") throw new Error("Invalid archived state.");
				break;
			case "update-agent":
				string("name", false, 100); string("executable", false);
				if (command.arguments !== undefined && (!Array.isArray(command.arguments) || command.arguments.length > 100 || command.arguments.some(value => typeof value !== "string" || value.includes("\0") || value.length > 10000))) throw new Error("Invalid agent arguments.");
				if (command.archived !== undefined && typeof command.archived !== "boolean") throw new Error("Invalid archived state.");
				break;
			case "update-task":
				if (command.permissionMode !== undefined && !["supervised", "full-access"].includes(command.permissionMode as string)) throw new Error("Invalid permissions.");
				string("title", false, 200);
				if (command.serviceTier !== undefined && (typeof command.serviceTier !== "string" || command.serviceTier.length > 100 || [...command.serviceTier].some(character => character.charCodeAt(0) < 32))) throw new Error("Invalid speed setting.");
				string("model", false);
				if (command.nativeMode !== undefined && (typeof command.nativeMode !== "string" || command.nativeMode.length > 1000 || [...command.nativeMode].some(character => character.charCodeAt(0) < 32))) throw new Error("Invalid native mode.");
				if (command.reasoningEffort !== undefined && (typeof command.reasoningEffort !== "string" || command.reasoningEffort.length > 100 || [...command.reasoningEffort].some(character => character.charCodeAt(0) < 32))) throw new Error("Invalid reasoning effort.");
				if (command.mode !== undefined && !["chat", "code", "plan"].includes(command.mode as string)) throw new Error("Invalid task mode.");
				validateModelOptions(command.modelOptions);
				for (const key of ["pinned", "archived"]) if (command[key] !== undefined && typeof command[key] !== "boolean") throw new Error(`Invalid ${key}.`);
				if (command.tags !== undefined) command.tags = normalizeTags(command.tags);
				break;
			case "send": case "steer":
				if (command.threadReferences !== undefined && (command.type !== "send" || !Array.isArray(command.threadReferences) || command.threadReferences.length > 10 || command.threadReferences.some(id => typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)))) throw new Error("Invalid chat references.");
				string("text", true, 100000);
				if (command.nativeAction !== undefined) { if (command.type !== "send") throw new Error("Native actions cannot steer a turn."); const action = validateNativeAction(command.nativeAction); if (nativeActionText(action) !== command.text) throw new Error("Native action does not match this message."); command.nativeAction = action; }
				if (command.attachments !== undefined && (!Array.isArray(command.attachments) || command.attachments.length > 10 || command.attachments.some(id => typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) || new Set(command.attachments).size !== command.attachments.length)) throw new Error("Invalid attachments.");
				break;
			case "cancel": case "resume": break;
			case "fork": string("messageId", false); break;
			case "approval":
				string("approvalId");
				if (!["accept", "decline", "always", "never"].includes(command.decision as string)) throw new Error("Invalid approval decision.");
				if (command.feedback !== undefined && (command.decision !== "decline" || typeof command.feedback !== "string" || command.feedback.length > 20000)) throw new Error("Invalid approval feedback.");
				break;
			case "form-answer": {
				string("requestId");
				if (command.declined !== undefined && (typeof command.declined !== "boolean" || (command.declined && command.answer !== null))) throw new Error("Invalid form decline.");
				if (command.answer === null) break;
				if (!command.answer || typeof command.answer !== "object" || Array.isArray(command.answer)) throw new Error("Invalid form answer.");
				const entries = Object.entries(command.answer);
				if (entries.length > 100 || entries.some(([key, value]) => !key || key.length > 1000 || !(typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.length <= 10000) || (Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === "string" && item.length <= 10000))))) throw new Error("Invalid form answer.");
				break;
			}
			case "answer": {
				string("requestId");
				if (command.dismissed !== undefined && typeof command.dismissed !== "boolean") throw new Error("Invalid dismissal.");
				if (command.dismissed === true) { if (!command.answers || typeof command.answers !== "object" || Array.isArray(command.answers) || Object.keys(command.answers).length) throw new Error("A dismissal has no answers."); break; }
				if (!command.answers || typeof command.answers !== "object" || Array.isArray(command.answers)) throw new Error("Invalid answers.");
				const entries = Object.entries(command.answers);
				// Empty answers pass here; the runtime checks each against its question (optional questions and editable text may be empty).
				if (!entries.length || entries.length > 100 || entries.some(([key, values]) => !key || !Array.isArray(values) || values.length > 100 || values.some(value => typeof value !== "string" || value.length > 10000))) throw new Error("Invalid answers.");
				break;
			}
			case "inbox-read": string("revision", true, 100); break;
			case "settle": case "unsettle": case "wake": case "mark-unread": case "delete-task": case "remove-project": case "regenerate-title": break;
			case "snooze": string("until", true, 100); if (Number.isNaN(Date.parse(command.until as string))) throw new Error("Invalid snooze time."); break;
			case "visit": string("at", true, 100); if (Number.isNaN(Date.parse(command.at as string))) throw new Error("Invalid visit time."); break;
			case "auto-settle": if (typeof command.enabled !== "boolean") throw new Error("Invalid auto-settle setting."); break;
			case "link-pull-request":
				if (typeof command.reference !== "string" || command.reference.length > 500 || !parsePullRequestReference(command.reference)) throw new Error("Paste a GitHub pull request URL or a number like #42.");
				// The main process fills these in from the reference.
				delete command.repository; delete command.number; delete command.source; break;
			case "unlink-pull-request": case "watch-pull-request":
				if (!validRepository(command.repository) || !Number.isSafeInteger(command.number) || Number(command.number) < 1 || Number(command.number) > 2147483647) throw new Error("Invalid pull request.");
				if (command.type === "watch-pull-request" && typeof command.watching !== "boolean") throw new Error("Invalid watch setting.");
				break;
			case "queue-remove": case "steer-queue": case "steer-discard": string("messageId"); break;
			case "queue-edit": string("messageId"); string("text", true, 100000); break;
			case "queue-move":
				string("messageId");
				if (command.direction !== "up" && command.direction !== "down") throw new Error("Invalid queue direction.");
				break;
			default: throw new Error("Unknown workspace command.");
		}
	}
	return value as WorkspaceCommand;
}
