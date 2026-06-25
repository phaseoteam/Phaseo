import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getFreeRouterOverview } from "@/lib/fetchers/models/getFreeRouterOverview";

export async function GET() {
	try {
		const overview = await getFreeRouterOverview();
		return NextResponse.json(overview, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/models/free-router] failed to fetch free router overview",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load free router overview" },
			{ status: 500 },
		);
	}
}
