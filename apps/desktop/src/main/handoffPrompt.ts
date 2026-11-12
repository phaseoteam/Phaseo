import type { Task } from "../shared/workspace";

export function handoffPrompt(task: Task, text: string) {
	if (!task.handoffFrom || task.nativeSessionId || task.nativeForkFrom || task.harness === "phaseo") return text;
	const messages = task.messages.slice(0, -1).filter(message => message.role === "user" || message.role === "assistant");
	if (!messages.length) return text;
	const history = messages.map(message => `${message.role}: ${message.text}`).join("\n\n");
	if (history.length > 100000) throw new Error("This conversation is too large for a text handoff. Create a summary before handing it off.");
	return `This conversation was handed off from ${task.handoffFrom}. The prior messages below provide context. Tool permissions and native settings come from this new session.\n\n<prior-conversation>\n${history}\n</prior-conversation>\n\nCurrent request:\n${text}`;
}
