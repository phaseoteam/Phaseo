import { formatDuration } from "@phaseo/app-kit/format";
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
export type Burst = { previous: boolean; next: boolean; continuesSteer: boolean };
/**
 * Your messages sent back to back, with no answer between them, stack as one burst: `previous` and `next` say a
 * neighbour belongs to it, and `continuesSteer` that the steer label above already covers this message.
 */
export function userBursts(turns: ReturnType<typeof conversationTurns>): (Burst | undefined)[] {
	const own = (turn?: ReturnType<typeof conversationTurns>[number]) => Boolean(turn?.user && !turn.user.notice && !turn.user.autopilot && turn.user.delivery !== "subagent");
	const unanswered = turns.map(turn => turn.entries.every(entry => entry.kind === "activity" && entry.value.type === "usage"));
	const joined = turns.map((turn, index) => own(turn) && unanswered[index] && own(turns[index + 1]));
	return turns.map((turn, index) => {
		const previous = index > 0 && joined[index - 1], next = joined[index];
		if (!previous && !next) return undefined;
		return { previous, next, continuesSteer: previous && turn.user?.delivery === "steer" && turns[index - 1].user?.delivery === "steer" };
	});
}
export function turnDuration(user?: Message) {
	if (!user?.startedAt || !user.completedAt) return "Worked";
	const milliseconds = Date.parse(user.completedAt) - Date.parse(user.startedAt);
	if (!Number.isFinite(milliseconds) || milliseconds < 0) return "Worked";
	return `Worked for ${formatDuration(milliseconds)}`;
}
