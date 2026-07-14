import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getPricingModelsCached } from "@/lib/fetchers/pricing/getPricingModels";

export async function GET() {
	try {
		const models = await getPricingModelsCached(false);
		return NextResponse.json(models, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/pricing/models] failed to fetch pricing models",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load pricing models" },
			{ status: 500 },
		);
	}
}
