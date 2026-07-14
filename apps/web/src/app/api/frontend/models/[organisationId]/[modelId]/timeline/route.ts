import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelTimelineCached } from "@/lib/fetchers/models/getModelTimeline";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const timeline = await getModelTimelineCached(fullModelId, false);
		return NextResponse.json(timeline, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/timeline] failed to fetch timeline", error);
		return NextResponse.json(
			{ error: "Failed to load model timeline" },
			{ status: 500 },
		);
	}
}
