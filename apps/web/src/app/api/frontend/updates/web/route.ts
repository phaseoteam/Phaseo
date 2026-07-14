import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getWebUpdatesCached } from "@/lib/fetchers/updates/getWebUpdates";

export async function GET(request: NextRequest) {
	await connection();
	try {
		const rawLimit = request.nextUrl.searchParams.get("limit");
		const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 100;
		const updates = await getWebUpdatesCached(Number.isFinite(limit) ? limit : 100);
		return NextResponse.json(updates, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/updates/web] failed to fetch updates", error);
		return NextResponse.json(
			{ error: "Failed to load web updates" },
			{ status: 500 },
		);
	}
}
