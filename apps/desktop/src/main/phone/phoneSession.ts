import { createHash } from "node:crypto";
import { errorResponse, okResponse, parsePhoneFrame, phoneLimits, phoneProtocolVersion, PhoneProtocolError, RequestRate, type AttentionKind, type DesktopFrame, type PhoneChatMode, type PhoneEntry, type PhoneRequest, type PhoneResponse } from "@phaseo/phone-protocol";
import type { ConversationPage, ConversationPageQuery } from "../../shared/conversationPage";
import { validateCommand, type AgentActivity, type Message, type Task, type WorkspaceCommand } from "../../shared/workspace";
import type { TaskOverview, WorkspaceOverview } from "../../shared/workspaceOverview";
import { attentionOf, chatListPage, phoneChat, phoneChats, phoneDetail, readingOrder } from "./phoneChats";

/** What the phone server needs from the app: the same reads and commands the window uses. */
export type PhoneHost = {
	desktopName: () => string;
	appVersion: string;
	overview: () => WorkspaceOverview;
	/** A chat's header; its messages load only if read. */
	task: (id: string) => Task;
	page: (query: ConversationPageQuery) => ConversationPage;
	command: (command: WorkspaceCommand) => Promise<unknown>;
	/** Starts a chat with the project's or the app's defaults and sends its first message; returns its id. */
	newChat: (input: { text: string; projectId?: string; mode: PhoneChatMode }) => Promise<string>;
};
export type PhoneDevice = { id: string; name: string };
export type Attention = { chatId: string; kind: AttentionKind; summary: string };

