import { mentionToken } from "../lib/mentions";
import type { Message } from "../../shared/workspace";

/** Edit from here puts a message back in the composer, chips included: its attachments return as attachment chips. */
export function rewoundDraft(message: Pick<Message, "text" | "attachments">) {
	const chips = (message.attachments ?? []).map(attachment => mentionToken({ kind: "attachment", ref: attachment.id, label: attachment.name }));
	return [message.text, chips.join(" ")].filter(Boolean).join(message.text && chips.length ? "\n" : "");
}

/** The composer listens for this to take back a rewound message: `{ taskId, text }`. */
export const restoreDraftEvent = "phaseo:restore-draft";
export const restoreDraft = (taskId: string, text: string) => window.dispatchEvent(new CustomEvent(restoreDraftEvent, { detail: { taskId, text } }));
