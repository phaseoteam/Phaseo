import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getAllSubscriptionPlansCached } from "@/lib/fetchers/subscription-plans/getAllSubscriptionPlans";

export async function GET() {
	try {
		const plans = await getAllSubscriptionPlansCached();
		return NextResponse.json(plans, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/subscription-plans] failed to fetch subscription plans",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load subscription plans" },
			{ status: 500 },
		);
	}
}
