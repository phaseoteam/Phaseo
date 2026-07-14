import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getMarketShare } from "@/lib/fetchers/rankings/getRankingsData";

type MarketShareDimension = "organization" | "provider";

function parseDimension(value: string | null): MarketShareDimension {
	return value === "provider" ? "provider" : "organization";
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const dimension = parseDimension(request.nextUrl.searchParams.get("dimension"));
		const timeRange = request.nextUrl.searchParams.get("timeRange") ?? "week";
		const result = await getMarketShare(dimension, timeRange);
		return NextResponse.json(result, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/rankings/market-share] failed", error);
		return NextResponse.json(
			{ error: "Failed to load market share" },
			{ status: 500 },
		);
	}
}
