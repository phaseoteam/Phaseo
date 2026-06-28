import { useMemo } from "react";
import type { ChatThread } from "@/lib/indexeddb/chats";
import type { GroupedThreads } from "@/components/(chat)/ChatSidebar";

export function useGroupedChatThreads(
	threads: ChatThread[],
	groupingNowMs: number | null,
) {
	const sortedThreads = useMemo(() => {
		return [...threads].sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		);
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

		const fallbackAnchorMs = Date.parse(sortedThreads[0]?.updatedAt ?? "");
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
			const updatedMs = Date.parse(thread.updatedAt);
			if (!Number.isFinite(updatedMs)) {
				groups.older.push(thread);
				continue;
			}
			if (updatedMs >= startOfTodayMs) {
				groups.today.push(thread);
			} else if (updatedMs >= startOfYesterdayMs) {
				groups.yesterday.push(thread);
			} else if (updatedMs >= startOfWeekMs) {
				groups.week.push(thread);
			} else if (updatedMs >= startOfMonthMs) {
				groups.month.push(thread);
			} else {
				groups.older.push(thread);
			}
		}

		return groups;
	}, [groupingNowMs, sortedThreads]);

	return { sortedThreads, groupedThreads };
}
