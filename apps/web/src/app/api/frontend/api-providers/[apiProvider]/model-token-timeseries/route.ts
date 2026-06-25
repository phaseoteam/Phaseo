import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getProviderModelTokenTimeseries } from "@/lib/fetchers/api-providers/api-provider/providerTokenTimeseries";

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
		const topModels = parseCount(
			request.nextUrl.searchParams.get("topModels"),
			8,
		);
		const timeseries = await getProviderModelTokenTimeseries(apiProvider, {
			days,
			topModels,
		});
		return NextResponse.json(timeseries, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/api-providers/model-token-timeseries] failed to fetch timeseries",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load provider model token timeseries" },
			{ status: 500 },
		);
	}
}
