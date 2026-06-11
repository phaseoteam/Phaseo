import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getLatestModelUpdateCards } from "@/lib/fetchers/updates/getLatestModelUpdates";

function parseLimit(value: string | null, fallback: number, max: number): number {
	const parsed = value ? Number.parseInt(value, 10) : fallback;
	return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : fallback;
}

function parseBoolean(value: string | null): boolean {
	return value === "true" || value === "1";
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const cards = await getLatestModelUpdateCards(
			parseLimit(request.nextUrl.searchParams.get("limit"), 5, 64),
			parseBoolean(request.nextUrl.searchParams.get("includeHidden")),
		);
		return NextResponse.json(cards, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch {
		return NextResponse.json(
			{ error: "Failed to load model update cards" },
			{ status: 500 },
		);
	}
}
