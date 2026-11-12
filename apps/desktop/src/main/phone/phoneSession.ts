import { createHash } from "node:crypto";
import { errorResponse, okResponse, parsePhoneFrame, phoneLimits, phoneProtocolVersion, PhoneProtocolError, RequestRate, type AttentionKind, type DesktopFrame, type PhoneCapability, type PhoneDiffTarget, type PhoneEntry, type PhoneFilePreview, type PhoneFileTarget, type PhoneProject, type PhoneRequest, type PhoneResponse, type PhoneResults } from "@phaseo/phone-protocol";
import type { ConversationPage, ConversationPageQuery } from "../../shared/conversationPage";
import type { GitDiffRequest, GitDiffResult, TurnFileChange } from "../../shared/gitDiff";
import { validateCommand, type AgentActivity, type Message, type Task, type TerminalCommand, type TerminalEvent, type TerminalSession, type WorkspaceCommand } from "../../shared/workspace";
import type { TaskOverview, WorkspaceOverview } from "../../shared/workspaceOverview";
import type { PhoneModelsInput, PhoneNewChat, PhoneSetChat, PhoneTriage, PhoneTriageStarted } from "./phoneHost";
import { attentionOf, chatListPage, phoneChat, phoneChats, phoneDetail, phoneProjects, queuedChars, readingOrder, topLevelChats, TurnChangesCache, withTurnChanges } from "./phoneChats";
import { phoneDiff, phoneDiffFile, phoneGitStatus, type GitWorkingStatus } from "./phoneReview";
import { phoneFileList } from "./phoneFiles";
import { phoneBranchPullRequest, phoneGitCommand, phoneGitSummary, phonePullRequest, phonePullRequestAction, phonePullRequestFiles, phonePullRequestSummary, phonePullRequestView } from "./phoneGit";
import type { ProjectTreeRequest, ProjectTreeResult } from "../../shared/projectTree";
import type { GitRefs } from "../../shared/gitDiff";
import type { BranchPullRequest, CreatedPullRequestResult, ProjectPullRequests } from "../../shared/pullRequests";
import type { PullRequestFilesPage, PullRequestFilesQuery } from "../../shared/pullRequestFiles";
import type { PullRequestActionRequest, PullRequestMergeMethod, PullRequestView } from "../../shared/pullRequestView";
import type { ProjectScript } from "../../shared/projectSettings";
import type { ThreadServer } from "../../shared/threadServers";
import { chatTerminals, latestOutput, phoneScripts, phoneServers, phoneTerminal, terminalReplay } from "./phoneTerminals";

/** What the phone server needs from the app: the same reads and commands the window uses. */
export type PhoneHost = {
	desktopName: () => string;
	appVersion: string;
	overview: () => WorkspaceOverview;
	/** A chat's header; its messages load only if read. */
	task: (id: string) => Task;
	page: (query: ConversationPageQuery) => ConversationPage;
	command: (command: WorkspaceCommand) => Promise<unknown>;
	/** Starts a chat with the phone's model and effort, else the project's or the app's defaults, and sends its first message; returns its id. */
	newChat: (input: PhoneNewChat) => Promise<string>;
	/** What a new chat (in that project) could run on, and what it would use unasked (phoneHost's phoneModels). */
	models: (input: PhoneModelsInput) => Promise<PhoneResults["list_models"]>;
	/** Whether a project's folder is a git checkout. Asked only when the project list changes. */
	isRepository: (directory: string) => boolean;
	/** Changes a stopped chat's mode, model or effort as the window's settings menu does (phoneHost's phoneSetChat). */
	setChat: (input: PhoneSetChat) => Promise<void>;
	/** The files a turn changed between two of the project's snapshots (gitCheckpoints' turnChanges). */
	turnChanges: (projectId: string, before: string, after: string) => Promise<readonly TurnFileChange[]>;
	/** The window's review status of a project's folder (projectFiles' gitWorkingStatus); null when it isn't a git checkout. */
	gitStatus: (projectId: string) => Promise<GitWorkingStatus | null>;
	/** The window's diff surface read (gitDiffScopes' gitScopedDiff) in a project's folder. */
	diff: (projectId: string, request: GitDiffRequest) => Promise<GitDiffResult>;
	/** The window's file tree (projectFileSearch's projectTree) of a project's folder. */
	files: (projectId: string, request: ProjectTreeRequest) => Promise<ProjectTreeResult>;
	/** A project file through the window's preview, sized for a frame (phoneFiles' phoneFilePreview). */
	readFile: (projectId: string, path: string) => Promise<PhoneFilePreview>;
	/** The window's branch list for a project (gitDiffScopes' gitRefs). */
	branches: (projectId: string) => Promise<GitRefs>;
	/** The pull request of the project's branch (branchPullRequest, cached for 30 s as the window's is). */
	branchPullRequest: (projectId: string) => Promise<BranchPullRequest>;
	/** The window's Git command (gitOperations' gitCommand, through mutateProject); it validates the command again. */
	gitCommand: (projectId: string, command: Record<string, unknown>) => Promise<unknown>;
	/** The window's "Write message" (gitWorkflow's generateCommitMessage), which runs the computer's title model. */
	commitMessage: (projectId: string) => Promise<string>;
	/** The window's Create pull request, linked to the chat when given. */
	createPullRequest: (projectId: string, chatId?: string) => Promise<CreatedPullRequestResult>;
	pullRequests: (projectId: string, cursor?: string) => Promise<ProjectPullRequests>;
	pullRequest: (projectId: string, number: number) => Promise<PullRequestView>;
	pullRequestFiles: (projectId: string, query: PullRequestFilesQuery) => Promise<PullRequestFilesPage>;
	/** The window's pull request action (projectPullRequestAction), which validates it and runs gh. */
	pullRequestAction: (projectId: string, request: PullRequestActionRequest) => Promise<PullRequestView>;
	/** The merge method the window would pick for the project: its setting, else the app's; null when neither sets one. */
	mergeMethod: (projectId: string) => PullRequestMergeMethod | null;
	/** Tells the window what a phone changed, so a lost phone's actions are seen ("Pushed from Daniel's Pixel"). */
	fromPhone: (note: { device: string; summary: string; projectId?: string }) => void;
	/** Every terminal, as the window's list has them (terminalService's get). */
	terminals: () => TerminalSession[];
	/** The window's terminal command (workspace:terminal), with its check that the project is still there. */
	terminal: (command: TerminalCommand) => TerminalSession[];
	/** Watches a running terminal for a phone, which the window's title names meanwhile (terminalService's attach). */
	attachTerminal: (id: string, viewer: string, listener: (event: TerminalEvent) => void) => { session: TerminalSession; output: string; detach: () => void };
	/** A project's scripts, as the window's Run menu lists them (a worktree's are its source project's). */
	scripts: (projectId: string) => readonly ProjectScript[];
	/** The local servers a chat started, as its Running servers lists them, and Stop for one (threadServers). */
	servers: (chatId: string) => Promise<ThreadServer[]>;
	/** `allowed` throws if the phone lost the right to Stop while the server was looked up; it runs just before the kill. */
	stopServer: (chatId: string, port: number, allowed: () => void) => Promise<ThreadServer>;
	/** Triage of the phone app from its own source (phoneHost's startPhoneTriage), as the window's Triage a Phaseo bug. */
	triage: (input: PhoneTriage) => Promise<PhoneTriageStarted>;
	/** The window's File issue and Discard for a triage chat's draft (workspaceRuntime's issueDraftAction). */
	issueDraft: (chatId: string, action: "file" | "discard") => Promise<unknown>;
};
export type PhoneDevice = { id: string; name: string };
const forbidden = () => new PhoneProtocolError("forbidden", "Allow this on the computer: Settings → Phone.");
export type Attention = { chatId: string; kind: AttentionKind; summary: string };

