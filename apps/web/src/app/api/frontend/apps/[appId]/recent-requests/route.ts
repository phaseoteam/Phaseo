import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getRecentAppRequests } from "@/lib/fetchers/apps/getAppUsageOverTime";

function parseLimit(value: string | null): number {
	const parsed = value ? Number.parseInt(value, 10) : 10;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 10;
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ appId: string }> },
) {
	await connection();
	try {
		const { appId } = await context.params;
		const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
		const rows = await getRecentAppRequests(appId, limit);
		return NextResponse.json(rows, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/apps/recent-requests] failed to fetch requests",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load recent app requests" },
			{ status: 500 },
		);
	}
}
