import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getRecentModelUpdatesSplit } from "@/lib/fetchers/updates/getModelUpdates";

function parseBoolean(value: string | null): boolean {
	return value === "true" || value === "1";
}

function parseLimit(value: string | null, fallback: number, max: number): number {
	const parsed = value ? Number.parseInt(value, 10) : fallback;
	return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : fallback;
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const result = await getRecentModelUpdatesSplit({
			limit: parseLimit(request.nextUrl.searchParams.get("limit"), 5, 500),
			upcomingLimit: parseLimit(
				request.nextUrl.searchParams.get("upcomingLimit"),
				5,
				500,
			),
			includeAllPast: parseBoolean(
				request.nextUrl.searchParams.get("includeAllPast"),
			),
		});
		return NextResponse.json(result, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/updates/models] failed", error);
		return NextResponse.json(
			{ error: "Failed to load model updates" },
			{ status: 500 },
		);
	}
}
