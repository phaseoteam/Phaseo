import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getRankingsIndexabilitySnapshot } from "@/lib/fetchers/rankings/getRankingsData";

export async function GET() {
	try {
		const indexability = await getRankingsIndexabilitySnapshot();
		return NextResponse.json(indexability, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/rankings/indexability] failed", error);
		return NextResponse.json(
			{ error: "Failed to load rankings indexability" },
			{ status: 500 },
		);
	}
}