const signature = (value: unknown) => createHash("sha1").update(JSON.stringify(value)).digest("base64");
const message = (error: unknown) => error instanceof Error ? error.message : "That didn't work.";
/** Room left in a frame for its other fields and encryption, so entries never push one over phoneLimits.frameBytes. */
const entriesBudget = phoneLimits.frameBytes - 64 * 1024;
const size = (entry: PhoneEntry) => Buffer.byteLength(JSON.stringify(entry)) + 1;
/** Entries split into frames that each fit. */
/** Room in a terminal_output frame for its other fields, so a whole frame stays within phoneLimits.terminalFrameBytes. */
const terminalOutputBudget = phoneLimits.terminalFrameBytes - 1024;
/** What a watched terminal may pile up between batches; only the latest frame's worth goes out anyway. */
const terminalPendingChars = 4 * phoneLimits.terminalFrameBytes;
/** A terminal this phone watches: what it wrote since the last batch, and its session when that changed. */
type TerminalWatch = { detach: () => void; pending: string; skipped: boolean; session?: TerminalSession; sent: string };
export function entryFrames(entries: PhoneEntry[]) {
	const frames: PhoneEntry[][] = []; let current: PhoneEntry[] = [], bytes = 0;
	for (const entry of entries) {
		const bytesOf = size(entry);
		if (current.length && bytes + bytesOf > entriesBudget) { frames.push(current); current = []; bytes = 0; }
		current.push(entry); bytes += bytesOf;
	}
	if (current.length) frames.push(current);
	return frames;
}
/** The latest entries that fit one frame. */
function latestFitting(entries: PhoneEntry[]) {
	let bytes = 0, start = entries.length;
	while (start > 0 && bytes + size(entries[start - 1]!) <= entriesBudget) bytes += size(entries[--start]!);
	return entries.slice(start);
}

/**
 * One phone connection, on either transport: answers its requests through the app's own commands, and sends what changes
 * in the chats. Changed entries of the chats it subscribed to, and changed list rows, go out together at most every
 * phoneLimits.entriesBatchMs, so a streaming reply costs a few frames a second however fast it arrives.
 */
export class PhoneSession {
	private readonly subscribed = new Set<string>();
	/** Per subscribed chat, each entry id the phone has with a signature of what it got. */
	private readonly seen = new Map<string, Map<string, string>>();
	/** The list rows (or chat details) the phone has, by chat. */
	private readonly sentChats = new Map<string, string>();
	private readonly dirtyChats = new Set<string>();
	/** Per subscribed chat, entries whose changed files landed after they were sent, with their messages; the next batch resends those outside the latest page. */
	private readonly landed = new Map<string, Map<string, { entry: PhoneEntry; message: Message }>>();
	/** The signature of the project list the phone last got; unset until it reads one. */
	private sentProjects?: string;
	private readonly dirtyEntries = new Set<string>();
	private timer?: ReturnType<typeof setTimeout>;
	private lastFlush = 0;
	private closed = false;
	private readonly closeListeners: (() => void)[] = [];
	private readonly terminals = new Map<string, TerminalWatch>();
	/** What hello settled on; the access event goes only to a phone from 4 on, which knows it. */
	private protocol = 1;
	constructor(readonly device: PhoneDevice, private readonly host: PhoneHost, private readonly send: (frame: DesktopFrame) => void, private readonly rate: RequestRate, private readonly now: () => number = Date.now, private readonly turnChanges = new TurnChangesCache(host.turnChanges),
		/** This phone's capabilities as the computer's settings say now, so a change applies to the next request. */
		private readonly capabilities: () => readonly PhoneCapability[] = () => []) {}

