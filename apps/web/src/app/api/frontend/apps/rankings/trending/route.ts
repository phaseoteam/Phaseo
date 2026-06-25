import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getTrendingApps } from "@/lib/fetchers/rankings/getRankingsData";

function parseLimit(value: string | null): number {
	const parsed = value ? Number.parseInt(value, 10) : 20;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(500, parsed)) : 20;
}

function parseMinWeekTokens(value: string | null): number {
	const parsed = value ? Number.parseFloat(value) : 0;
	return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
		const minWeekTokens = parseMinWeekTokens(
			request.nextUrl.searchParams.get("minWeekTokens"),
		);
		const result = await getTrendingApps(limit, minWeekTokens);
		return NextResponse.json(result, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/apps/rankings/trending] failed to fetch apps",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load trending apps" },
			{ status: 500 },
		);
	}
}
