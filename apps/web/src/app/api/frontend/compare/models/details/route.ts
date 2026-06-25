import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getComparisonModelsCached } from "@/lib/fetchers/compare/getComparisonModels";

function parseModelIds(request: NextRequest): string[] {
	return request.nextUrl.searchParams
		.getAll("modelId")
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const models = await getComparisonModelsCached(parseModelIds(request), false);
		return NextResponse.json(models, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/compare/models/details] failed to fetch model details",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load comparison models" },
			{ status: 500 },
		);
	}
}