	/** One frame of text from the phone. Errors are answered, never thrown. */
	async receive(text: string) {
		if (this.closed) return;
		let frame;
		try { frame = parsePhoneFrame(text); }
		catch (error) {
			const problem = error instanceof PhoneProtocolError ? error : new PhoneProtocolError("invalid_frame", "Invalid frame.");
			if (problem.id) this.send(errorResponse(problem.id, problem.type ?? "unknown", problem.code, problem.message) as PhoneResponse);
			return;
		}
		if (frame.type === "pong") return;
		if (frame.type === "ping") { this.send({ type: "pong", ...frame.id ? { id: frame.id } : {} }); return; }
		if (!this.rate.take()) { this.send(errorResponse(frame.id, frame.type, "rate_limited", "Too many requests. Wait a moment.") as PhoneResponse); return; }
		try { this.send(await this.answer(frame)); }
		catch (error) {
			const code = error instanceof PhoneProtocolError ? error.code : /no longer exists/i.test(message(error)) ? "not_found" : "rejected";
			if (!this.closed) this.send(errorResponse(frame.id, frame.type, code, message(error)) as PhoneResponse);
		}
	}

	private async answer(request: PhoneRequest): Promise<PhoneResponse> {
		const command = async (value: unknown) => { await this.host.command(validateCommand(value)); };
		switch (request.type) {
			case "hello": {
				if (request.deviceId !== this.device.id) throw new PhoneProtocolError("unauthorized", "This device signed in as another.");
				// A phone from before 2 sends no protocol and refuses a higher one, so it's told 1.
				const protocol = this.protocol = Math.min(request.protocol ?? 1, phoneProtocolVersion);
				// Before 4 no frame needed one, so an older phone is told none, as it always was.
				return okResponse(request, { desktopName: this.host.desktopName(), appVersion: this.host.appVersion, protocol, ...protocol >= 2 ? { capabilities: protocol >= 4 ? [...this.capabilities()] : [] } : {} });
			}
			case "list_projects": {
				const projects = phoneProjects(this.host.overview().projects, this.host.isRepository);
				this.sentProjects = signature(projects);
				return okResponse(request, { projects });
			}
			case "list_chats": {
				const page = chatListPage(this.host.overview(), request.cursor, request.limit ?? phoneLimits.pageSize, request.archived);
				for (const chat of page.chats) if (!this.subscribed.has(chat.id)) this.sentChats.set(chat.id, signature(chat));
				return okResponse(request, page);
			}
			case "read_chat": {
				const overview = this.chatOverview(request.chatId);
				const page = this.host.page({ taskId: request.chatId, kind: "messages", limit: request.limit ?? phoneLimits.pageSize, ...request.before ? { beforeId: request.before } : {} });
				const ordered = this.decorate(request.chatId, overview.projectId, page.entries as Message[], readingOrder(page.entries as Message[], page.activities ?? [])), entries = latestFitting(ordered);
				const dropped = ordered.slice(0, ordered.length - entries.length).filter(entry => entry.kind === "message").length;
				// The latest page is what the phone now has, so later changes are measured from it.
				if (!request.before && this.subscribed.has(request.chatId)) this.seen.set(request.chatId, new Map(entries.map(entry => [entry.id, signature(entry)])));
				const chat = phoneDetail(this.host.task(request.chatId), overview, this.host.overview().projects);
				if (this.subscribed.has(request.chatId)) this.sentChats.set(chat.id, signature(chat));
				return okResponse(request, { chat, entries, earlier: page.earlier + dropped });
			}
			case "send": {
				const chat = this.chatOverview(request.chatId);
				// Steering reaches a turn that's running; otherwise the message waits its turn, as typing it in the window does.
				await command(request.steer && chat.status === "running" ? { type: "steer", id: request.chatId, text: request.text } : { type: "send", id: request.chatId, text: request.text });
				return okResponse(request, { chatId: request.chatId });
			}
			case "answer_approval":
				this.chatOverview(request.chatId);
				await command({ type: "approval", id: request.chatId, approvalId: request.approvalId, decision: request.decision });
				return okResponse(request, { chatId: request.chatId });
			case "answer_question":
				this.chatOverview(request.chatId);
				await command({ type: "answer", id: request.chatId, requestId: request.questionId, answers: request.answers });
				return okResponse(request, { chatId: request.chatId });
			case "stop":
				this.chatOverview(request.chatId);
				await command({ type: "cancel", id: request.chatId });
				return okResponse(request, { chatId: request.chatId });
			case "new_chat": {
				// A worktree makes a branch and a folder, so it needs the same consent as the Git actions.
				if (request.workspace) { this.allowed("code"); this.allowed("changes"); }
				this.checkProject(request.projectId);
				const { id: _id, type: _type, ...input } = request;
				const id = await this.host.newChat(input);
				if (request.workspace) {
					this.host.fromPhone({ device: this.device.name, summary: `Started a thread in a new worktree from ${request.workspace.base}`, projectId: request.projectId! });
					this.changes();
				}
				const overview = this.host.overview(), task = overview.tasks.find(value => value.id === id);
				if (!task) throw new Error("The chat was started but could not be read.");
				return okResponse(request, { chat: phoneChat(task, overview.projects) });
			}
			case "triage": {
				// It fetches the source into a new folder and runs an agent there, so it needs the same consent as a worktree.
				this.allowed("code"); this.allowed("changes");
				const { id: _id, type: _type, ...input } = request;
				const started = await this.host.triage({ ...input, device: this.device.name });
				const overview = this.host.overview(), task = overview.tasks.find(value => value.id === started.chatId);
				if (!task) throw new Error("The triage chat was started but could not be read.");
				this.host.fromPhone({ device: this.device.name, summary: "Started triaging a bug in the phone app", ...task.projectId ? { projectId: task.projectId } : {} });
				return okResponse(request, { chat: phoneChat(task, overview.projects), commit: started.commit, exact: started.exact });
			}
			case "issue_draft": {
				// Filing creates an issue on GitHub in the person's name, like the pull request actions.
				this.allowed("changes");
				this.chatOverview(request.chatId);
				await this.host.issueDraft(request.chatId, request.action);
				const overview = this.chatOverview(request.chatId);
				return okResponse(request, { chat: phoneDetail(this.host.task(request.chatId), overview, this.host.overview().projects) });
			}
			case "list_models":
				this.checkProject(request.projectId);
				return okResponse(request, await this.host.models({ ...request.projectId ? { projectId: request.projectId } : {}, ...request.mode ? { mode: request.mode } : {} }));
			case "update_chat": {
				const task = this.organisable(request.chatId);
				const { chatId: id, action } = request;
				await command(action === "archive" || action === "unarchive" ? { type: "update-task", id, archived: action === "archive" }
					: action === "pin" || action === "unpin" ? { type: "update-task", id, pinned: action === "pin" }
					: action === "rename" ? { type: "update-task", id, title: request.title }
					: action === "snooze" ? { type: "snooze", id, until: request.until }
					: { type: action, id });
				const overview = this.host.overview(), after = overview.tasks.find(value => value.id === task.id);
				if (!after) throw new PhoneProtocolError("not_found", "This chat no longer exists on this computer.");
				return okResponse(request, { chat: phoneChat(after, overview.projects, this.now()) });
			}
			case "set_chat": {
				this.chatOverview(request.chatId);
				const { id: _id, type: _type, ...input } = request;
				await this.host.setChat(input);
				const overview = this.chatOverview(request.chatId);
				return okResponse(request, { chat: phoneDetail(this.host.task(request.chatId), overview, this.host.overview().projects) });
			}
			case "queue": {
				this.chatOverview(request.chatId);
				const { chatId: id, messageId } = request;
				const queued = this.host.task(id).queue.find(message => message.id === messageId);
				if (!queued) throw new PhoneProtocolError("not_found", "That message has already been sent or removed.");
				if (request.action === "edit" && queued.text.length > queuedChars) throw new PhoneProtocolError("rejected", "This message is too long to edit on a phone. Edit it on the computer.");
				await command(request.action === "remove" ? { type: "queue-remove", id, messageId }
					: request.action === "edit" ? { type: "queue-edit", id, messageId, text: request.text }
					: request.action === "steer" ? { type: "steer", id, text: queued.text, queuedId: messageId }
					: { type: "queue-move", id, messageId, direction: request.action });
				return okResponse(request, { chatId: id });
			}
			case "git_status": {
				this.allowed("code");
				this.checkProject(request.projectId);
				const [status, pullRequest] = await Promise.all([
					this.host.gitStatus(request.projectId),
					// From 6, and only when asked: it asks GitHub, which a sidebar's folder headings don't need.
					request.pullRequest && this.protocol >= 6 ? this.host.branchPullRequest(request.projectId).then(phoneBranchPullRequest, () => null) : undefined,
				]);
				// Read code can be turned off while git runs; nothing read before then goes out after.
				this.allowed("code");
				return okResponse(request, { ...phoneGitStatus(status), ...pullRequest !== undefined && status ? { pullRequest } : {} });
			}
			case "list_branches": {
				this.allowed("code");
				this.checkProject(request.projectId);
				const { current, local, remote } = await this.host.branches(request.projectId);
				this.allowed("code");
				return okResponse(request, { current, local, remote });
			}
			case "git_action": {
				this.changes(request.projectId);
				await this.host.gitCommand(request.projectId, phoneGitCommand(request));
				// It happened, so the window hears of it even if the phone loses the right to the answer.
				this.host.fromPhone({ device: this.device.name, summary: phoneGitSummary(request), projectId: request.projectId });
				const status = await this.host.gitStatus(request.projectId);
				this.changes();
				return okResponse(request, phoneGitStatus(status));
			}
			case "commit_message": {
				this.changes(request.projectId);
				const message = await this.host.commitMessage(request.projectId);
				this.changes();
				if (!message.trim()) throw new Error("The title model didn't write a message. Write one yourself.");
				return okResponse(request, { message });
			}
			case "create_pull_request": {
				this.changes(request.projectId);
				// The chat's work log writes the published description, so it must be this project's chat.
				if (request.chatId && this.chatOverview(request.chatId).projectId !== request.projectId) throw new PhoneProtocolError("rejected", "That thread is in another project.");
				const { repository, number, url, status } = await this.host.createPullRequest(request.projectId, request.chatId);
				this.host.fromPhone({ device: this.device.name, summary: `${status === "created" ? "Created" : "Linked"} pull request #${number}`, projectId: request.projectId });
				this.changes();
				return okResponse(request, { repository, number, url, status });
			}
			case "list_pull_requests": {
				this.allowed("code");
				this.checkProject(request.projectId);
				const page = await this.host.pullRequests(request.projectId, request.cursor);
				this.allowed("code");
				return okResponse(request, { repository: page.repository, pullRequests: page.requests.map(phonePullRequest), ...page.nextCursor ? { cursor: page.nextCursor } : {}, limitReached: page.limitReached });
			}
			case "read_pull_request": {
				this.allowed("code");
				this.checkProject(request.projectId);
				const view = await this.host.pullRequest(request.projectId, request.number);
				this.allowed("code");
				return okResponse(request, phonePullRequestView(view, this.host.mergeMethod(request.projectId)));
			}
			case "pull_request_files": {
				this.allowed("code");
				this.checkProject(request.projectId);
				const page = await this.host.pullRequestFiles(request.projectId, { number: request.number, headOid: request.headOid, baseOid: request.baseOid, page: request.page ?? 1 });
				this.allowed("code");
				return okResponse(request, phonePullRequestFiles(page));
			}
			case "pr_action": {
				this.changes(request.projectId);
				const view = await this.host.pullRequestAction(request.projectId, phonePullRequestAction(request.number, request.headOid, request.action));
				this.host.fromPhone({ device: this.device.name, summary: phonePullRequestSummary(request.number, request.action), projectId: request.projectId });
				this.changes();
				return okResponse(request, phonePullRequestView(view, this.host.mergeMethod(request.projectId)));
			}
			case "read_diff": {
				this.allowed("code");
				const { projectId, diff } = this.diffRequest(request);
				const result = await this.host.diff(projectId, diff);
				this.allowed("code");
				return okResponse(request, phoneDiff(result));
			}
			case "read_diff_file": {
				this.allowed("code");
				const { projectId, diff } = this.diffRequest(request);
				const result = await this.host.diff(projectId, diff);
				this.allowed("code");
				if (result.hash !== request.hash) throw new Error("The changes moved on. Read the review again to see the latest.");
				const file = phoneDiffFile(result, request.path);
				if (!file) throw new PhoneProtocolError("not_found", "That file isn't in these changes any more.");
				return okResponse(request, { file });
			}
			case "list_files": {
				this.allowed("code");
				const projectId = this.fileProject(request);
				const listing = await this.host.files(projectId, request.query !== undefined ? { type: "search", query: request.query } : { type: "list", directory: request.directory ?? "" });
				// As with git reads: nothing read before Read code was turned off goes out after.
				this.allowed("code");
				return okResponse(request, phoneFileList(listing));
			}
			case "read_file": {
				this.allowed("code");
				const file = await this.host.readFile(this.fileProject(request), request.path);
				this.allowed("code");
				return okResponse(request, file);
			}
			case "list_terminals": {
				const chat = this.terminalChat(request.chatId);
				return okResponse(request, { terminals: chatTerminals(this.host.terminals(), chat.id), scripts: chat.projectId ? phoneScripts(this.host.scripts(chat.projectId)) : [] });
			}
			case "open_terminal": {
				const chat = this.terminalChat(request.chatId), projectId = chat.projectId;
				if (!projectId) throw new PhoneProtocolError("not_found", "This thread isn't in a project, so it has no folder to open a terminal in.");
				const before = new Set(this.host.terminals().map(session => session.id));
				// The window's own open: the chat's folder (its worktree's when it has one), numbered as the window numbers them.
				const opened = this.host.terminal({ type: "open", projectId, taskId: chat.id, ...request.scriptId ? { scriptId: request.scriptId } : {} }).find(session => !before.has(session.id) && session.taskId === chat.id);
				if (!opened) throw new Error("The terminal was opened but could not be read.");
				this.host.fromPhone({ device: this.device.name, summary: `Opened ${opened.title}`, projectId });
				return okResponse(request, { terminal: phoneTerminal(opened) });
			}
			case "attach_terminal": {
				const session = this.terminalOf(request.terminalId);
				this.detachTerminal(session.id);
				// A finished terminal's transcript is read once; only a running one streams.
				if (session.status !== "running") return okResponse(request, { terminal: phoneTerminal(session), ...terminalReplay(session.output) });
				const watch: TerminalWatch = { detach: () => {}, pending: "", skipped: false, sent: "" };
				const attached = this.host.attachTerminal(session.id, this.device.name, event => this.terminalEvent(session.id, watch, event));
				watch.detach = attached.detach; watch.sent = signature(phoneTerminal(attached.session));
				this.terminals.set(session.id, watch);
				return okResponse(request, { terminal: phoneTerminal(attached.session), ...terminalReplay(attached.output) });
			}
			case "detach_terminal":
				// Always allowed: it only stops what the phone hears.
				this.detachTerminal(request.terminalId);
				return okResponse(request, { terminalId: request.terminalId });
			case "terminal_input": {
				const session = this.terminalOf(request.terminalId);
				if (session.status !== "running") throw new PhoneProtocolError("rejected", "This terminal has exited.");
				this.host.terminal({ type: "write", id: session.id, data: request.data });
				return okResponse(request, { terminalId: session.id });
			}
			case "close_terminal": {
				const session = this.terminalOf(request.terminalId);
				if (session.status !== "running") throw new PhoneProtocolError("rejected", "This terminal has already exited.");
				this.host.terminal({ type: "close", id: session.id });
				this.host.fromPhone({ device: this.device.name, summary: `Closed ${session.title}`, ...session.projectId ? { projectId: session.projectId } : {} });
				return okResponse(request, { terminalId: session.id });
			}
			case "list_servers": {
				const chat = this.terminalChat(request.chatId);
				const servers = await this.host.servers(chat.id);
				this.allowed("code"); this.allowed("terminal");
				return okResponse(request, { servers: phoneServers(servers) });
			}
			case "stop_server": {
				const chat = this.terminalChat(request.chatId);
				// stopThreadServer looks the port up again among the chat's own servers, so a port that changed hands is left alone.
				// Checked again after the lookup, so a phone switched off or removed meanwhile kills nothing.
				const stopped = await this.host.stopServer(chat.id, request.port, () => { if (this.closed) throw forbidden(); this.allowed("code"); this.allowed("terminal"); });
				// It happened, so the window hears of it even if the phone loses the right to the answer.
				this.host.fromPhone({ device: this.device.name, summary: `Stopped ${stopped.process ?? "the server"} on port ${stopped.port}`, ...chat.projectId ? { projectId: chat.projectId } : {} });
				const servers = await this.host.servers(chat.id);
				this.allowed("code"); this.allowed("terminal");
				return okResponse(request, { servers: phoneServers(servers) });
			}
			case "subscribe": {
				const listed = new Set(phoneChats(this.host.overview()).map(task => task.id));
				const chatIds = request.chatIds.filter(id => listed.has(id));
				for (const id of [...this.subscribed]) if (!chatIds.includes(id)) { this.subscribed.delete(id); this.seen.delete(id); this.landed.delete(id); }
				for (const id of chatIds) if (!this.subscribed.has(id)) { this.subscribed.add(id); if (!this.seen.has(id)) this.seen.set(id, this.latestSignatures(id)); }
				return okResponse(request, { chatIds });
			}
		}
	}

