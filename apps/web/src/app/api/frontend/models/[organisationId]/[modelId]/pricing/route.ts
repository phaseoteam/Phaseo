import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelPricingCached } from "@/lib/fetchers/models/getModelPricing";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const pricing = await getModelPricingCached(fullModelId, false);
		return NextResponse.json(pricing, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/pricing] failed to fetch pricing", error);
		return NextResponse.json(
			{ error: "Failed to load model pricing" },
			{ status: 500 },
		);
	}
}
