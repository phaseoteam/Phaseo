import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelTokenTrajectoryCached } from "@/lib/fetchers/models/getModelTokenTrajectory";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const trajectory = await getModelTokenTrajectoryCached(fullModelId, false);
		return NextResponse.json(trajectory, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/models/token-trajectory] failed to fetch token trajectory",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load model token trajectory" },
			{ status: 500 },
		);
	}
}
