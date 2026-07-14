"use server";

import { fetchFrontendMonitorHistoryPage } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import {
	type MonitorHistoryDbPage,
	type MonitorHistoryPageFilters,
} from "@/lib/fetchers/monitor/getMonitorHistory";

export type MonitorHistoryPageActionResult =
	| {
		ok: true;
		page: MonitorHistoryDbPage;
	}
	| {
		error: string;
		ok: false;
	};

export async function loadMonitorHistoryPageAction(
	filters: MonitorHistoryPageFilters = {},
): Promise<MonitorHistoryPageActionResult> {
	try {
		const page = await fetchFrontendMonitorHistoryPage(filters);
		return { ok: true, page };
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error ? error.message : "Failed to load monitor history.",
		};
	}
}
