import { utf8Length } from "./base64url";

/**
 * The frames a phone and a desktop exchange, the same over a direct WebSocket and inside Phaseo Connect envelopes.
 * Requests carry an id; the answer echoes the id and type with `ok` and a result, or `ok: false` and an error.
 */
export const phoneProtocolVersion = 1;
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
export type PhoneChat = { id: string; title: string; mode: PhoneChatMode; status: PhoneChatStatus; updatedAt: string; unread: boolean; needsYou: boolean; /** Why it needs the person, in words. */ attention?: string; projectId?: string; project?: string };
export type PhoneApproval = { id: string; title: string; description: string; /** A proposed plan: its Markdown is the description. */ plan?: true };
export type PhoneQuestionOption = { label: string; description?: string };
export type PhoneQuestion = { id: string; header: string; question: string; multiSelect?: true; isOther?: true; isSecret?: true; options?: PhoneQuestionOption[] };
/** One set of questions; answer_question names it by id and answers each question by its own id. */
export type PhoneQuestionRequest = { id: string; questions: PhoneQuestion[] };
/** A chat with what it is waiting on, for the chat screen. */
export type PhoneChatDetail = PhoneChat & { approvals: PhoneApproval[]; questions: PhoneQuestionRequest[] };
export type PhoneMessage = { kind: "message"; id: string; role: "user" | "assistant" | "system" | "tool"; text: string; createdAt: string; completedAt?: string; delivery?: "steer" | "subagent"; notice?: string; attachments?: { name: string; kind: string }[]; /** The text was cut for the phone. */ truncated?: true };
export type PhoneActivity = { kind: "activity"; id: string; type: "tool" | "reasoning" | "plan" | "usage" | "compaction"; title: string; text: string; status?: "running" | "completed" | "failed"; summary?: string; steps?: { text: string; status: string }[]; truncated?: true };
export type PhoneEntry = PhoneMessage | PhoneActivity;
export type AttentionKind = "approval" | "question" | "done" | "failed";

export type PhoneRequest =
	| { id: string; type: "hello"; deviceId: string; appVersion: string }
	| { id: string; type: "list_chats"; cursor?: string; limit?: number }
	| { id: string; type: "read_chat"; chatId: string; before?: string; limit?: number }
	| { id: string; type: "send"; chatId: string; text: string; steer?: boolean }
	| { id: string; type: "answer_approval"; chatId: string; approvalId: string; decision: "accept" | "decline" }
	| { id: string; type: "answer_question"; chatId: string; questionId: string; answers: Record<string, string[]> }
	| { id: string; type: "stop"; chatId: string }
	| { id: string; type: "new_chat"; text: string; projectId?: string; mode: PhoneChatMode }
	| { id: string; type: "subscribe"; chatIds: string[] };
export type PhoneFrame = PhoneRequest | { id?: string; type: "ping" } | { id?: string; type: "pong" };

export type PhoneResults = {
	hello: { desktopName: string; appVersion: string; protocol: number };
	list_chats: { chats: PhoneChat[]; cursor?: string };
	read_chat: { chat: PhoneChatDetail; entries: PhoneEntry[]; /** Entries before these; pass the first entry's id as `before` to read them. */ earlier: number };
	send: { chatId: string };
	answer_approval: { chatId: string };
	answer_question: { chatId: string };
	stop: { chatId: string };
	new_chat: { chat: PhoneChat };
	subscribe: { chatIds: string[] };
};
export type PhoneErrorCode = "invalid_frame" | "too_large" | "rate_limited" | "unauthorized" | "not_found" | "rejected" | "internal";
export type PhoneResponse<T extends PhoneRequest["type"] = PhoneRequest["type"]> =
	| { id: string; type: T; ok: true; result: PhoneResults[T] }
	| { id: string; type: T; ok: false; error: { code: PhoneErrorCode; message: string } };
export type DesktopEvent =
	| { type: "chat_updated"; chat: PhoneChat | PhoneChatDetail }
	| { type: "entries"; chatId: string; entries: PhoneEntry[] }
	| { type: "attention"; chatId: string; kind: AttentionKind; summary: string }
	| { id?: string; type: "ping" } | { id?: string; type: "pong" };
export type DesktopFrame = PhoneResponse | DesktopEvent;

export class PhoneProtocolError extends Error {
	constructor(readonly code: PhoneErrorCode, message: string, readonly id?: string, readonly type?: string) { super(message); this.name = "PhoneProtocolError"; }
}

const requestTypes = new Set(["hello", "list_chats", "read_chat", "send", "answer_approval", "answer_question", "stop", "new_chat", "subscribe"]);
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
			return { id: request, type, deviceId: frame.deviceId as string, appVersion: frame.appVersion as string };
		}
		case "list_chats": {
			if (frame.cursor !== undefined && !validId(frame.cursor, 400)) fail("Invalid cursor.");
			return { id: request, type, ...frame.cursor !== undefined ? { cursor: frame.cursor as string } : {}, ...limit() };
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
			if (frame.projectId !== undefined && !validId(frame.projectId)) fail("Invalid projectId.");
			return { id: request, type, text: text_("text"), mode: frame.mode as PhoneChatMode, ...frame.projectId !== undefined ? { projectId: frame.projectId as string } : {} };
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
		case "ping": case "pong": return { type: frame.type, ...validId(frame.id, 64) ? { id: frame.id as string } : {} };
	}
	throw new PhoneProtocolError("invalid_frame", "Unknown or invalid desktop frame.");
}

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
