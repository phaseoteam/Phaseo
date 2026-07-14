import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getPublicMarketplacePresetDetailCached } from "@/lib/fetchers/gateway/marketplace";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ presetId: string }> },
) {
	try {
		const { presetId } = await context.params;
		const detail = await getPublicMarketplacePresetDetailCached(presetId);
		return NextResponse.json(detail, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/gateway/marketplace/presets/detail] failed to fetch preset",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load marketplace preset" },
			{ status: 500 },
		);
	}
}
