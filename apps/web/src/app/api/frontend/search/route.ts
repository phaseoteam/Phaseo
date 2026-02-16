import { NextResponse } from "next/server";
import { getSearchDataCached } from "@/lib/fetchers/search/getSearchData";

export async function GET() {
	try {
		const data = await getSearchDataCached(false);
		return NextResponse.json(data, {
			headers: {
				"Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
			},
		});
	} catch (error) {
		console.error("[api/frontend/search] failed to fetch search data", error);
		return NextResponse.json(
			{ error: "Failed to load search data" },
			{ status: 500 }
		);
	}
}
