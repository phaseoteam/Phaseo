import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getAppImageUrlsByIds } from "@/lib/fetchers/rankings/getRankingsData";

function parseIds(request: NextRequest): string[] {
	return request.nextUrl.searchParams
		.getAll("id")
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const imageUrlsById = await getAppImageUrlsByIds(parseIds(request));
		return NextResponse.json(imageUrlsById, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/apps/images] failed to fetch app images", error);
		return NextResponse.json(
			{ error: "Failed to load app images" },
			{ status: 500 },
		);
	}
}
