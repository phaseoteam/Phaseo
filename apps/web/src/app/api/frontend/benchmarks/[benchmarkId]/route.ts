import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getBenchmarkCached } from "@/lib/fetchers/benchmarks/getBenchmark";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ benchmarkId: string }> },
) {
	try {
		const { benchmarkId } = await context.params;
		const benchmark = await getBenchmarkCached(benchmarkId, false);
		return NextResponse.json(benchmark, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/benchmarks/detail] failed to fetch benchmark", error);
		return NextResponse.json(
			{ error: "Failed to load benchmark" },
			{ status: 500 },
		);
	}
}
