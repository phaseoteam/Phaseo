import type { Message, Task } from "./workspace";

/**
 * Side chats: a question asked beside a chat without adding to it. A side chat is a hidden child of its chat
 * (`delegation.kind === "side"`), copied from the chat's conversation; `delegation.sourceMessageId` is the last
 * copied message, so what comes after it is the side chat's own.
 */
export const isSideChat = (task: Pick<Task, "delegation">) => task.delegation?.kind === "side";

/** `/side question` or `/btw question` as the whole message; the question may be empty. */
export function parseSideChatCommand(text: string): { prompt: string } | undefined {
	const match = /^\/(?:side|btw)(?:\s+([\s\S]*))?$/i.exec(text.trim());
	return match ? { prompt: match[1]?.trim() ?? "" } : undefined;
}

/** A short title from the question, or a plain one for a side chat started empty. */
export function sideChatTitle(prompt: string) {
	const line = prompt.replace(/\s+/g, " ").trim();
	return line ? (line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line) : "Side chat";
}

/** The messages the side chat added after the conversation it was copied from. */
export function sideChatOwnMessages(task: Pick<Task, "delegation" | "messages">): Message[] {
	const boundary = task.delegation?.sourceMessageId;
	if (!boundary) return task.messages;
	const index = task.messages.findIndex(message => message.id === boundary);
	return index < 0 ? [] : task.messages.slice(index + 1);
}

/** Never sent anything: closing it deletes it. */
export const sideChatUnused = (task: Pick<Task, "delegation" | "messages" | "queue" | "status">) =>
	task.status !== "running" && task.status !== "waiting" && !task.queue.length && !sideChatOwnMessages(task).length;

/** Why Bring back is not available yet, or undefined when it is. */
export function bringBackBlocker(task: Pick<Task, "delegation" | "messages" | "status" | "archived">): string | undefined {
	if (task.status === "running" || task.status === "waiting") return "Available when the side chat has finished its reply.";
	if (!sideChatOwnMessages(task).some(message => message.role === "assistant" && message.text.trim())) return "Available after the side chat has replied.";
}

const bringBackLimit = 32_000;

/**
 * What the main chat receives from Bring back: the side chat's own questions and replies, newest kept when they run
 * long. It is the person's own conversation, so it is context for the work rather than untrusted data.
 */
export function bringBackText(title: string, messages: readonly Pick<Message, "role" | "text" | "notice">[]) {
	const lines = messages.filter(message => (message.role === "user" || message.role === "assistant") && !message.notice && message.text.trim())
		.map(message => `${message.role === "user" ? "Person" : "Side chat"}: ${message.text.trim()}`);
	const kept: string[] = [];
	let size = 0;
	for (const line of [...lines].reverse()) {
		if (size + line.length > bringBackLimit) { if (!kept.length) kept.unshift(line.slice(-bringBackLimit)); break; }
		kept.unshift(line); size += line.length + 2;
	}
	return [
		`The person asked about this chat in a side chat ("${title}") and brought back what they learned there. Take it into account in your work here; it is not a new request unless the person asks for something in it.`,
		"",
		"<side-chat>",
		...(kept.length < lines.length ? ["(Earlier messages left out.)", ""] : []),
		kept.join("\n\n"),
		"</side-chat>",
	].join("\n");
}

/**
 * Sent with a side chat's first own message, so the agent answers the question instead of carrying on with the chat's
 * task in the same folder.
 */
export const sideChatNote = "\n\nThis is a side chat beside the person's main chat, started from its conversation above. The main chat may still be working in the same folder. Answer this question; do not continue or redo the main chat's task, and change files or run commands only if the person asks you to.";

/** The note for `messageId` when it is the side chat's first message of its own; empty otherwise. */
export function sideChatNoteFor(task: Pick<Task, "delegation" | "messages">, messageId: string) {
	if (!isSideChat(task)) return "";
	return sideChatOwnMessages(task).find(message => message.role === "user")?.id === messageId ? sideChatNote : "";
}