	private allowed(capability: PhoneCapability) { if (!this.capabilities().includes(capability)) throw forbidden(); }
	private get usesTerminals() { const allowed = this.capabilities(); return allowed.includes("code") && allowed.includes("terminal"); }
	/** Terminals need Read code too, as Make changes does: a shell can read every file the project has. */
	private terminalChat(chatId: string) { this.allowed("code"); this.allowed("terminal"); return this.chatOverview(chatId); }
	/**
	 * A terminal the phone may use: one of a listed chat's. Never a sign-in terminal, a project's own or a scratch one,
	 * whose ids the phone is never given.
	 */
	private terminalOf(id: string) {
		this.allowed("code"); this.allowed("terminal");
		const session = this.host.terminals().find(value => value.id === id);
		if (!session || session.ephemeral || !session.taskId) throw new PhoneProtocolError("not_found", "This terminal is no longer on the computer.");
		this.chatOverview(session.taskId);
		return session;
	}
	private terminalEvent(id: string, watch: TerminalWatch, event: TerminalEvent) {
		if (this.closed || this.terminals.get(id) !== watch) return;
		if (event.data) {
			watch.pending += event.data;
			if (watch.pending.length > terminalPendingChars) { watch.pending = watch.pending.slice(-terminalPendingChars); watch.skipped = true; }
		}
		if (event.session) watch.session = event.session;
		this.schedule();
	}
	private detachTerminal(id: string) { const watch = this.terminals.get(id); if (!watch) return; this.terminals.delete(id); watch.detach(); }
	private detachTerminals() { for (const id of [...this.terminals.keys()]) this.detachTerminal(id); }
	/** Each watched terminal's output since the last batch, cut to one frame, then its session when that changed. */
	private flushTerminals() {
		// Use terminals switched off: the phone stops hearing them at once, and the window stops naming it.
		if (!this.usesTerminals) { this.detachTerminals(); return; }
		for (const [id, watch] of [...this.terminals]) {
			if (watch.pending) {
				const { data, cut } = latestOutput(watch.pending, terminalOutputBudget);
				this.send({ type: "terminal_output", terminalId: id, data, ...cut || watch.skipped ? { skipped: true as const } : {} });
				watch.pending = ""; watch.skipped = false;
			}
			const session = watch.session;
			if (!session) continue;
			watch.session = undefined;
			const terminal = phoneTerminal(session), mark = signature(terminal);
			if (mark !== watch.sent) { watch.sent = mark; this.send({ type: "terminal_updated", terminal }); }
			if (session.status !== "running") this.detachTerminal(id);
		}
	}
	/** Making changes needs Read code too: every one of them answers with what the code looks like after. */
	private changes(projectId?: string) {
		this.allowed("code"); this.allowed("changes");
		if (projectId) this.checkProject(projectId);
	}
	/**
	 * The folder and comparison a diff request names. A chat's diff is in its own project, its worktree's when it has
	 * one; a turn's snapshots come from the chat's message, never from the phone.
	 */
	private diffRequest(request: PhoneDiffTarget): { projectId: string; diff: GitDiffRequest } {
		const projectId = request.chatId ? this.chatOverview(request.chatId).projectId : request.projectId;
		if (!projectId) throw new PhoneProtocolError("not_found", "This thread isn't in a project, so it has no changes to review.");
		if (!request.chatId) this.checkProject(projectId);
		if (request.scope === "uncommitted") return { projectId, diff: { scope: "uncommitted" } };
		if (request.scope === "branch") return { projectId, diff: { scope: "branch", ...request.baseRef ? { baseRef: request.baseRef } : {} } };
		const messages = this.host.task(request.chatId!).messages.filter(message => message.role === "user" && message.checkpoint?.after);
		const message = request.messageId ? messages.find(value => value.id === request.messageId) : messages.at(-1);
		if (!message) throw new PhoneProtocolError("not_found", request.messageId ? "That turn has no saved snapshots to compare." : "No turn in this thread has saved snapshots yet.");
		return { projectId, diff: { scope: "turn", from: message.checkpoint!.before, to: message.checkpoint!.after! } };
	}
	/** The project whose folder a file request reads: a chat's own (its worktree's when it has one), or one still on the computer. */
	private fileProject(request: PhoneFileTarget) {
		const projectId = request.chatId ? this.chatOverview(request.chatId).projectId : request.projectId;
		if (!projectId) throw new PhoneProtocolError("not_found", "This thread isn't in a project, so it has no files to show.");
		if (!request.chatId) this.checkProject(projectId);
		return projectId;
	}
	/** The person changed this phone's capabilities; a phone that knows the event hears them at once. */
	accessChanged() {
		if (this.closed) return;
		if (!this.usesTerminals) this.detachTerminals();
		if (this.protocol >= 4) this.send({ type: "access", capabilities: [...this.capabilities()] });
	}
	private checkProject(projectId: string | undefined) {
		if (projectId && !this.host.overview().projects.some(project => project.id === projectId && !project.worktree?.removedAt)) throw new PhoneProtocolError("not_found", "That project isn't on this computer any more.");
	}
	/** A chat the phone may organise: top level, archived or not. An agent's or side chat goes with its parent. */
	private organisable(id: string) {
		const task = topLevelChats(this.host.overview()).find(value => value.id === id);
		if (!task) throw new PhoneProtocolError("not_found", "This chat no longer exists on this computer.");
		return task;
	}
	/** Each turn's changed files on its person's message, as far as they've been read; a read that lands sends the chat's entries again. */
	private decorate(chatId: string, projectId: string | undefined, messages: readonly Message[], entries: PhoneEntry[]) {
		if (!projectId) return entries;
		return withTurnChanges(entries, messages, (checkpoint, entry) => this.turnChanges.get(projectId, checkpoint, () => {
			if (this.closed || !this.subscribed.has(chatId)) return;
			const message = messages.find(value => value.id === entry.id)!, landed = this.landed.get(chatId) ?? new Map();
			this.landed.set(chatId, landed.set(entry.id, { entry, message }));
			this.dirtyEntries.add(chatId); this.schedule();
		}));
	}
	/** A chat the phone may use: listed (top level, not archived). */
	private chatOverview(id: string) {
		const task = phoneChats(this.host.overview()).find(value => value.id === id);
		if (!task) throw new PhoneProtocolError("not_found", "This chat no longer exists on this computer.");
		return task;
	}
	private latestEntries(id: string) {
		const page = this.host.page({ taskId: id, kind: "messages", limit: phoneLimits.pageSize });
		return this.decorate(id, this.host.overview().tasks.find(task => task.id === id)?.projectId, page.entries as Message[], readingOrder(page.entries as Message[], (page.activities ?? []) as AgentActivity[]));
	}
	private latestSignatures(id: string) { try { return new Map(this.latestEntries(id).map(entry => [entry.id, signature(entry)])); } catch { return new Map<string, string>(); } }

