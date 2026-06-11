import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelSubscriptionPlansCached } from "@/lib/fetchers/models/getModelSubscriptionPlans";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const plans = await getModelSubscriptionPlansCached(fullModelId, false);
		return NextResponse.json(plans, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/models/subscription-plans] failed to fetch subscription plans",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load model subscription plans" },
			{ status: 500 },
		);
	}
}
