import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getSubscriptionPlanCached } from "@/lib/fetchers/subscription-plans/getSubscriptionPlan";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ planId: string }> },
) {
	try {
		const { planId } = await context.params;
		const plan = await getSubscriptionPlanCached(planId, false);
		return NextResponse.json(plan, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/subscription-plans/detail] failed to fetch subscription plan",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load subscription plan" },
			{ status: 500 },
		);
	}
}