	/** The app's chats changed: notes what this phone should hear about and sends it within the batch window. */
	changed(before: ReadonlyMap<string, TaskOverview>, after: WorkspaceOverview) {
		if (this.closed) return;
		for (const task of topLevelChats(after)) {
			const previous = before.get(task.id);
			// An archived chat (or one restored) reaches only the phones that already had it.
			if (task.archived && (!previous || previous.archived) && !this.sentChats.has(task.id)) continue;
			if (this.subscribed.has(task.id) && previous?.revision !== task.revision) this.dirtyEntries.add(task.id);
			// New to the list (just started, or restored from the archive), or a row the phone has.
			if (!previous || (previous.archived && !task.archived) || this.sentChats.has(task.id) || this.subscribed.has(task.id)) this.dirtyChats.add(task.id);
		}
		if (this.dirtyChats.size || this.dirtyEntries.size) this.schedule();
	}
	attention(event: Attention) { if (!this.closed) this.send({ type: "attention", ...event }); }
	/** The project list as it is now; sent only to a phone that has read it (older phones don't know the event), and only when it differs. */
	projectsChanged(projects: PhoneProject[], mark: string) {
		if (this.closed || this.sentProjects === undefined || this.sentProjects === mark) return;
		this.sentProjects = mark;
		this.send({ type: "projects_changed", projects });
	}
	get listensToProjects() { return this.sentProjects !== undefined; }

