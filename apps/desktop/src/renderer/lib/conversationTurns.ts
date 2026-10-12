import type { AgentActivity, Message } from "../../shared/workspace";
import { conversationTimeline } from "./conversationTimeline";
export type TurnEntry = ReturnType<typeof conversationTimeline>[number];
export function conversationTurns(messages: Message[], activities: AgentActivity[]) {
	const turns: { id: string; user?: Message; entries: TurnEntry[] }[] = [];
	for (const entry of conversationTimeline(messages, activities)) {
		if (entry.kind === "message" && entry.value.role === "user") turns.push({ id: entry.value.id, user: entry.value, entries: [] });
		else { if (!turns.length) turns.push({ id: entry.value.id, entries: [] }); turns.at(-1)!.entries.push(entry); }
	}
	return turns;
}
export function turnDuration(user?: Message) {
	if (!user?.startedAt || !user.completedAt) return "Worked";
	const milliseconds = Date.parse(user.completedAt) - Date.parse(user.startedAt);
	if (!Number.isFinite(milliseconds) || milliseconds < 0) return "Worked";
	const seconds = Math.max(1, Math.round(milliseconds / 1000));
	return `Worked for ${seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}`;
}
