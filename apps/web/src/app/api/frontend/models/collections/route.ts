import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelCollections } from "@/lib/fetchers/collections/getCollections";

function parseLimit(value: string | null): number {
	const parsed = value ? Number.parseInt(value, 10) : 10;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(200, parsed)) : 10;
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
		const collections = await getModelCollections(limit);
		return NextResponse.json(collections, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/models/collections] failed to fetch model collections",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load model collections" },
			{ status: 500 },
		);
	}
}
