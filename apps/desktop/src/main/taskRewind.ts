import { randomUUID } from "node:crypto";
import type { Message, QueuedMessage, Task } from "../shared/workspace";

/**
 * Rewinds a chat in place to just before one of the person's messages ("Edit from here"): that message and
 * everything after it go, with their turns' steps. Returns the removed message, so it can return to the composer or
 * be sent again. Saving the chat deletes the removed entries from storage.
 *
 * The agent's own session still remembers the removed turns, so it is dropped. The next turn starts a fresh session
 * seeded with the remaining transcript, as a branch from an earlier message does (see handoffPrompt); the Phaseo
 * harness rebuilds its run from the transcript.
 */
export function rewindConversation(task: Task, messageId: string): Message {
	if (task.status === "running" || task.status === "waiting") throw new Error("Stop this chat before rewinding it.");
	if (task.archived) throw new Error("Restore this chat before rewinding it.");
	const index = task.messages.findIndex(message => message.id === messageId);
	const message = task.messages[index];
	if (!message || message.role !== "user" || message.notice || message.delivery === "subagent") throw new Error("This message is no longer available to edit.");
	const turns = (from: number, to?: number) => new Set(task.messages.slice(from, to).filter(item => item.role === "user").map(item => item.id));
	const removed = turns(index), kept = turns(0, index);
	const owner = (id: string) => id.slice(0, Math.max(0, id.indexOf(":")));
	// Activities are stored in order. Steps of a kept turn stay and of a removed one go; one that belongs to no turn
	// goes if it came after the first removed turn began.
	const activities = task.activities ?? [], cut = activities.findIndex(activity => removed.has(owner(activity.id)));
	task.activities = activities.filter((activity, position) => kept.has(owner(activity.id)) || (!removed.has(owner(activity.id)) && (cut < 0 || position < cut)));
	task.messages = task.messages.slice(0, index);
	task.handoffFrom ??= task.harness;
	task.nativeSessionId = undefined; task.nativeForkFrom = undefined;
	task.status = task.messages.length ? "completed" : "idle"; task.error = undefined;
	task.steering = []; task.approvals = []; task.forms = [];
	// Questions answered by message belonged to the removed turns.
	task.questions = task.questions?.filter(request => request.responseMode !== "message");
	if (task.autopilot) { task.autopilot.handback = undefined; task.autopilot.stalls = undefined; }
	return message;
}

/** The removed message queued to send again (Regenerate), under a new id: its old steps are gone. */
export function requeued(message: Message): QueuedMessage {
	return { id: randomUUID(), text: message.text, createdAt: new Date().toISOString(),
		...message.attachments?.length ? { attachments: message.attachments } : {}, ...message.threadReferences?.length ? { threadReferences: message.threadReferences } : {}, ...message.githubReferences?.length ? { githubReferences: message.githubReferences } : {}, ...message.nativeAction ? { nativeAction: message.nativeAction } : {} };
}
