import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getSupportedModelsStatsCached } from "@/lib/fetchers/landing/sign-in/getSupportedModelsStats";

function parseBoolean(value: string | null): boolean {
	return value === "1" || value === "true";
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const stats = await getSupportedModelsStatsCached(
			parseBoolean(request.nextUrl.searchParams.get("includeHidden")),
		);
		return NextResponse.json(stats, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch {
		return NextResponse.json(
			{ error: "Failed to load supported model stats" },
			{ status: 500 },
		);
	}
}
