import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import {
	getAppUsageOverTime,
	type RangeKey,
} from "@/lib/fetchers/apps/getAppUsageOverTime";

const RANGE_KEYS = new Set(["1h", "1d", "1w", "4w", "1m", "1y"]);

function parseRange(value: string | null): RangeKey {
	return RANGE_KEYS.has(value ?? "") ? (value as RangeKey) : "4w";
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ appId: string }> },
) {
	await connection();
	try {
		const { appId } = await context.params;
		const range = parseRange(request.nextUrl.searchParams.get("range"));
		const rows = await getAppUsageOverTime(appId, range);
		return NextResponse.json(rows, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/apps/usage] failed to fetch app usage", error);
		return NextResponse.json(
			{ error: "Failed to load app usage" },
			{ status: 500 },
		);
	}
}
