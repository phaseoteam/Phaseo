import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getPerformanceData } from "@/lib/fetchers/rankings/getRankingsData";

function parseHours(value: string | null): number {
	const parsed = value ? Number.parseInt(value, 10) : 24;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(24 * 30, parsed)) : 24;
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const hours = parseHours(request.nextUrl.searchParams.get("hours"));
		const result = await getPerformanceData(hours);
		return NextResponse.json(result, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/rankings/performance] failed", error);
		return NextResponse.json(
			{ error: "Failed to load performance data" },
			{ status: 500 },
		);
	}
}
