import { useMemo } from "react";
import type { ChatMessage, ChatThread } from "@/lib/indexeddb/chats";
import type { GroupedThreads } from "@/components/(chat)/ChatSidebar";

const activityTimeByMessages = new WeakMap<ChatMessage[], number | null>();

export function getChatThreadActivityTime(thread: ChatThread) {
	const cachedActivityTime = activityTimeByMessages.get(thread.messages);
	if (cachedActivityTime !== undefined) return cachedActivityTime;

	const messageTimes = thread.messages
		.map((message) => Date.parse(message.createdAt))
		.filter(Number.isFinite);
	if (messageTimes.length > 0) {
		const activityTime = Math.max(...messageTimes);
		activityTimeByMessages.set(thread.messages, activityTime);
		return activityTime;
	}
	const createdMs = Date.parse(thread.createdAt);
	if (Number.isFinite(createdMs)) {
		activityTimeByMessages.set(thread.messages, createdMs);
		return createdMs;
	}
	const updatedMs = Date.parse(thread.updatedAt);
	return Number.isFinite(updatedMs) ? updatedMs : null;
}

export function getChatThreadActivityDate(thread: ChatThread) {
	const timestamp = getChatThreadActivityTime(thread);
	return timestamp == null ? null : new Date(timestamp);
}

export function useGroupedChatThreads(
	threads: ChatThread[],
	groupingNowMs: number | null,
) {
	const sortedThreads = useMemo(() => {
		return [...threads].sort((a, b) => {
			const firstActivityMs = getChatThreadActivityTime(a) ?? 0;
			const secondActivityMs = getChatThreadActivityTime(b) ?? 0;
			if (secondActivityMs !== firstActivityMs) {
				return secondActivityMs - firstActivityMs;
			}
			return b.updatedAt.localeCompare(a.updatedAt);
		});
	}, [threads]);

	const groupedThreads = useMemo(() => {
		const groups: GroupedThreads = {
			pinned: [],
			today: [],
			yesterday: [],
			week: [],
			month: [],
			older: [],
		};

		const fallbackAnchorMs = sortedThreads[0]
			? getChatThreadActivityTime(sortedThreads[0])
			: null;
		const anchorMs =
			groupingNowMs ?? (Number.isFinite(fallbackAnchorMs) ? fallbackAnchorMs : null);
		if (anchorMs == null) {
			return groups;
		}

		const now = new Date(anchorMs);
		const startOfToday = new Date(now);
		startOfToday.setHours(0, 0, 0, 0);
		const startOfYesterday = new Date(startOfToday);
		startOfYesterday.setDate(startOfToday.getDate() - 1);
		const startOfWeek = new Date(startOfToday);
		const weekday = (startOfToday.getDay() + 6) % 7;
		startOfWeek.setDate(startOfToday.getDate() - weekday);
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const startOfTodayMs = startOfToday.getTime();
		const startOfYesterdayMs = startOfYesterday.getTime();
		const startOfWeekMs = startOfWeek.getTime();
		const startOfMonthMs = startOfMonth.getTime();

		for (const thread of sortedThreads) {
			if (thread.pinned) {
				groups.pinned.push(thread);
				continue;
			}
			const activityMs = getChatThreadActivityTime(thread);
			if (activityMs == null) {
				groups.older.push(thread);
				continue;
			}
			if (activityMs >= startOfTodayMs) {
				groups.today.push(thread);
			} else if (activityMs >= startOfYesterdayMs) {
				groups.yesterday.push(thread);
			} else if (activityMs >= startOfWeekMs) {
				groups.week.push(thread);
			} else if (activityMs >= startOfMonthMs) {
				groups.month.push(thread);
			} else {
				groups.older.push(thread);
			}
		}

		return groups;
	}, [groupingNowMs, sortedThreads]);

	return { sortedThreads, groupedThreads };
}
