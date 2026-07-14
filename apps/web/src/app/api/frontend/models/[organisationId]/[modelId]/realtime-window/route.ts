import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelRealtimeWindowStatsCached } from "@/lib/fetchers/models/getModelRealtimeWindowStats";

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	await connection();
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const rawDays = request.nextUrl.searchParams.get("days");
		const days = rawDays ? Number.parseInt(rawDays, 10) : 30;
		const stats = await getModelRealtimeWindowStatsCached(
			fullModelId,
			Number.isFinite(days) ? days : 30,
		);
		return NextResponse.json(stats, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/models/realtime-window] failed to fetch realtime stats",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load model realtime stats" },
			{ status: 500 },
		);
	}
}
