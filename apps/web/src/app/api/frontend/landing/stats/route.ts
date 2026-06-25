import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import getDbStats from "@/lib/fetchers/landing/dbStats";
import { getPublicMonthlyTokenTotal } from "@/lib/fetchers/rankings/getRankingsData";

export type FrontendLandingStats = {
	db: Awaited<ReturnType<typeof getDbStats>>;
	monthlyTokenTotal: number;
};

export async function GET() {
	try {
		const [db, monthlyTokenTotal] = await Promise.all([
			getDbStats(),
			getPublicMonthlyTokenTotal(),
		]);
		return NextResponse.json(
			{ db, monthlyTokenTotal } satisfies FrontendLandingStats,
			{ headers: PUBLIC_CDN_CACHE_HEADERS },
		);
	} catch {
		return NextResponse.json(
			{ error: "Failed to load landing stats" },
			{ status: 500 },
		);
	}
}
