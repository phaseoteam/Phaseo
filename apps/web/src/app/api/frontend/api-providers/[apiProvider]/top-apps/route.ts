import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getTopAppsCached } from "@/lib/fetchers/api-providers/api-provider/top-apps";

type Period = "day" | "week" | "month";

function parsePeriod(value: string | null): Period {
	return value === "week" || value === "month" ? value : "day";
}

function parseCount(value: string | null, fallback: number): number {
	const parsed = value ? Number.parseInt(value, 10) : fallback;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : fallback;
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ apiProvider: string }> },
) {
	await connection();
	try {
		const { apiProvider } = await context.params;
		const period = parsePeriod(request.nextUrl.searchParams.get("period"));
		const count = parseCount(request.nextUrl.searchParams.get("count"), 20);
		const apps = await getTopAppsCached(apiProvider, period, count);
		return NextResponse.json(apps, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/api-providers/top-apps] failed to fetch apps",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load provider top apps" },
			{ status: 500 },
		);
	}
}
