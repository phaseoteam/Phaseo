import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelAppsCached } from "@/lib/fetchers/models/getModelApps";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const apps = await getModelAppsCached(fullModelId, false);
		return NextResponse.json(apps, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/apps] failed to fetch model apps", error);
		return NextResponse.json(
			{ error: "Failed to load model apps" },
			{ status: 500 },
		);
	}
}
