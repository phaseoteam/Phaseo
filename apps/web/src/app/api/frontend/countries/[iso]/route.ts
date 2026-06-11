import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getCountrySummaryByIsoCached } from "@/lib/fetchers/countries/getCountrySummary";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ iso: string }> },
) {
	try {
		const { iso } = await context.params;
		const country = await getCountrySummaryByIsoCached(iso, false);
		return NextResponse.json(country ?? null, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/countries/detail] failed to fetch country", error);
		return NextResponse.json(
			{ error: "Failed to load country" },
			{ status: 500 },
		);
	}
}
