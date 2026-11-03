import { utf8Length } from "./base64url";

/**
 * The frames a phone and a desktop exchange, the same over a direct WebSocket and inside Phaseo Connect envelopes.
 * Requests carry an id; the answer echoes the id and type with `ok` and a result, or `ok: false` and an error.
 */
/**
 * 2 added list_projects, projects_changed and hello's capabilities; 3 added update_chat, set_chat, queue and the
 * archived list; 4 added git_status, read_diff, read_diff_file, the access event and forbidden; 5 added list_files and
 * read_file; 6 added list_branches, git_action, commit_message, the pull request frames, git_status's pullRequest and
 * new_chat's workspace. A phone gates each newer frame on hello.protocol, since an older computer answers an unknown
 * request with invalid_frame.
 */
export const phoneProtocolVersion = 6;
export const phoneLimits = {
	/** Largest frame either side accepts, before or after decryption. */
	frameBytes: 1024 * 1024,
	/** Most chats or entries one page returns. */
	pageSize: 50,
	/** Requests one device may send each second, across its sockets. */
	requestsPerSecond: 50,
	/** Longest message the phone may send. */
	textChars: 100_000,
	/** Most chats one subscribe names. */
	subscriptions: 100,
	/** How often the desktop sends a chat's changed entries at most. */
	entriesBatchMs: 250,
	/** Most of one file's patch read_diff_file sends; the rest is cut at a line. */
	diffFileBytes: 512 * 1024,
	/** Most of a file read_file sends: text past it is cut at a line, and a larger image isn't sent. */
	fileBytes: 512 * 1024,
	/** Most of a pull request's description, and of each comment, read_pull_request sends; the rest is on GitHub. */
	pullRequestTextChars: 20_000,
} as const;

export type PhoneChatStatus = "idle" | "running" | "waiting" | "limited" | "failed" | "interrupted" | "completed";
export type PhoneChatMode = "chat" | "code" | "plan";
/** A chat as the phone's list shows it. needsYou is set while it waits on the person (an approval, a question, a failure). */
export type PhoneChat = {
	id: string; title: string; mode: PhoneChatMode; status: PhoneChatStatus; updatedAt: string; unread: boolean; needsYou: boolean; /** Why it needs the person, in words. */ attention?: string; projectId?: string; project?: string;
	/** The model's id on the computer. */ model?: string; /** The worktree branch it works on. */ branch?: string; /** Settled on the computer: done with, kept at the foot of the list. */ settled?: true;
	/** From protocol 3. */ pinned?: true; /** Hidden until then, unless it needs the person sooner. */ snoozedUntil?: string; /** Only in the archived list, or in the update that archived it. */ archived?: true;
};
export type PhoneApproval = { id: string; title: string; description: string; /** A proposed plan: its Markdown is the description. */ plan?: true };
export type PhoneQuestionOption = { label: string; description?: string };
export type PhoneQuestion = { id: string; header: string; question: string; multiSelect?: true; isOther?: true; isSecret?: true; options?: PhoneQuestionOption[] };
/** One set of questions; answer_question names it by id and answers each question by its own id. */
export type PhoneQuestionRequest = { id: string; questions: PhoneQuestion[] };
/** A pull request linked to a chat, as last read. */
export type PhoneLinkedPullRequest = { repository: string; number: number; url: string; title?: string; state?: "open" | "closed" | "merged" };
/** A chat with what it is waiting on, for the chat screen. */
export type PhoneChatDetail = PhoneChat & {
	approvals: PhoneApproval[]; questions: PhoneQuestionRequest[]; /** The effort the model runs at, when the chat set one. */ reasoningEffort?: string;
	/** From protocol 3: messages waiting for the turn to end, in order; the agent the chat runs on (set_chat stays within it); its permissions, which a phone can't change; linked pull requests. A queued message cut for the phone is `truncated`, and the computer won't take an edit of it. */
	queue?: { id: string; text: string; truncated?: true }[]; harness?: string; accountId?: string; permissionMode?: PhonePermissionMode; pullRequests?: PhoneLinkedPullRequest[];
};
/** A model a phone may start a chat with: the efforts it offers, in order, and the one it uses unless asked. */
export type PhoneModel = {
	id: string; name: string; efforts?: { id: string; label: string }[]; defaultEffort?: string;
	/** From protocol 2: an older model, listed behind "N older"; when it came out; its lab, for the logo; whether it has a fast tier. */
	legacy?: true; releaseDate?: string; organisationId?: string; fast?: true;
};
/**
 * One agent a new chat can run on, from protocol 2: Phaseo (source "phaseo", with the computer's Phaseo account) or a
 * coding agent on the computer (source "local"). `error` says why its models couldn't be read; it then has none.
 */
