import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getCountrySummariesCached } from "@/lib/fetchers/countries/getCountrySummaries";

export async function GET() {
	try {
		const countries = await getCountrySummariesCached(false);
		return NextResponse.json(countries, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/countries] failed to fetch countries", error);
		return NextResponse.json(
			{ error: "Failed to load countries" },
			{ status: 500 },
		);
	}
}
