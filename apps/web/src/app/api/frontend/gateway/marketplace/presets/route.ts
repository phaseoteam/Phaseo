import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getPublicMarketplacePresetsCached } from "@/lib/fetchers/gateway/marketplace";

export async function GET() {
	try {
		const presets = await getPublicMarketplacePresetsCached();
		return NextResponse.json(presets, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/gateway/marketplace/presets] failed to fetch presets",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load marketplace presets" },
			{ status: 500 },
		);
	}
}