export type PhoneAgent = { harness: string; name: string; accountId?: string; agentId?: string; source: "phaseo" | "local"; models: PhoneModel[]; error?: string };
/** The agent and model a new chat starts with, and the effort when it sets one. */
export type PhoneModelChoice = { harness?: string; accountId?: string; agentId?: string; model: string; reasoningEffort?: string };
export type PhonePermissionMode = "supervised" | "accept-edits" | "full-access";
/** What a turn changed in the project, from its snapshots; lines are -1 when only binary files changed. */
export type PhoneTurnChanges = { files: number; additions: number; deletions: number };
export type PhoneMessage = {
	kind: "message"; id: string; role: "user" | "assistant" | "system" | "tool"; text: string; createdAt: string; completedAt?: string; delivery?: "steer" | "subagent"; notice?: string; attachments?: { name: string; kind: string }[]; /** The text was cut for the phone. */ truncated?: true;
	/** From protocol 3, on a person's message: the files the turn it started changed, once the computer has read them. */ changes?: PhoneTurnChanges;
};
export type PhoneActivity = { kind: "activity"; id: string; type: "tool" | "reasoning" | "plan" | "usage" | "compaction"; title: string; text: string; status?: "running" | "completed" | "failed"; summary?: string; steps?: { text: string; status: string }[]; truncated?: true };
export type PhoneEntry = PhoneMessage | PhoneActivity;
/** A project on the computer. A worktree names the project it came from, whose folder lists its chats. */
export type PhoneProject = { id: string; name: string; /** The checked-out branch, when the computer read it. */ branch?: string; worktreeOf?: string; pinned?: true; archived?: true; /** A git checkout. */ repository: boolean };
/**
 * Powers a paired phone has beyond threads, switched on per phone on the computer: `code` reads git status and diffs
 * (from protocol 4), files (from 5) and pull requests (from 6); `changes` commits, pushes, pulls, switches and creates
 * branches, starts worktrees, and creates, merges, reviews, comments on and closes pull requests (from 6); `terminal`
 * is for frames still to come. Empty from a computer before 4.
 */
export type PhoneCapability = "code" | "changes" | "terminal";
export const phoneCapabilities: readonly PhoneCapability[] = ["code", "changes", "terminal"];
/** What a review compares: uncommitted work, the branch since it left its base, or what one turn of a chat changed. */
export type PhoneDiffScope = "uncommitted" | "branch" | "turn";
/**
 * Which diff: a chat's (in the chat's own folder, its worktree's when it has one) or a project's. A turn needs the chat
 * and names the person's message that started it, else the latest that has snapshots; the computer reads the
 * snapshots from that message, so the phone never sends tree ids.
 */
export type PhoneDiffTarget = { scope: PhoneDiffScope; projectId?: string; chatId?: string; messageId?: string; /** For branch: compare against this ref instead of the computer's guess. */ baseRef?: string };
export type PhoneGitFileStatus = "added" | "modified" | "deleted" | "renamed" | "untracked" | "conflicted";
export type PhoneGitFile = { path: string; oldPath?: string; status: PhoneGitFileStatus; /** Some of it is staged. */ staged: boolean };
/**
 * One file of a diff. `patch` is its part of the unified diff, from `diff --git` on. It's left out for a binary file,
 * and when the frame had no room for it (read it with read_diff_file). Lines are -1 for a binary file.
 */
export type PhoneDiffFile = { path: string; oldPath?: string; status: "added" | "modified" | "deleted" | "renamed"; additions: number; deletions: number; binary?: true; patch?: string; /** read_diff_file cut the patch at diffFileBytes. */ truncated?: true };
/** Which folder a file request reads: a chat's (its worktree's when it has one) or a project's. */
export type PhoneFileTarget = { projectId?: string; chatId?: string };
/** A file or folder, by its path from the project's folder with forward slashes. */
export type PhoneFileEntry = { name: string; path: string; directory: boolean };
/**
 * A file as the phone can show it: text (cut at a line past phoneLimits.fileBytes, `truncated`), an image up to that
 * size, `too-large` for a larger image, or `unsupported` for anything else (binary files and PDFs).
 */
export type PhoneFilePreview =
	| { kind: "text"; text: string; size: number; truncated: boolean }
	| { kind: "image"; mimeType: string; dataUrl: string; size: number }
	| { kind: "too-large"; size: number }
	| { kind: "unsupported"; size: number };
/** What git_action does, as the window's Git menu does it; each runs the window's own Git command. */
export const gitActions = ["stage", "unstage", "commit", "push", "pull", "create-branch", "switch-branch"] as const;
export type PhoneGitAction = typeof gitActions[number];
/** The pull request of a checkout's branch, open or not, as git_status { pullRequest: true } reads it. */
export type PhoneBranchPullRequest = { repository: string; number: number; url: string; title: string; state: "open" | "closed" | "merged"; draft: boolean };
export type PhoneReviewState = "approved" | "changes-requested" | "required" | "none";
export type PhoneChecksState = "passing" | "pending" | "failed" | "none" | "unknown";
/** A pull request row, as the window's list has it. */
export type PhonePullRequest = { number: number; title: string; url: string; author: string; draft: boolean; head: string; base: string; updatedAt: string; review: PhoneReviewState; checks: PhoneChecksState };
export type PhoneMergeMethod = "merge" | "squash" | "rebase";
export const phoneMergeMethods: readonly PhoneMergeMethod[] = ["squash", "merge", "rebase"];
export type PhonePullRequestCheck = { name: string; status: "passing" | "pending" | "failed" | "skipped" | "neutral"; url?: string };
export type PhonePullRequestEvent = { id: string; kind: "comment" | "review" | "review-comment" | "commit"; author?: string; body: string; createdAt: string; reviewState?: string; path?: string; truncated?: true };
/**
 * A pull request slimmed for a phone: its description and each comment cut at phoneLimits.pullRequestTextChars
 * (`truncated`), the latest 100 events of its activity, and the merge methods the repository allows with the one the
 * computer would pick (`mergeMethod`). `headOid` goes back with pr_action, so an action on a branch that moved is refused.
 */
