import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getMarketShareTimeseries } from "@/lib/fetchers/rankings/getRankingsData";

type MarketShareDimension = "organization" | "provider";

function parseDimension(value: string | null): MarketShareDimension {
	return value === "provider" ? "provider" : "organization";
}

function parseTopN(value: string | null): number {
	const parsed = value ? Number.parseInt(value, 10) : 8;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(50, parsed)) : 8;
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const dimension = parseDimension(request.nextUrl.searchParams.get("dimension"));
		const timeRange = request.nextUrl.searchParams.get("timeRange") ?? "week";
		const bucketSize = request.nextUrl.searchParams.get("bucketSize") ?? "day";
		const topN = parseTopN(request.nextUrl.searchParams.get("topN"));
		const result = await getMarketShareTimeseries(
			dimension,
			timeRange,
			bucketSize,
			topN,
		);
		return NextResponse.json(result, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/rankings/market-share-timeseries] failed", error);
		return NextResponse.json(
			{ error: "Failed to load market share timeseries" },
			{ status: 500 },
		);
	}
}
