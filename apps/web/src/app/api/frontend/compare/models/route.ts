import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { loadCompareModelsCached } from "@/lib/fetchers/compare/loadCompareModels";

export async function GET() {
	try {
		const models = await loadCompareModelsCached(false);
		return NextResponse.json(models, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/compare/models] failed to fetch models", error);
		return NextResponse.json(
			{ error: "Failed to load compare models" },
			{ status: 500 },
		);
	}
}
