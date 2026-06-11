import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelBenchmarkHighlights } from "@/lib/fetchers/models/getModelBenchmarkData";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const highlights = await getModelBenchmarkHighlights(fullModelId, false);
		return NextResponse.json(highlights, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/models/benchmark-highlights] failed to fetch benchmarks",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load model benchmark highlights" },
			{ status: 500 },
		);
	}
}
