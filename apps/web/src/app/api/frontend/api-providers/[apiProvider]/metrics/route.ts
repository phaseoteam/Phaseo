import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getProviderMetrics } from "@/lib/fetchers/api-providers/getProviderMetrics";

function parseHours(value: string | null, fallback: number): number {
	const parsed = value ? Number.parseInt(value, 10) : fallback;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(24 * 31, parsed)) : fallback;
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ apiProvider: string }> },
) {
	await connection();
	try {
		const { apiProvider } = await context.params;
		const hours = parseHours(request.nextUrl.searchParams.get("hours"), 24 * 7);
		const metrics = await getProviderMetrics(apiProvider, hours);
		return NextResponse.json(metrics, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/api-providers/metrics] failed to fetch provider metrics",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load provider metrics" },
			{ status: 500 },
		);
	}
}
