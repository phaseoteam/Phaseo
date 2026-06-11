import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelPerformanceMetricsCached } from "@/lib/fetchers/models/getModelPerformance";

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	await connection();
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const rawWindow = request.nextUrl.searchParams.get("windowHours");
		const windowHours = rawWindow ? Number.parseInt(rawWindow, 10) : 24;
		const metrics = await getModelPerformanceMetricsCached(
			fullModelId,
			false,
			Number.isFinite(windowHours) ? windowHours : 24,
		);
		return NextResponse.json(metrics, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/models/performance] failed to fetch performance",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load model performance" },
			{ status: 500 },
		);
	}
}