export type PhonePullRequestView = PhonePullRequest & {
	repository: string; state: "open" | "closed" | "merged"; body: string; bodyTruncated?: true; headOid: string; baseOid: string;
	additions: number; deletions: number; changedFiles: number; mergeable: "mergeable" | "conflicting" | "unknown";
	checkRuns: PhonePullRequestCheck[]; reviews: { author?: string; state: string; submittedAt: string }[]; reviewers: string[];
	events: PhonePullRequestEvent[]; eventsTruncated: boolean; mergeMethods: PhoneMergeMethod[]; mergeMethod?: PhoneMergeMethod;
	viewer: { canMerge: boolean; canUpdate: boolean };
};
/** What pr_action does: merge with a method, close or reopen, comment, or a review without line comments. */
export type PhonePullRequestAction =
	| { type: "merge"; method: PhoneMergeMethod }
	| { type: "close" | "reopen" }
	| { type: "comment"; body: string }
	| { type: "review"; event: "approve" | "request-changes" | "comment"; body: string };
export type AttentionKind = "approval" | "question" | "done" | "failed";
/** What update_chat does, as the window's sidebar menu does it; each has its reverse, so a phone can undo. */
export const chatActions = ["settle", "unsettle", "wake", "mark-unread", "archive", "unarchive", "pin", "unpin", "rename", "snooze"] as const;
export type PhoneChatAction = typeof chatActions[number];
export const queueActions = ["remove", "edit", "up", "down", "steer"] as const;
export type PhoneQueueAction = typeof queueActions[number];

export type PhoneRequest =
	| { id: string; type: "hello"; deviceId: string; appVersion: string; /** The phone's phoneProtocolVersion; phones from before 2 leave it out. */ protocol?: number }
	| { id: string; type: "list_chats"; cursor?: string; limit?: number; /** From protocol 3: the archived chats instead. */ archived?: true }
	| { id: string; type: "read_chat"; chatId: string; before?: string; limit?: number }
	| { id: string; type: "send"; chatId: string; text: string; steer?: boolean }
	| { id: string; type: "answer_approval"; chatId: string; approvalId: string; decision: "accept" | "decline" }
	| { id: string; type: "answer_question"; chatId: string; questionId: string; answers: Record<string, string[]> }
	| { id: string; type: "stop"; chatId: string }
	| { id: string; type: "new_chat"; text: string; projectId?: string; mode: PhoneChatMode; /** One of list_models' ids; the computer's choice without it. */ model?: string; reasoningEffort?: string;
		/** From protocol 2: the agent (one of list_models' agents) the model belongs to; without it, the model is the default agent's. */ harness?: string; accountId?: string; agentId?: string;
		/** From protocol 6, with the changes capability: a new worktree from `base` (one of list_branches'), as the window's New worktree does. */ workspace?: { kind: "worktree"; base: string } }
	| { id: string; type: "list_models"; projectId?: string; /** From protocol 2: some agents run only in Code (Grok). */ mode?: PhoneChatMode }
	| { id: string; type: "list_projects" }
	| { id: string; type: "subscribe"; chatIds: string[] }
	/** From protocol 3. `title` goes with rename, `until` (an ISO time) with snooze. */
	| { id: string; type: "update_chat"; chatId: string; action: PhoneChatAction; title?: string; until?: string }
	/** From protocol 3: a stopped chat's mode (Code or Plan; a Chat stays one), model (one of its own agent's) or effort; `defaultEffort` goes back to the model's own. */
	| { id: string; type: "set_chat"; chatId: string; mode?: PhoneChatMode; model?: string; reasoningEffort?: string; defaultEffort?: true }
	/** From protocol 3: a queued message removed, edited (`text`), moved, or sent into the running turn now. */
	| { id: string; type: "queue"; chatId: string; messageId: string; action: PhoneQueueAction; text?: string }
	/** From protocol 4, with the code capability: a project's branch and changed files, without their text. */
	| { id: string; type: "git_status"; projectId: string; /** From protocol 6: also the branch's pull request, which asks GitHub (cached for 30 s). */ pullRequest?: true }
	/** From protocol 4, with the code capability: a diff split by file (see PhoneDiffTarget). */
	| ({ id: string; type: "read_diff" } & PhoneDiffTarget)
	/** One file of the diff read_diff answered with `hash`; refused as rejected once the diff has changed. */
	| ({ id: string; type: "read_diff_file"; path: string; hash: string } & PhoneDiffTarget)
	/**
	 * From protocol 5, with the code capability: one folder's files and folders (`directory`, "" for the top), or a
	 * search across the project (`query`). Git-ignored files are left out, as in the window's file tree.
	 */
	| ({ id: string; type: "list_files"; directory?: string; query?: string } & PhoneFileTarget)
	/** From protocol 5, with the code capability: one file to preview, read-only. */
	| ({ id: string; type: "read_file"; path: string } & PhoneFileTarget)
	/** From protocol 6, with the code capability: a project's local and remote branches, newest first. */
	| { id: string; type: "list_branches"; projectId: string }
	/**
	 * From protocol 6, with the changes capability: the window's Git command. stage and unstage take `filename`; commit
	 * takes `message`, `all` (everything when nothing is staged) and `push`; the branch actions take `name`.
	 */
	| { id: string; type: "git_action"; projectId: string; action: PhoneGitAction; filename?: string; message?: string; all?: true; push?: true; name?: string }
	/** From protocol 6, with the changes capability: a commit message the computer's title model writes from the changes. */
	| { id: string; type: "commit_message"; projectId: string }
	/** From protocol 6, with the changes capability: a pull request for the branch, linked to `chatId` when given. */
	| { id: string; type: "create_pull_request"; projectId: string; chatId?: string }
	/** From protocol 6, with the code capability: the repository's open pull requests, a page at a time. */
	| { id: string; type: "list_pull_requests"; projectId: string; cursor?: string }
	| { id: string; type: "read_pull_request"; projectId: string; number: number }
	/** One page (from 1) of a pull request's changed files, at the head and base read_pull_request answered with. */
	| { id: string; type: "pull_request_files"; projectId: string; number: number; headOid: string; baseOid: string; page?: number }
	/** From protocol 6, with the changes capability; refused once the pull request's head is no longer `headOid`. */
	| { id: string; type: "pr_action"; projectId: string; number: number; headOid: string; action: PhonePullRequestAction };
