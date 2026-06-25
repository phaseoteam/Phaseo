import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getTimeseriesData } from "@/lib/fetchers/rankings/getRankingsData";

function parseTopN(value: string | null): number {
	const parsed = value ? Number.parseInt(value, 10) : 10;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(50, parsed)) : 10;
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const timeRange = request.nextUrl.searchParams.get("timeRange") ?? "week";
		const bucketSize = request.nextUrl.searchParams.get("bucketSize") ?? "hour";
		const topN = parseTopN(request.nextUrl.searchParams.get("topN"));
		const result = await getTimeseriesData(timeRange, bucketSize, topN);
		return NextResponse.json(result, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/rankings/timeseries] failed", error);
		return NextResponse.json(
			{ error: "Failed to load timeseries data" },
			{ status: 500 },
		);
	}
}
