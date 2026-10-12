import type { AgentActivity, Message } from "../../shared/workspace";

export function conversationTimeline(messages: Message[], activities: AgentActivity[]) {
	activities = activities.filter(activity => activity.type !== "usage" && !activity.nativeAgent);
	const entries: ({ kind: "message"; value: Message } | { kind: "activity"; value: AgentActivity })[] = [];
	const remaining = new Set(activities);
	for (const message of messages) {
		if (message.role === "user") {
			entries.push({ kind: "message", value: message });
			for (const activity of activities) if (activity.id.startsWith(`${message.id}:`)) {
				entries.push({ kind: "activity", value: activity }); remaining.delete(activity);
			}
		} else if (message.text.trim() || message.attachments?.length) entries.push({ kind: "message", value: message });
	}
	// Older activity pages may belong to a user message outside the loaded window.
	const legacy = [...Array.from(remaining, value => ({ kind: "activity" as const, value })), ...entries];
	return legacy.map((entry, index) => ({ entry, index })).sort((a, b) => (a.entry.value.timelineOrder ?? a.index) - (b.entry.value.timelineOrder ?? b.index) || a.index - b.index).map(({ entry }) => entry);
}