const signature = (value: unknown) => createHash("sha1").update(JSON.stringify(value)).digest("base64");
const message = (error: unknown) => error instanceof Error ? error.message : "That didn't work.";
/** Room left in a frame for its other fields and encryption, so entries never push one over phoneLimits.frameBytes. */
const entriesBudget = phoneLimits.frameBytes - 64 * 1024;
const size = (entry: PhoneEntry) => Buffer.byteLength(JSON.stringify(entry)) + 1;
/** Entries split into frames that each fit. */
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
	private readonly dirtyEntries = new Set<string>();
	private timer?: ReturnType<typeof setTimeout>;
	private lastFlush = 0;
	private closed = false;
	private readonly closeListeners: (() => void)[] = [];
	constructor(readonly device: PhoneDevice, private readonly host: PhoneHost, private readonly send: (frame: DesktopFrame) => void, private readonly rate: RequestRate, private readonly now: () => number = Date.now) {}

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
			case "hello":
				if (request.deviceId !== this.device.id) throw new PhoneProtocolError("unauthorized", "This device signed in as another.");
				return okResponse(request, { desktopName: this.host.desktopName(), appVersion: this.host.appVersion, protocol: phoneProtocolVersion });
			case "list_chats": {
				const page = chatListPage(this.host.overview(), request.cursor, request.limit ?? phoneLimits.pageSize);
				for (const chat of page.chats) if (!this.subscribed.has(chat.id)) this.sentChats.set(chat.id, signature(chat));
				return okResponse(request, page);
			}
			case "read_chat": {
				const overview = this.chatOverview(request.chatId);
				const page = this.host.page({ taskId: request.chatId, kind: "messages", limit: request.limit ?? phoneLimits.pageSize, ...request.before ? { beforeId: request.before } : {} });
				const ordered = readingOrder(page.entries as Message[], page.activities ?? []), entries = latestFitting(ordered);
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
				if (request.projectId && !this.host.overview().projects.some(project => project.id === request.projectId && !project.worktree?.removedAt)) throw new PhoneProtocolError("not_found", "That project isn't on this computer any more.");
				const id = await this.host.newChat({ text: request.text, mode: request.mode, ...request.projectId ? { projectId: request.projectId } : {} });
				const overview = this.host.overview(), task = overview.tasks.find(value => value.id === id);
				if (!task) throw new Error("The chat was started but could not be read.");
				return okResponse(request, { chat: phoneChat(task, overview.projects) });
			}
			case "subscribe": {
				const listed = new Set(phoneChats(this.host.overview()).map(task => task.id));
				const chatIds = request.chatIds.filter(id => listed.has(id));
				for (const id of [...this.subscribed]) if (!chatIds.includes(id)) { this.subscribed.delete(id); this.seen.delete(id); }
				for (const id of chatIds) if (!this.subscribed.has(id)) { this.subscribed.add(id); if (!this.seen.has(id)) this.seen.set(id, this.latestSignatures(id)); }
				return okResponse(request, { chatIds });
			}
		}
	}

	/** A chat the phone may use: listed (top level, not archived). */
	private chatOverview(id: string) {
		const task = phoneChats(this.host.overview()).find(value => value.id === id);
		if (!task) throw new PhoneProtocolError("not_found", "This chat no longer exists on this computer.");
		return task;
	}
	private latestEntries(id: string) {
		const page = this.host.page({ taskId: id, kind: "messages", limit: phoneLimits.pageSize });
		return readingOrder(page.entries as Message[], (page.activities ?? []) as AgentActivity[]);
	}
	private latestSignatures(id: string) { try { return new Map(this.latestEntries(id).map(entry => [entry.id, signature(entry)])); } catch { return new Map<string, string>(); } }

	/** The app's chats changed: notes what this phone should hear about and sends it within the batch window. */
	changed(before: ReadonlyMap<string, TaskOverview>, after: WorkspaceOverview) {
		if (this.closed) return;
		for (const task of phoneChats(after)) {
			const previous = before.get(task.id);
			if (this.subscribed.has(task.id) && previous?.revision !== task.revision) this.dirtyEntries.add(task.id);
			if (!previous || this.sentChats.has(task.id) || this.subscribed.has(task.id)) this.dirtyChats.add(task.id);
		}
		if (this.dirtyChats.size || this.dirtyEntries.size) this.schedule();
	}
	attention(event: Attention) { if (!this.closed) this.send({ type: "attention", ...event }); }

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
		const overview = this.host.overview(), chats = new Map(phoneChats(overview).map(task => [task.id, task]));
		for (const id of this.dirtyChats) {
			const task = chats.get(id);
			if (!task) continue;
			try {
				const chat = this.subscribed.has(id) ? phoneDetail(this.host.task(id), task, overview.projects) : phoneChat(task, overview.projects), mark = signature(chat);
				if (this.sentChats.get(id) !== mark) { this.sentChats.set(id, mark); this.send({ type: "chat_updated", chat }); }
			} catch { /* Deleted since; the list drops it on the phone's next read. */ }
		}
		this.dirtyChats.clear();
		for (const id of this.dirtyEntries) {
			if (!this.subscribed.has(id) || !chats.has(id)) continue;
			try {
				const seen = this.seen.get(id) ?? new Map<string, string>(), changed = [];
				for (const entry of this.latestEntries(id)) { const mark = signature(entry); if (seen.get(entry.id) !== mark) { seen.set(entry.id, mark); changed.push(entry); } }
				this.seen.set(id, seen);
				for (const entries of entryFrames(changed)) this.send({ type: "entries", chatId: id, entries });
			} catch { /* Deleted since. */ }
		}
		this.dirtyEntries.clear();
	}
	close() {
		if (this.closed) return;
		this.closed = true; clearTimeout(this.timer);
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
	onAttention?: (event: Attention, connected: ReadonlySet<string>) => void;
	constructor(private readonly host: PhoneHost, private readonly now: () => number = Date.now) { this.last = new Map(host.overview().tasks.map(task => [task.id, task])); }
	open(device: PhoneDevice, send: (frame: DesktopFrame) => void) {
		// One budget per device, however many sockets it opens.
		let rate = this.rates.get(device.id);
		if (!rate) { rate = new RequestRate(this.now); this.rates.set(device.id, rate); }
		const session = new PhoneSession(device, this.host, send, rate, this.now);
		this.sessions.add(session);
		session.whenClosed(() => this.sessions.delete(session));
		return session;
	}
	/** Ends every connection of a device that was removed. */
	closeDevice(deviceId: string) { for (const session of [...this.sessions]) if (session.device.id === deviceId) session.close(); this.rates.delete(deviceId); }
	closeAll() { for (const session of [...this.sessions]) session.close(); }
	connectedDevices() { return new Set([...this.sessions].map(session => session.device.id)); }
	overviewChanged(overview: WorkspaceOverview) {
		const before = this.last;
		this.last = new Map(overview.tasks.map(task => [task.id, task]));
		for (const session of this.sessions) session.changed(before, overview);
		for (const task of overview.tasks) {
			const attention = attentionOf(before.get(task.id), task);
			if (!attention) continue;
			const event = { chatId: task.id, ...attention };
			for (const session of this.sessions) session.attention(event);
			this.onAttention?.(event, this.connectedDevices());
		}
	}
}
