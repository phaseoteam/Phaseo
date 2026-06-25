import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getAppDetailsCached } from "@/lib/fetchers/apps/getAppDetails";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ appId: string }> },
) {
	try {
		const { appId } = await context.params;
		const app = await getAppDetailsCached(appId);
		return NextResponse.json(app, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/apps/detail] failed to fetch app", error);
		return NextResponse.json(
			{ error: "Failed to load app" },
			{ status: 500 },
		);
	}
}
