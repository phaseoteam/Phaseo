import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const overview = await getModelOverviewCached(fullModelId, false);
		return NextResponse.json(overview, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/overview] failed to fetch model", error);
		return NextResponse.json(
			{ error: "Failed to load model overview" },
			{ status: 500 },
		);
	}
}
