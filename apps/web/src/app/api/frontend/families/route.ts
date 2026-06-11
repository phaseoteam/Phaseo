import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getAllFamiliesCached } from "@/lib/fetchers/families/getAllFamilies";

export async function GET() {
	try {
		const families = await getAllFamiliesCached();
		return NextResponse.json(families, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/families] failed to fetch families", error);
		return NextResponse.json(
			{ error: "Failed to load families" },
			{ status: 500 },
		);
	}
}
