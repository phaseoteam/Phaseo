import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import {
	fetchMonitorHistoryPageFromDb,
	getMonitorHistoryInitialData,
	type MonitorHistoryPageFilters,
} from "@/lib/fetchers/monitor/getMonitorHistory";

function parseNumber(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFilters(request: NextRequest): MonitorHistoryPageFilters {
	const params = request.nextUrl.searchParams;
	return {
		changeType: params.get("changeType") ?? undefined,
		commitLimit: parseNumber(params.get("commitLimit")),
		commitOffset: parseNumber(params.get("commitOffset")),
		model: params.get("model") ?? undefined,
		provider: params.get("provider") ?? undefined,
	};
}

function hasPageFilters(filters: MonitorHistoryPageFilters): boolean {
	return Boolean(
		filters.changeType ||
			filters.commitLimit !== undefined ||
			filters.commitOffset !== undefined ||
			filters.model ||
			filters.provider,
	);
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const filters = parseFilters(request);
		const payload = hasPageFilters(filters)
			? await fetchMonitorHistoryPageFromDb(filters)
			: await getMonitorHistoryInitialData();
		return NextResponse.json(payload, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/monitor/history] failed to fetch monitor history",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load monitor history" },
			{ status: 500 },
		);
	}
}
