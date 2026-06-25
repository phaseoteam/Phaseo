import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelLeaderboardMetaByIds } from "@/lib/fetchers/rankings/getRankingsData";

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
		const metaById = await getModelLeaderboardMetaByIds(parseModelIds(request));
		return NextResponse.json(metaById, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/models/leaderboard-meta] failed to fetch metadata",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load model metadata" },
			{ status: 500 },
		);
	}
}
