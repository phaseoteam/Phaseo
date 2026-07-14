import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getTopApps } from "@/lib/fetchers/rankings/getRankingsData";

function parseLimit(value: string | null): number {
	const parsed = value ? Number.parseInt(value, 10) : 20;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(500, parsed)) : 20;
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const timeRange = request.nextUrl.searchParams.get("timeRange") ?? "week";
		const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
		const result = await getTopApps(timeRange, limit);
		return NextResponse.json(result, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/apps/rankings/top] failed to fetch apps", error);
		return NextResponse.json(
			{ error: "Failed to load top apps" },
			{ status: 500 },
		);
	}
}
