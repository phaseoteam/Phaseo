/** Fired with `{ text }` to put a task in the new-chat composer; NewChat listens, and the stored draft covers a composer not yet open. */
export const newChatDraftEvent = "phaseo:new-chat-draft";
export const newChatDraftKey = "phaseo.desktop.newChatDraft";
export function handNewChatDraft(text: string) {
	try { window.localStorage.setItem(newChatDraftKey, JSON.stringify(text)); } catch { /* The event still reaches an open composer. */ }
	window.dispatchEvent(new CustomEvent(newChatDraftEvent, { detail: { text } }));
}