	private schedule() {
		if (this.timer) return;
		const wait = Math.max(0, this.lastFlush + phoneLimits.entriesBatchMs - this.now());
		this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, wait);
		this.timer.unref?.();
	}
	/** Sends the batch now. */
	flush() {
		if (this.closed) return;
		this.lastFlush = this.now();
		const overview = this.host.overview(), chats = new Map(topLevelChats(overview).map(task => [task.id, task]));
		for (const id of this.dirtyChats) {
			const task = chats.get(id);
			if (!task) continue;
			try {
				const chat = this.subscribed.has(id) && !task.archived ? phoneDetail(this.host.task(id), task, overview.projects) : phoneChat(task, overview.projects, this.now()), mark = signature(chat);
				if (this.sentChats.get(id) !== mark) { this.sentChats.set(id, mark); this.send({ type: "chat_updated", chat }); }
			} catch { /* Deleted since; the list drops it on the phone's next read. */ }
		}
		this.dirtyChats.clear();
		for (const id of this.dirtyEntries) {
			if (!this.subscribed.has(id) || !chats.has(id) || chats.get(id)!.archived) continue;
			try {
				const seen = this.seen.get(id) ?? new Map<string, string>(), changed = [], latest = this.latestEntries(id);
				// An earlier page the phone loaded isn't read again: only its entries whose changes landed go out.
				const inLatest = new Set(latest.map(entry => entry.id)), landed = [...this.landed.get(id)?.values() ?? []].filter(value => !inLatest.has(value.entry.id));
				this.landed.delete(id);
				const earlier = this.decorate(id, chats.get(id)!.projectId, landed.map(value => value.message), landed.map(value => value.entry)).filter(entry => "changes" in entry);
				for (const entry of [...earlier, ...latest]) { const mark = signature(entry); if (seen.get(entry.id) !== mark) { seen.set(entry.id, mark); changed.push(entry); } }
				this.seen.set(id, seen);
				for (const entries of entryFrames(changed)) this.send({ type: "entries", chatId: id, entries });
			} catch { /* Deleted since. */ }
		}
		this.dirtyEntries.clear();
		if (this.terminals.size) this.flushTerminals();
	}
	close() {
		if (this.closed) return;
		this.closed = true; clearTimeout(this.timer);
		// However the connection ends, a phone that's gone is never left named in the window's terminals.
		this.detachTerminals();
		for (const listener of this.closeListeners) listener();
	}
	whenClosed(listener: () => void) { if (this.closed) listener(); else this.closeListeners.push(listener); }
	get isClosed() { return this.closed; }
}

