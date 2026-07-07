import { NextResponse } from "next/server";
import {
	compactSearchData,
	getSearchDataCached,
} from "@/lib/fetchers/search/getSearchData";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";

export async function GET() {
	try {
		const data = await getSearchDataCached(false);
		return NextResponse.json(compactSearchData(data), {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/search] failed to fetch search data", error);
		return NextResponse.json(
			{ error: "Failed to load search data" },
			{ status: 500 }
		);
	}
}
