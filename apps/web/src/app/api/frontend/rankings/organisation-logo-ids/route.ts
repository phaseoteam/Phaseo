import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getOrganisationLogoIdsByNames } from "@/lib/fetchers/rankings/getRankingsData";

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
		const result = await getOrganisationLogoIdsByNames(parseValues(request, "name"));
		return NextResponse.json(result, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/rankings/organisation-logo-ids] failed", error);
		return NextResponse.json(
			{ error: "Failed to load organisation logo IDs" },
			{ status: 500 },
		);
	}
}
