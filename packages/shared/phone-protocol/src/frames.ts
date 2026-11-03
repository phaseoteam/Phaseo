import { utf8Length } from "./base64url";

/**
 * The frames a phone and a desktop exchange, the same over a direct WebSocket and inside Phaseo Connect envelopes.
 * Requests carry an id; the answer echoes the id and type with `ok` and a result, or `ok: false` and an error.
 */
/**
 * 2 added list_projects, projects_changed and hello's capabilities; 3 added update_chat, set_chat, queue and the
 * archived list. A phone gates each newer frame on hello.protocol, since an older computer answers an unknown request
 * with invalid_frame.
 */
export const phoneProtocolVersion = 3;
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
	/** From protocol 3: messages waiting for the turn to end, in order; the agent the chat runs on (set_chat stays within it); its permissions, which a phone can't change; linked pull requests. */
	queue?: { id: string; text: string }[]; harness?: string; accountId?: string; permissionMode?: PhonePermissionMode; pullRequests?: PhoneLinkedPullRequest[];
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
/** Powers a paired phone has beyond threads, switched on per phone on the computer. Empty until a computer offers them. */
export type PhoneCapability = "code" | "changes" | "terminal";
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
		/** From protocol 2: the agent (one of list_models' agents) the model belongs to; without it, the model is the default agent's. */ harness?: string; accountId?: string; agentId?: string }
	| { id: string; type: "list_models"; projectId?: string; /** From protocol 2: some agents run only in Code (Grok). */ mode?: PhoneChatMode }
	| { id: string; type: "list_projects" }
	| { id: string; type: "subscribe"; chatIds: string[] }
	/** From protocol 3. `title` goes with rename, `until` (an ISO time) with snooze. */
	| { id: string; type: "update_chat"; chatId: string; action: PhoneChatAction; title?: string; until?: string }
	/** From protocol 3: a stopped chat's mode (Code or Plan; a Chat stays one), model (one of its own agent's) or effort. */
	| { id: string; type: "set_chat"; chatId: string; mode?: PhoneChatMode; model?: string; reasoningEffort?: string }
	/** From protocol 3: a queued message removed, edited (`text`), moved, or sent into the running turn now. */
	| { id: string; type: "queue"; chatId: string; messageId: string; action: PhoneQueueAction; text?: string };
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
};
export type PhoneErrorCode = "invalid_frame" | "too_large" | "rate_limited" | "unauthorized" | "not_found" | "rejected" | "internal";
export type PhoneResponse<T extends PhoneRequest["type"] = PhoneRequest["type"]> =
	| { id: string; type: T; ok: true; result: PhoneResults[T] }
	| { id: string; type: T; ok: false; error: { code: PhoneErrorCode; message: string } };
export type DesktopEvent =
	| { type: "chat_updated"; chat: PhoneChat | PhoneChatDetail }
	| { type: "entries"; chatId: string; entries: PhoneEntry[] }
	| { type: "attention"; chatId: string; kind: AttentionKind; summary: string }
	/** The project list changed. Sent only to a phone that has asked list_projects, so older phones never get it. */
	| { type: "projects_changed"; projects: PhoneProject[] }
	| { id?: string; type: "ping" } | { id?: string; type: "pong" };
export type DesktopFrame = PhoneResponse | DesktopEvent;

export class PhoneProtocolError extends Error {
	constructor(readonly code: PhoneErrorCode, message: string, readonly id?: string, readonly type?: string) { super(message); this.name = "PhoneProtocolError"; }
}

const requestTypes = new Set(["hello", "list_chats", "read_chat", "send", "answer_approval", "answer_question", "stop", "new_chat", "list_models", "subscribe", "list_projects", "update_chat", "set_chat", "queue"]);
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
			return {
				id: request, type, text: text_("text"), mode: frame.mode as PhoneChatMode, ...projectId(),
				...frame.model !== undefined ? { model: frame.model as string } : {}, ...frame.reasoningEffort !== undefined ? { reasoningEffort: frame.reasoningEffort as string } : {},
				...agent ? { harness: agent } : {}, ...accountId ? { accountId } : {}, ...agentId ? { agentId } : {},
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
			if (frame.mode === undefined && !model && !reasoningEffort) fail("set_chat needs a mode, model or reasoningEffort.");
			return { id: request, type, chatId: chatId(), ...frame.mode !== undefined ? { mode: frame.mode as PhoneChatMode } : {}, ...model ? { model } : {}, ...reasoningEffort ? { reasoningEffort } : {} };
		}
		case "queue": {
			const action = frame.action as PhoneQueueAction;
			if (!queueActions.includes(action)) fail(`action must be one of ${queueActions.join(", ")}.`);
			if (!validId(frame.messageId)) fail("messageId is required.");
			if (action === "edit") return { id: request, type, chatId: chatId(), messageId: frame.messageId as string, action, text: text_("text") };
			if (frame.text !== undefined) fail("Only edit takes text.");
			return { id: request, type, chatId: chatId(), messageId: frame.messageId as string, action };
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
