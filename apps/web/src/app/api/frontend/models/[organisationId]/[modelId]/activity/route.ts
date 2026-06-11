import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelPerformanceActivitySnapshotCached } from "@/lib/fetchers/models/getModelPerformance";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const activity = await getModelPerformanceActivitySnapshotCached(
			fullModelId,
			false,
		);
		return NextResponse.json(activity, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/activity] failed to fetch activity", error);
		return NextResponse.json(
			{ error: "Failed to load model activity" },
			{ status: 500 },
		);
	}
}
