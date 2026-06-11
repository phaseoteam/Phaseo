import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getPublicAppIdsCached } from "@/lib/fetchers/apps/getAppDetails";

export async function GET() {
	try {
		const appIds = await getPublicAppIdsCached();
		return NextResponse.json(appIds, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/apps/public-ids] failed to fetch app IDs", error);
		return NextResponse.json(
			{ error: "Failed to load public app IDs" },
			{ status: 500 },
		);
	}
}