/**
 * Every phone connection, on both transports. It watches the app's chats once for all of them, and raises attention
 * (an approval, a question, a finished or failed chat) to every connected phone and, through onAttention, to the
 * paired phones that aren't connected, which Phaseo Connect holds for.
 */
export class PhoneHub {
	private readonly sessions = new Set<PhoneSession>();
	private readonly rates = new Map<string, RequestRate>();
	private last = new Map<string, TaskOverview>();
	private projectsKey?: string;
	private readonly turnChanges: TurnChangesCache;
	onAttention?: (event: Attention, connected: ReadonlySet<string>) => void;
	/** Each paired phone's capabilities, read on every request (PhoneService sets it from Settings → Phone). */
	capabilitiesOf: (deviceId: string) => readonly PhoneCapability[] = () => [];
	constructor(private readonly host: PhoneHost, private readonly now: () => number = Date.now) {
		const overview = host.overview();
		this.last = new Map(overview.tasks.map(task => [task.id, task]));
		this.projectsKey = signature(overview.projects);
		this.turnChanges = new TurnChangesCache(host.turnChanges);
	}
	open(device: PhoneDevice, send: (frame: DesktopFrame) => void) {
		// One budget per device, however many sockets it opens.
		let rate = this.rates.get(device.id);
		if (!rate) { rate = new RequestRate(this.now); this.rates.set(device.id, rate); }
		const session = new PhoneSession(device, this.host, send, rate, this.now, this.turnChanges, () => this.capabilitiesOf(device.id));
		this.sessions.add(session);
		session.whenClosed(() => this.sessions.delete(session));
		return session;
	}
	/** Ends every connection of a device that was removed. */
	closeDevice(deviceId: string) { for (const session of [...this.sessions]) if (session.device.id === deviceId) session.close(); this.rates.delete(deviceId); }
	closeAll() { for (const session of [...this.sessions]) session.close(); }
	/** A device's capabilities changed: each of its connections hears them, and its next request is checked against them. */
	accessChanged(deviceId: string) { for (const session of this.sessions) if (session.device.id === deviceId) session.accessChanged(); }
	/**
	 * The overview changes with every streamed token, so the projects are compared by their own fields first, and the
	 * phone's rows (which look at the disk) are built only when those changed and a phone is listening.
	 */
	private projectsChanged(overview: WorkspaceOverview) {
		const key = signature(overview.projects);
		if (key === this.projectsKey) return;
		this.projectsKey = key;
		const listening = [...this.sessions].filter(session => session.listensToProjects);
		if (!listening.length) return;
		const projects = phoneProjects(overview.projects, this.host.isRepository), mark = signature(projects);
		for (const session of listening) session.projectsChanged(projects, mark);
	}
	connectedDevices() { return new Set([...this.sessions].map(session => session.device.id)); }
	overviewChanged(overview: WorkspaceOverview) {
		const before = this.last;
		this.last = new Map(overview.tasks.map(task => [task.id, task]));
		for (const session of this.sessions) session.changed(before, overview);
		this.projectsChanged(overview);
		for (const task of overview.tasks) {
			const attention = attentionOf(before.get(task.id), task);
			if (!attention) continue;
			const event = { chatId: task.id, ...attention };
			for (const session of this.sessions) session.attention(event);
			this.onAttention?.(event, this.connectedDevices());
		}
	}
}
