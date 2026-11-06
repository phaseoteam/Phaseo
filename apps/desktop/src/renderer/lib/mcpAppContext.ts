/**
 * What MCP Apps in a chat told the agent about what the person did in them (ui/update-model-context): the latest note from
 * each app, sent with the person's next message in that chat and then cleared.
 */
const notes = new Map<string, Map<string, { title: string; text: string }>>();

export function setAppContext(taskId: string, appId: string, title: string, text: string) {
	const chat = notes.get(taskId) ?? new Map<string, { title: string; text: string }>();
	if (text.trim()) chat.set(appId, { title, text: text.trim() }); else chat.delete(appId);
	notes.set(taskId, chat);
}

/** The notes for the next message, as lines after it, or "" when there are none; taking them clears them. */
export function takeAppContext(taskId: string) {
	const chat = notes.get(taskId);
	notes.delete(taskId);
	if (!chat?.size) return "";
	return [...chat.values()].map(note => `\n\n[What I did in ${note.title}: ${note.text}]`).join("");
}
