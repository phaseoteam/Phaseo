import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getRankings } from "@/lib/fetchers/rankings/getRankingsData";

function parseLimit(value: string | null): number {
	const parsed = value ? Number.parseInt(value, 10) : 50;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(500, parsed)) : 50;
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const timeRange = request.nextUrl.searchParams.get("timeRange") ?? "week";
		const metric = request.nextUrl.searchParams.get("metric") ?? "tokens";
		const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
		const result = await getRankings(timeRange, metric, limit);
		return NextResponse.json(result, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/rankings/model-rankings] failed", error);
		return NextResponse.json(
			{ error: "Failed to load model rankings" },
			{ status: 500 },
		);
	}
}
