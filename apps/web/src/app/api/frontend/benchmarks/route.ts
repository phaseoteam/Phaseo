import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getAllBenchmarksCached } from "@/lib/fetchers/benchmarks/getAllBenchmarks";

export async function GET(request: NextRequest) {
	await connection();
	try {
		const sorted = request.nextUrl.searchParams.get("sorted") === "true";
		const benchmarks = await getAllBenchmarksCached(sorted);
		return NextResponse.json(benchmarks, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/benchmarks] failed to fetch benchmarks", error);
		return NextResponse.json(
			{ error: "Failed to load benchmarks" },
			{ status: 500 },
		);
	}
}