export type PhoneFrame = PhoneRequest | { id?: string; type: "ping" } | { id?: string; type: "pong" };

export type PhoneResults = {
	/** protocol is the lower of the two sides' versions, so a phone from before 2 (which refuses a higher one) keeps working. */
	hello: { desktopName: string; appVersion: string; protocol: number; /** From protocol 2. */ capabilities?: PhoneCapability[] };
	list_chats: { chats: PhoneChat[]; cursor?: string };
	read_chat: { chat: PhoneChatDetail; entries: PhoneEntry[]; /** Messages before these; pass the first message's id (not an activity's) as `before` to read them. */ earlier: number };
	send: { chatId: string };
	answer_approval: { chatId: string };
	answer_question: { chatId: string };
	stop: { chatId: string };
	new_chat: { chat: PhoneChat };
	/** The models of the agent a new chat (in that project) would use, and the model and effort it would start with. */
	/**
	 * `models` are the selected agent's (all a computer from before protocol 2 sends). From 2, `agents` lists every agent
	 * the chat could run on, `selected` names its agent, `favourites` are the window's (`harness:model` keys), and
	 * `permissionMode` is what the chat will run with: the project's default, else the latest chat's. A phone can't change it.
	 */
	list_models: { models: PhoneModel[]; selected: PhoneModelChoice; agents?: PhoneAgent[]; favourites?: string[]; permissionMode?: PhonePermissionMode };
	subscribe: { chatIds: string[] };
	/** Every project, worktrees and archived ones included, so the phone can fold and hide them as the window does. */
	list_projects: { projects: PhoneProject[] };
	/** The chat as it is now, so the phone shows it at once and can offer the reverse action. */
	update_chat: { chat: PhoneChat };
	set_chat: { chat: PhoneChatDetail };
	queue: { chatId: string };
	/** `repository` false: the folder isn't a git checkout, and the rest is empty. */
	/** From protocol 6, `pullRequest` when asked: the branch's (null: none, or no GitHub remote). */
	git_status: { repository: boolean; branch: string; upstream?: { name: string; ahead: number; behind: number }; hasRemote: boolean; files: PhoneGitFile[]; pullRequest?: PhoneBranchPullRequest | null };
	/**
	 * `hash` names this diff for read_diff_file. `truncated`: the computer stopped reading a very large diff, so files
	 * are missing. headRef and baseRef say what a branch review compared.
	 */
	read_diff: { repository: boolean; files: PhoneDiffFile[]; hash: string; truncated: boolean; headRef?: string; baseRef?: string };
	read_diff_file: { file: PhoneDiffFile };
	/** `truncated`: more matched, or the folder holds more, than the computer sends. */
	list_files: { entries: PhoneFileEntry[]; truncated: boolean };
	read_file: PhoneFilePreview;
	list_branches: { current: string; local: string[]; remote: string[] };
	/** The project's git status after the action. */
	git_action: PhoneResults["git_status"];
	commit_message: { message: string };
	/** `status` opened_existing: the branch already had one, which is now linked. */
	create_pull_request: { repository: string; number: number; url: string; status: "created" | "opened_existing" };
	list_pull_requests: { repository: string; pullRequests: PhonePullRequest[]; cursor?: string; limitReached: boolean };
	read_pull_request: PhonePullRequestView;
	/** Files as read_diff has them; a patch GitHub didn't send, or that didn't fit, is left out with `truncated`. */
	pull_request_files: { files: PhoneDiffFile[]; total: number; hasNext: boolean };
	/** The pull request after the action. */
	pr_action: PhonePullRequestView;
};
/** forbidden (from protocol 4): the phone lacks the capability; the person allows it on the computer. */
export type PhoneErrorCode = "invalid_frame" | "too_large" | "rate_limited" | "unauthorized" | "not_found" | "rejected" | "forbidden" | "internal";
export type PhoneResponse<T extends PhoneRequest["type"] = PhoneRequest["type"]> =
	| { id: string; type: T; ok: true; result: PhoneResults[T] }
	| { id: string; type: T; ok: false; error: { code: PhoneErrorCode; message: string } };
export type DesktopEvent =
	| { type: "chat_updated"; chat: PhoneChat | PhoneChatDetail }
	| { type: "entries"; chatId: string; entries: PhoneEntry[] }
	| { type: "attention"; chatId: string; kind: AttentionKind; summary: string }
	/** The project list changed. Sent only to a phone that has asked list_projects, so older phones never get it. */
	| { type: "projects_changed"; projects: PhoneProject[] }
	/** From protocol 4: the person changed this phone's capabilities on the computer; they apply at once. */
	| { type: "access"; capabilities: PhoneCapability[] }
	| { id?: string; type: "ping" } | { id?: string; type: "pong" };
