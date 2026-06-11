import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getLatestUpdateCards } from "@/lib/fetchers/updates/getLatestUpdates";

function parseLimit(value: string | null, fallback: number, max: number): number {
	const parsed = value ? Number.parseInt(value, 10) : fallback;
	return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : fallback;
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const cards = await getLatestUpdateCards(
			parseLimit(request.nextUrl.searchParams.get("limit"), 5, 32),
		);
		return NextResponse.json(cards, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch {
		return NextResponse.json(
			{ error: "Failed to load update cards" },
			{ status: 500 },
		);
	}
}
