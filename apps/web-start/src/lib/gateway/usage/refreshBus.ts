"use client";

import type { UsageLogsViewKey } from "./timeRange";

type RefreshHandler = () => Promise<void>;

const refreshHandlers = new Map<UsageLogsViewKey, RefreshHandler>();

export function registerUsageViewRefresher(
	view: UsageLogsViewKey,
	handler: RefreshHandler,
): () => void {
	refreshHandlers.set(view, handler);
	return () => {
		if (refreshHandlers.get(view) === handler) {
			refreshHandlers.delete(view);
		}
	};
}

export async function runUsageViewRefresh(view: UsageLogsViewKey): Promise<void> {
	const handler = refreshHandlers.get(view);
	if (!handler) return;
	await handler();
}