export type DesktopFrame = PhoneResponse | DesktopEvent;

export class PhoneProtocolError extends Error {
	constructor(readonly code: PhoneErrorCode, message: string, readonly id?: string, readonly type?: string) { super(message); this.name = "PhoneProtocolError"; }
}

const requestTypes = new Set(["hello", "list_chats", "read_chat", "send", "answer_approval", "answer_question", "stop", "new_chat", "list_models", "subscribe", "list_projects", "update_chat", "set_chat", "queue", "git_status", "read_diff", "read_diff_file", "list_files", "read_file", "list_branches", "git_action", "commit_message", "create_pull_request", "list_pull_requests", "read_pull_request", "pull_request_files", "pr_action"]);
/** A branch name as git takes one on the command line: no leading dash, spaces, control characters or ref syntax. */
const refName = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 250 && !value.startsWith("-") && !/[\u0000-\u0020\u007f~^:?*[\\]|\.\.|@\{/.test(value);
const pullNumber = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 2147483647;
const commitId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
/** A path in a project as a phone names it: forward slashes, not absolute, no `.` or `..` segments ("" is the top). */
const projectPath = (value: unknown, top = false): value is string => typeof value === "string" && value.length <= 4096 && !/[\u0000-\u001f\\]/.test(value)
	&& (value === "" ? top : !/^[a-zA-Z]:/.test(value) && value.split("/").every(segment => segment !== "" && segment !== "." && segment !== ".."));
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validId = (value: unknown, max = 200): value is string => typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);

/** The JSON a frame carries, refused when larger than phoneLimits.frameBytes or not an object with a type. */
export function readFrameObject(text: string): Record<string, unknown> {
	// Each UTF-16 unit is at most 3 UTF-8 bytes, so only long text needs measuring.
	if (text.length * 3 > phoneLimits.frameBytes && utf8Length(text) > phoneLimits.frameBytes) throw new PhoneProtocolError("too_large", "Frames are limited to 1 MiB.");
	let value: unknown;
	try { value = JSON.parse(text); } catch { throw new PhoneProtocolError("invalid_frame", "Frames must be JSON."); }
	if (!plain(value) || typeof value.type !== "string") throw new PhoneProtocolError("invalid_frame", "Frames must be objects with a type.");
	return value;
}

/** A frame from a phone, checked field by field; anything unexpected is refused with the request's id where it had one. */
export function parsePhoneFrame(text: string): PhoneFrame {
	const frame = readFrameObject(text), type = frame.type as string;
	const id = validId(frame.id, 64) ? frame.id : undefined;
	if (type === "ping" || type === "pong") return { type, ...id ? { id } : {} };
	const fail = (message: string): never => { throw new PhoneProtocolError("invalid_frame", message, id, type); };
	if (!requestTypes.has(type)) fail("Unknown frame type.");
	if (!id) fail("Requests need an id of up to 64 characters.");
	const request = id as string;
	const chatId = () => validId(frame.chatId) ? frame.chatId : fail("chatId is required.");
	const limit = () => {
		if (frame.limit === undefined) return {};
		if (!Number.isSafeInteger(frame.limit) || (frame.limit as number) < 1 || (frame.limit as number) > phoneLimits.pageSize) fail(`limit must be a whole number from 1 to ${phoneLimits.pageSize}.`);
		return { limit: frame.limit as number };
	};
	const projectId = () => {
		if (frame.projectId === undefined) return {};
		if (!validId(frame.projectId)) fail("Invalid projectId.");
		return { projectId: frame.projectId as string };
	};
	const optional = (key: string, max = 200) => {
		if (frame[key] === undefined) return undefined;
		if (!validId(frame[key], max)) fail(`Invalid ${key}.`);
		return frame[key] as string;
	};
	const text_ = (key: string) => {
		const value = frame[key];
		if (typeof value !== "string" || !value.trim()) fail(`${key} is required.`);
		if ((value as string).length > phoneLimits.textChars) fail(`${key} is limited to ${phoneLimits.textChars} characters.`);
		return value as string;
	};
	switch (type) {
		case "hello": {
			if (!validId(frame.deviceId)) fail("deviceId is required.");
			if (typeof frame.appVersion !== "string" || frame.appVersion.length > 64) fail("appVersion is required.");
			if (frame.protocol !== undefined && (!Number.isSafeInteger(frame.protocol) || (frame.protocol as number) < 1)) fail("protocol must be a whole number.");
			return { id: request, type, deviceId: frame.deviceId as string, appVersion: frame.appVersion as string, ...frame.protocol !== undefined ? { protocol: frame.protocol as number } : {} };
		}
		case "list_chats": {
			if (frame.cursor !== undefined && !validId(frame.cursor, 400)) fail("Invalid cursor.");
			if (frame.archived !== undefined && typeof frame.archived !== "boolean") fail("archived must be true or false.");
			return { id: request, type, ...frame.cursor !== undefined ? { cursor: frame.cursor as string } : {}, ...limit(), ...frame.archived ? { archived: true as const } : {} };
		}
		case "read_chat": {
			if (frame.before !== undefined && !validId(frame.before)) fail("Invalid before.");
			return { id: request, type, chatId: chatId(), ...frame.before !== undefined ? { before: frame.before as string } : {}, ...limit() };
		}
		case "send": {
			if (frame.steer !== undefined && typeof frame.steer !== "boolean") fail("steer must be true or false.");
			return { id: request, type, chatId: chatId(), text: text_("text"), ...frame.steer ? { steer: true } : {} };
		}
		case "answer_approval": {
			if (!validId(frame.approvalId)) fail("approvalId is required.");
			// Lasting choices (always, never) change permissions, which the phone can't do.
			if (frame.decision !== "accept" && frame.decision !== "decline") fail("decision must be accept or decline.");
			return { id: request, type, chatId: chatId(), approvalId: frame.approvalId as string, decision: frame.decision as "accept" | "decline" };
		}
		case "answer_question": {
			if (!validId(frame.questionId)) fail("questionId is required.");
			const answers = frame.answers;
			if (!plain(answers) || Object.keys(answers).length > 50) fail("answers must map each question id to its answers.");
			for (const [key, value] of Object.entries(answers as Record<string, unknown>)) {
				if (!validId(key) || !Array.isArray(value) || value.length > 50 || value.some(item => typeof item !== "string" || item.length > 10_000)) fail("answers must map each question id to its answers.");
			}
			return { id: request, type, chatId: chatId(), questionId: frame.questionId as string, answers: answers as Record<string, string[]> };
		}
		case "stop": return { id: request, type, chatId: chatId() };
		case "new_chat": {
			if (frame.mode !== "chat" && frame.mode !== "code" && frame.mode !== "plan") fail("mode must be chat, code or plan.");
			if (frame.model !== undefined && !validId(frame.model)) fail("Invalid model.");
			if (frame.reasoningEffort !== undefined && !validId(frame.reasoningEffort, 100)) fail("Invalid reasoningEffort.");
			const agent = optional("harness", 40), accountId = optional("accountId"), agentId = optional("agentId");
			if ((accountId || agentId) && !agent) fail("accountId and agentId need a harness.");
			if (agent && frame.model === undefined) fail("A harness needs its model.");
			const workspace = frame.workspace;
			if (workspace !== undefined && (!plain(workspace) || workspace.kind !== "worktree" || !refName(workspace.base) || Object.keys(workspace).length !== 2)) fail("workspace must be a worktree with a base branch.");
			if (workspace !== undefined && frame.projectId === undefined) fail("A worktree needs its projectId.");
			return {
				id: request, type, text: text_("text"), mode: frame.mode as PhoneChatMode, ...projectId(),
				...frame.model !== undefined ? { model: frame.model as string } : {}, ...frame.reasoningEffort !== undefined ? { reasoningEffort: frame.reasoningEffort as string } : {},
				...agent ? { harness: agent } : {}, ...accountId ? { accountId } : {}, ...agentId ? { agentId } : {},
				...workspace !== undefined ? { workspace: { kind: "worktree" as const, base: (workspace as { base: string }).base } } : {},
			};
		}
		case "list_models": {
			if (frame.mode !== undefined && frame.mode !== "chat" && frame.mode !== "code" && frame.mode !== "plan") fail("mode must be chat, code or plan.");
			return { id: request, type, ...projectId(), ...frame.mode !== undefined ? { mode: frame.mode as PhoneChatMode } : {} };
		}
		case "list_projects": return { id: request, type };
		case "update_chat": {
			const action = frame.action as PhoneChatAction;
			if (!chatActions.includes(action)) fail(`action must be one of ${chatActions.join(", ")}.`);
			if (action === "rename") {
				if (typeof frame.title !== "string" || !frame.title.trim() || frame.title.length > 200 || /[\u0000-\u001f]/.test(frame.title)) fail("rename needs a title of up to 200 characters.");
			} else if (frame.title !== undefined) fail("Only rename takes a title.");
			if (action === "snooze") {
				if (typeof frame.until !== "string" || frame.until.length > 40 || Number.isNaN(Date.parse(frame.until))) fail("snooze needs until, an ISO time.");
			} else if (frame.until !== undefined) fail("Only snooze takes until.");
			return { id: request, type, chatId: chatId(), action, ...action === "rename" ? { title: (frame.title as string).trim() } : {}, ...action === "snooze" ? { until: frame.until as string } : {} };
		}
		case "set_chat": {
			if (frame.mode !== undefined && frame.mode !== "chat" && frame.mode !== "code" && frame.mode !== "plan") fail("mode must be chat, code or plan.");
			const model = optional("model"), reasoningEffort = optional("reasoningEffort", 100);
			if (frame.defaultEffort !== undefined && frame.defaultEffort !== true) fail("defaultEffort must be true.");
			const defaultEffort = frame.defaultEffort === true;
			if (defaultEffort && reasoningEffort) fail("Send reasoningEffort or defaultEffort, not both.");
			if (frame.mode === undefined && !model && !reasoningEffort && !defaultEffort) fail("set_chat needs a mode, model or reasoningEffort.");
			return { id: request, type, chatId: chatId(), ...frame.mode !== undefined ? { mode: frame.mode as PhoneChatMode } : {}, ...model ? { model } : {}, ...reasoningEffort ? { reasoningEffort } : {}, ...defaultEffort ? { defaultEffort: true as const } : {} };
		}
		case "queue": {
			const action = frame.action as PhoneQueueAction;
			if (!queueActions.includes(action)) fail(`action must be one of ${queueActions.join(", ")}.`);
			if (!validId(frame.messageId)) fail("messageId is required.");
			if (action === "edit") return { id: request, type, chatId: chatId(), messageId: frame.messageId as string, action, text: text_("text") };
			if (frame.text !== undefined) fail("Only edit takes text.");
			return { id: request, type, chatId: chatId(), messageId: frame.messageId as string, action };
		}
		case "git_status": {
			if (!validId(frame.projectId)) fail("projectId is required.");
			if (frame.pullRequest !== undefined && frame.pullRequest !== true) fail("pullRequest must be true.");
			return { id: request, type, projectId: frame.projectId as string, ...frame.pullRequest ? { pullRequest: true as const } : {} };
		}
		case "list_branches": case "commit_message": {
			if (!validId(frame.projectId)) fail("projectId is required.");
			return { id: request, type, projectId: frame.projectId as string };
		}
		case "git_action": {
			if (!validId(frame.projectId)) fail("projectId is required.");
			const action = frame.action as PhoneGitAction, projectId = frame.projectId as string;
			if (!gitActions.includes(action)) fail(`action must be one of ${gitActions.join(", ")}.`);
			const takes: Record<PhoneGitAction, string[]> = { stage: ["filename"], unstage: ["filename"], commit: ["message", "all", "push"], push: [], pull: [], "create-branch": ["name"], "switch-branch": ["name"] };
			for (const key of ["filename", "message", "all", "push", "name"]) if (frame[key] !== undefined && !takes[action].includes(key)) fail(`${action} doesn't take ${key}.`);
			if (action === "stage" || action === "unstage") {
				if (!projectPath(frame.filename)) fail("filename must be a file inside the project, such as src/app.ts.");
				return { id: request, type, projectId, action, filename: frame.filename as string };
			}
			if (action === "commit") {
				if (typeof frame.message !== "string" || !frame.message.trim() || frame.message.length > 10_000 || frame.message.includes("\0")) fail("commit needs a message of up to 10,000 characters.");
				if ((frame.all !== undefined && frame.all !== true) || (frame.push !== undefined && frame.push !== true)) fail("all and push must be true.");
				return { id: request, type, projectId, action, message: frame.message as string, ...frame.all ? { all: true as const } : {}, ...frame.push ? { push: true as const } : {} };
			}
			if (action === "create-branch" || action === "switch-branch") {
				if (!refName(frame.name)) fail("name must be a branch name, such as fix/login.");
				return { id: request, type, projectId, action, name: frame.name as string };
			}
			return { id: request, type, projectId, action };
		}
		case "create_pull_request": {
			if (!validId(frame.projectId)) fail("projectId is required.");
			const chat = optional("chatId");
			return { id: request, type, projectId: frame.projectId as string, ...chat ? { chatId: chat } : {} };
		}
		case "list_pull_requests": {
			if (!validId(frame.projectId)) fail("projectId is required.");
			if (frame.cursor !== undefined && !validId(frame.cursor, 400)) fail("Invalid cursor.");
			return { id: request, type, projectId: frame.projectId as string, ...frame.cursor !== undefined ? { cursor: frame.cursor as string } : {} };
		}
		case "read_pull_request": case "pull_request_files": case "pr_action": {
			if (!validId(frame.projectId)) fail("projectId is required.");
			if (!pullNumber(frame.number)) fail("number must be a pull request number.");
			const base = { id: request, projectId: frame.projectId as string, number: frame.number as number };
			if (type === "read_pull_request") return { ...base, type };
			if (!commitId(frame.headOid)) fail("headOid must be a commit id.");
			if (type === "pull_request_files") {
				if (!commitId(frame.baseOid)) fail("baseOid must be a commit id.");
				if (frame.page !== undefined && (!Number.isSafeInteger(frame.page) || (frame.page as number) < 1 || (frame.page as number) > 30)) fail("page must be a whole number from 1 to 30.");
				return { ...base, type, headOid: frame.headOid as string, baseOid: frame.baseOid as string, ...frame.page !== undefined ? { page: frame.page as number } : {} };
			}
			if (!plain(frame.action)) fail("action is required.");
			const act = frame.action as Record<string, unknown>;
			const words = (value: unknown, what: string, required: boolean) => {
				if (typeof value !== "string" || value.length > 65_536 || value.includes("\0") || (required && !value.trim())) fail(`${what} needs text of up to 65,536 characters.`);
				return value as string;
			};
			let action: PhonePullRequestAction;
			switch (act.type) {
				case "merge":
					if (!phoneMergeMethods.includes(act.method as PhoneMergeMethod)) fail("merge needs a method: squash, merge or rebase.");
					action = { type: "merge", method: act.method as PhoneMergeMethod }; break;
				case "close": case "reopen": action = { type: act.type }; break;
				case "comment": action = { type: "comment", body: words(act.body, "A comment", true) }; break;
				case "review":
					if (act.event !== "approve" && act.event !== "request-changes" && act.event !== "comment") fail("review needs an event: approve, request-changes or comment.");
					// GitHub needs words for anything but an approval.
					action = { type: "review", event: act.event as "approve" | "request-changes" | "comment", body: words(act.body ?? "", "A review", act.event !== "approve") }; break;
				default: return fail("action must be merge, close, reopen, comment or review.");
			}
			return { ...base, type, headOid: frame.headOid as string, action };
		}
		case "read_diff": case "read_diff_file": {
			if (frame.scope !== "uncommitted" && frame.scope !== "branch" && frame.scope !== "turn") fail("scope must be uncommitted, branch or turn.");
			const scope = frame.scope as PhoneDiffScope, chat = optional("chatId"), messageId = optional("messageId"), baseRef = optional("baseRef", 250);
			const target = projectId();
			if (!chat && !target.projectId) fail("A diff needs a chatId or a projectId.");
			if (chat && target.projectId) fail("Name a chatId or a projectId, not both.");
			if (scope === "turn" && !chat) fail("A turn's diff needs its chatId.");
			if (messageId && scope !== "turn") fail("Only a turn takes messageId.");
			if (baseRef && scope !== "branch") fail("Only branch takes baseRef.");
			const fields = { scope, ...target, ...chat ? { chatId: chat } : {}, ...messageId ? { messageId } : {}, ...baseRef ? { baseRef } : {} };
			if (type === "read_diff") return { id: request, type, ...fields };
			if (typeof frame.path !== "string" || !frame.path || frame.path.length > 4096 || /[\u0000-\u001f]/.test(frame.path)) fail("path is required.");
			if (typeof frame.hash !== "string" || !/^[a-f0-9]{64}$/.test(frame.hash)) fail("hash is required.");
			return { id: request, type, ...fields, path: frame.path as string, hash: frame.hash as string };
		}
		case "list_files": case "read_file": {
			const chat = optional("chatId"), target = projectId();
			if (!chat && !target.projectId) fail("Name a chatId or a projectId.");
			if (chat && target.projectId) fail("Name a chatId or a projectId, not both.");
			const fields = { ...target, ...chat ? { chatId: chat } : {} };
			if (type === "read_file") {
				if (!projectPath(frame.path)) fail("path must be a file inside the project, such as src/app.ts.");
				return { id: request, type, ...fields, path: frame.path as string };
			}
			if ((frame.directory === undefined) === (frame.query === undefined)) fail("Name a directory or a query, not both.");
			if (frame.directory !== undefined) {
				if (!projectPath(frame.directory, true)) fail("directory must be a folder inside the project, such as src (\"\" for the top).");
				return { id: request, type, ...fields, directory: frame.directory as string };
			}
			if (typeof frame.query !== "string" || !frame.query.trim() || frame.query.length > 500 || /[\u0000-\u001f]/.test(frame.query)) fail("query must be up to 500 characters.");
			return { id: request, type, ...fields, query: frame.query as string };
		}
		case "subscribe": {
			const ids = frame.chatIds;
			if (!Array.isArray(ids) || ids.length > phoneLimits.subscriptions || ids.some(value => !validId(value))) fail(`chatIds must list up to ${phoneLimits.subscriptions} chat ids.`);
			return { id: request, type, chatIds: [...new Set(ids as string[])] };
		}
	}
	return fail("Unknown frame type.");
}

/** A frame from the desktop, for the phone: its shape is checked, and the desktop is trusted for the contents. */
export function parseDesktopFrame(text: string): DesktopFrame {
	const frame = readFrameObject(text);
	if (typeof frame.ok === "boolean") {
		if (!validId(frame.id, 64)) throw new PhoneProtocolError("invalid_frame", "Responses need the request's id.");
		if (frame.ok ? !plain(frame.result) : !plain(frame.error) || typeof frame.error.message !== "string") throw new PhoneProtocolError("invalid_frame", "Invalid response.");
		return frame as unknown as PhoneResponse;
	}
	switch (frame.type) {
		case "chat_updated": if (plain(frame.chat) && validId(frame.chat.id)) return frame as unknown as DesktopEvent; break;
		case "entries": if (validId(frame.chatId) && Array.isArray(frame.entries)) return frame as unknown as DesktopEvent; break;
		case "attention": if (validId(frame.chatId) && ["approval", "question", "done", "failed"].includes(frame.kind as string) && typeof frame.summary === "string") return frame as unknown as DesktopEvent; break;
		case "projects_changed": if (Array.isArray(frame.projects)) return frame as unknown as DesktopEvent; break;
		case "access": if (Array.isArray(frame.capabilities)) return { type: "access", capabilities: frame.capabilities.filter((value): value is PhoneCapability => phoneCapabilities.includes(value as PhoneCapability)) }; break;
		case "ping": case "pong": return { type: frame.type, ...validId(frame.id, 64) ? { id: frame.id as string } : {} };
	}
	throw new PhoneProtocolError("invalid_frame", "Unknown or invalid desktop frame.");
}

const effortWords: Record<string, string> = { none: "None", instant: "Instant", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max", ultra: "Ultra" };
/** The word both apps show for an effort id ("xhigh" is "Extra high"); other ids are capitalised. */
export const effortLabel = (id: string) => effortWords[id] ?? id.charAt(0).toUpperCase() + id.slice(1);

export const okResponse = <T extends PhoneRequest["type"]>(request: { id: string; type: T }, result: PhoneResults[T]): PhoneResponse<T> => ({ id: request.id, type: request.type, ok: true, result });
export const errorResponse = (id: string, type: string, code: PhoneErrorCode, message: string) => ({ id, type, ok: false as const, error: { code, message } });

/**
 * A token bucket per device: `requestsPerSecond` a second on average, bursts up to the same. take() is false when the
 * device is over, so its request is answered with rate_limited rather than run.
 */
export class RequestRate {
	private tokens: number = phoneLimits.requestsPerSecond;
	private at: number;
	constructor(private readonly now: () => number = Date.now, private readonly perSecond: number = phoneLimits.requestsPerSecond) { this.at = now(); this.tokens = perSecond; }
	take() {
		const now = this.now();
		this.tokens = Math.min(this.perSecond, this.tokens + (now - this.at) / 1000 * this.perSecond); this.at = now;
		if (this.tokens < 1) return false;
		this.tokens -= 1; return true;
	}
}
