import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getProviderNamesByIds } from "@/lib/fetchers/rankings/getRankingsData";

function parseValues(request: NextRequest, key: string): string[] {
	return request.nextUrl.searchParams
		.getAll(key)
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const result = await getProviderNamesByIds(parseValues(request, "providerId"));
		return NextResponse.json(result, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/rankings/provider-names] failed", error);
		return NextResponse.json(
			{ error: "Failed to load provider names" },
			{ status: 500 },
		);
	}
}
