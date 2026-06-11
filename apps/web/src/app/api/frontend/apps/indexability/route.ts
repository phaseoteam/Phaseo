import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getAppsIndexabilitySnapshot } from "@/lib/fetchers/rankings/getRankingsData";

export async function GET() {
	try {
		const indexability = await getAppsIndexabilitySnapshot();
		return NextResponse.json(indexability, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/apps/indexability] failed to fetch indexability",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load apps indexability" },
			{ status: 500 },
		);
	}
}
