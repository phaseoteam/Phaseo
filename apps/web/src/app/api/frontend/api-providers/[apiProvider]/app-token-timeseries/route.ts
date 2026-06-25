import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getProviderAppTokenTimeseries } from "@/lib/fetchers/api-providers/api-provider/providerAppTokenTimeseries";

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
		const days = parseCount(request.nextUrl.searchParams.get("days"), 30);
		const topApps = parseCount(request.nextUrl.searchParams.get("topApps"), 20);
		const timeseries = await getProviderAppTokenTimeseries(apiProvider, {
			days,
			topApps,
		});
		return NextResponse.json(timeseries, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/api-providers/app-token-timeseries] failed to fetch timeseries",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load provider app token timeseries" },
			{ status: 500 },
		);
	}
}
